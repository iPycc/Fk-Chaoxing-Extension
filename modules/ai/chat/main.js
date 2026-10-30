// In-page assistant controller.
const AIChat = {
  root: null, questions: [], history: [], contextQuestions: [], lastReferenceKeys: [], discussionMode: false, pending: null, selected: new Set(),
  lastUsage: null, contextError: null, currentConfig: null, contextInfo: null, infoPort: null, infoRevision: 0,
  quickEffort: null, historyKey: '', opening: null, launcher: null,
  snapshotId: '',
  pageKey() { return `aiChat:${location.origin}${location.pathname}${location.search}`; },
  el(id) { return this.root?.getElementById(id); },
  clampPosition() {
    const host = this.root?.host;
    if (!host || host.classList.contains('expanded')) return;
    const rect = host.getBoundingClientRect();
    if (rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight) return;
    host.style.left = `${Math.max(0, Math.min(innerWidth - rect.width, rect.left))}px`;
    host.style.top = `${Math.max(0, Math.min(innerHeight - rect.height, rect.top))}px`;
    host.style.right = 'auto'; host.style.bottom = 'auto';
  },
  bindDragging(header) {
    const host = this.root.host;
    header.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button, select, label') || host.classList.contains('expanded')) return;
      const rect = host.getBoundingClientRect();
      const start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      header.setPointerCapture(event.pointerId);
      const move = next => {
        const bounds = host.getBoundingClientRect();
        host.style.left = `${Math.max(0, Math.min(innerWidth - bounds.width, start.left + next.clientX - start.x))}px`;
        host.style.top = `${Math.max(0, Math.min(innerHeight - bounds.height, start.top + next.clientY - start.y))}px`;
        host.style.right = 'auto'; host.style.bottom = 'auto';
      };
      const end = () => {
        header.removeEventListener('pointermove', move);
        header.removeEventListener('pointerup', end);
        header.removeEventListener('lostpointercapture', end);
      };
      header.addEventListener('pointermove', move);
      header.addEventListener('pointerup', end);
      header.addEventListener('lostpointercapture', end);
    });
    window.addEventListener('resize', () => this.clampPosition());
  },
  init() {
    if (window !== window.top) return;
    this.mountLauncher();
    const check = async () => {
      if (this.root) { observer.disconnect(); return; }
      if (this.opening) return;
      this.opening = this.scanQuestions();
      try {
        await this.opening;
        if (this.questions.length) { await this.open(true); observer.disconnect(); }
      } catch (_) { /* The question frame may still be loading. */ }
      finally { this.opening = null; }
    };
    const observer = new MutationObserver(() => {
      clearTimeout(this.initTimer);
      this.initTimer = setTimeout(check, 400);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('load', event => { if (event.target?.tagName === 'IFRAME') check(); }, true);
    check();
  },
  mountLauncher() {
    if (this.launcher) return;
    const host = document.createElement('div');
    host.id = 'fk-ai-chat-launcher';
    host.style.cssText = 'position:fixed!important;right:24px!important;bottom:24px!important;z-index:2147483641!important;width:48px!important;height:48px!important;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>:host([hidden]){display:none!important}button{display:flex;align-items:center;justify-content:center;width:48px;height:48px;padding:8px;border:1px solid #d8dadd;border-radius:12px;background:white;cursor:pointer;box-shadow:0 2px 8px #0002}button:hover{background:#f3f4f6}button:focus-visible{outline:2px solid #70757a;outline-offset:2px}img{width:32px;height:32px;object-fit:contain}</style><button title="打开 AI 对话" aria-label="打开 AI 对话"><img src="${chrome.runtime.getURL('icons/chaoxing.png')}" alt="超星"></button>`;
    root.querySelector('button').onclick = () => this.open().catch(error => this.task(error.message, 'error'));
    document.body.append(host);
    this.launcher = host;
  },
  async open(automatic = false) {
    if (window !== window.top) return;
    if (!this.root) this.mount();
    this.root.host.hidden = false;
    if (this.launcher) this.launcher.hidden = true;
    if (!automatic && this.root.host.classList.contains('minimized')) this.el('minimize').click();
    if (this.pending) { if (!automatic) this.el('input').focus(); return; }
    const key = this.pageKey();
    const data = await chrome.storage.local.get(key);
    if (this.historyKey !== key) {
      this.historyKey = key;
      this.restoreSession(data[key]);
      if (this.isDiscussion()) { this.el('all').checked = false; this.selected.clear(); }
    }
    this.renderHistory();
    await this.refresh();
    if (!automatic) this.el('input').focus();
  },
  mount() {
    const host = document.createElement('div');
    host.id = 'fk-ai-chat';
    document.body.append(host);
    this.root = host.attachShadow({ mode: 'open' });
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = chrome.runtime.getURL('modules/ai/chat/main.css');
    this.root.append(css);
    const panel = document.createElement('section');
    panel.className = 'shell';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'AI 对话');
    panel.innerHTML = `<header><strong>AI 对话</strong><select id="model-select" aria-label="当前模型" title="当前模型"></select>
      <label class="effort-label" for="effort">思考等级</label><select id="effort" aria-label="思考等级">
      <option value="">模型默认</option><option value="none">不思考</option><option value="low">Low</option>
      <option value="medium">Medium</option><option value="high">High</option><option value="xhigh">XHigh</option><option value="max">Max</option></select>
      <button id="minimize" title="收起对话" aria-label="收起对话" aria-expanded="true">−</button>
      <button id="maximize" title="放大对话" aria-label="放大对话" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1"/></svg></button><button id="close" title="关闭" aria-label="关闭">×</button></header>
      <div class="layout"><main><div id="feed" aria-live="polite"></div><div class="composer">
      <details id="question-panel"><summary id="context-summary">引用题目</summary>
      <div class="context-tools"><label class="all"><input type="checkbox" id="all" checked>整页题目</label><button id="refresh">刷新题目</button></div>
      <div id="questions"></div><div class="target-row"><label for="target">作答目标</label><select id="target"><option value="all">所选全部题目</option></select></div>
      <p id="context-note"></p>
      <details id="preview-panel"><summary>查看发送内容</summary><pre id="preview-text"></pre></details></details>
      <div id="references"></div><div id="session-references"></div>
      <p id="usage-summary">上下文：—</p>
      <p id="context-warning" role="status" hidden></p><textarea id="input" rows="3" placeholder="留空可直接生成并填写答案；讨论中确认的答案可直接填入…"></textarea>
      <div class="actions"><button id="clear-context" title="清除本页对话记录，保留题目引用" disabled>清空上下文</button><button id="preview">预览</button><button id="regenerate" title="重新执行上一轮操作">重新生成</button><button id="stop" hidden>停止</button><button id="fill" disabled>填入答案</button><button id="send">生成答案</button></div><div id="status" role="status" hidden></div></main></div>`;
    this.root.append(panel);
    this.el('minimize').onclick = () => {
      const minimized = host.classList.toggle('minimized');
      this.el('minimize').textContent = minimized ? '+' : '−';
      this.el('minimize').setAttribute('aria-expanded', String(!minimized));
      this.el('minimize').title = minimized ? '展开对话' : '收起对话';
      this.el('minimize').setAttribute('aria-label', this.el('minimize').title);
      this.clampPosition();
    };
    this.el('maximize').onclick = () => {
      if (host.classList.contains('minimized')) this.el('minimize').click();
      const expanded = host.classList.toggle('expanded');
      this.el('maximize').innerHTML = expanded
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8V4h12v12h-4"/><rect x="4" y="8" width="12" height="12" rx="1"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1"/></svg>';
      this.el('maximize').setAttribute('aria-pressed', String(expanded));
      this.el('maximize').title = expanded ? '还原对话大小' : '放大对话';
      this.el('maximize').setAttribute('aria-label', this.el('maximize').title);
      this.clampPosition();
    };
    this.el('close').onclick = () => { host.hidden = true; if (this.launcher) this.launcher.hidden = false; };
    this.bindDragging(panel.querySelector('header'));
    this.el('refresh').onclick = () => this.refresh();
    this.el('model-select').onchange = async event => {
      await chrome.storage.local.set({ activeAiProfileId: event.target.value });
      this.quickEffort = null;
      const config = await AIApi.loadConfig();
      this.el('effort').value = config.reasoningEffort;
      this.loadContextInfo(config);
    };
    this.el('effort').onchange = event => { this.quickEffort = event.target.value; };
    this.el('all').onchange = event => {
      this.selected = event.target.checked
        ? new Set(this.questions.map((_, index) => index)) : new Set();
      this.renderQuestions();
    };
    this.el('target').onchange = () => this.updateContextSummary();
    this.el('send').onclick = () => this.send();
    this.el('fill').onclick = () => this.applyCached();
    this.el('input').oninput = () => this.updateActions();
    this.el('input').onkeydown = event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault(); this.send();
      }
    };
    this.el('regenerate').onclick = () => this.regenerate();
    this.el('clear-context').onclick = () => this.clearContext();
    this.el('preview').onclick = async () => {
      const config = await AIApi.loadConfig();
      if (this.quickEffort !== null) config.reasoningEffort = this.quickEffort;
      const settings = await AIConfig.loadBatchSettings();
      const input = this.el('input').value.trim();
      const mode = this.currentMode(input);
      const request = this.prepareRequest(mode, input);
      const preview = req => this.batchRequests(req, settings.batchSize)
        .map(batch => ({ questions: this.batchLabel(batch), messages: this.messages(config, batch) }));
      this.el('preview-text').textContent = JSON.stringify({ ...settings,
        operation: mode, discussionMode: this.isDiscussion(),
        localOnly: mode === 'chat' && !input && request.referenceKeys.length > 0,
        requests: mode === 'chat' && !input ? [] : preview(request),
        cachedAnswers: AIAnswerCache.count(this.snapshotId) }, null, 2);
      this.el('question-panel').open = true;
      this.el('preview-panel').open = true;
    };
    this.el('stop').onclick = () => {
      this.pending?.controller.abort();
      this.task('正在停止请求和后续填写。');
    };
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'local' || !this.root) return;
      if (changes.activeAiProfileId || changes.aiProfiles) {
        if (changes.aiProfiles) { this.lastUsage = null; this.contextError = null; await this.persist(); }
        await this.loadModels();
      }
    });
  },
  async refresh() {
    if (this.pending) return;
    const selectedKeys = new Set(this.chosen().map(q => this.questionKey(q)));
    const config = await AIApi.loadConfig();
    this.el('effort').value = this.quickEffort ?? config.reasoningEffort;
    await this.loadModels();
    try {
      await this.scanQuestions();
      if (this.isDiscussion()) {
        this.el('all').checked = false;
        this.selected = new Set(this.questions.flatMap((q, index) => selectedKeys.has(this.questionKey(q)) ? [index] : []));
      } else this.selected = new Set(this.questions.map((_, index) => index));
      this.renderQuestions();
    } catch (error) {
      this.questions = []; this.selected.clear();
      this.renderQuestions();
      this.task(`提取题目失败：${error.message}`, 'error');
    }
  },
  async scanQuestions() {
    const result = await QuestionCollector.collectLive();
    if (result.status !== 'stable') throw new Error(QuestionReport.message(result.diagnostics));
    this.snapshotId = result.snapshot.revision;
    this.questions = result.sections.flatMap(section => section.questions);
    this.questions.forEach((question, index) => {
      question.index = index + 1;
      question.questionKey ||= result.snapshot.items[index]?.questionKey;
      question.editorState ??= this.editorState(question);
    });
  },
  async loadModels() {
    const data = await chrome.storage.local.get(['aiProfiles', 'activeAiProfileId', 'aiConfig']);
    const profiles = Array.isArray(data.aiProfiles) && data.aiProfiles.length
      ? data.aiProfiles : (data.aiConfig ? [data.aiConfig] : []);
    const select = this.el('model-select');
    select.replaceChildren();
    for (const profile of profiles) {
      const label = `${profile.name || '未命名模型'}:${profile.model || '未配置 ID'}`;
      select.append(new Option(label, profile.id || 'default'));
    }
    if (!profiles.length) select.append(new Option('未配置模型', ''));
    const active = profiles.find(profile => profile.id === data.activeAiProfileId) || profiles[0];
    select.value = active?.id || (active ? 'default' : '');
    select.title = active ? `${active.name || '未命名模型'}:${active.model || '未配置 ID'}` : '未配置模型';
    this.loadContextInfo(active ? AIApi.normalizeConfig(active) : null);
  },
  modelLabel(config) {
    return `${config.name || '未命名模型'}:${config.model || '未配置 ID'}`;
  },
  renderQuestions() {
    const list = this.el('questions');
    const target = this.el('target');
    const previousTarget = target.value;
    list.replaceChildren();
    target.replaceChildren(new Option(this.isDiscussion() ? '已加入对话的全部题目' : '所选全部题目', 'all'));
    this.questions.forEach((q, index) => {
      const row = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox'; check.value = index;
      check.checked = this.el('all').checked || this.selected.has(index);
      check.disabled = this.el('all').checked;
      check.onchange = () => {
        check.checked ? this.selected.add(index) : this.selected.delete(index);
        this.updateContextSummary();
      };
      const codeNote = q.type === 'programming' && q.codeStatus !== 'read' ? '（未读取到答题区代码）' : '';
      row.append(check, document.createTextNode(`${index + 1}. ${q.title}${codeNote}`));
      list.append(row);
      if (!this.isDiscussion() || this.contextQuestions.some(item => this.questionKey(item) === this.questionKey(q))) {
        target.append(new Option(`${index + 1}. ${q.title.slice(0, 28)}`, String(index)));
      }
    });
    if (Array.from(target.options).some(option => option.value === previousTarget)) target.value = previousTarget;
    this.el('context-note').textContent = `${this.questions.length} 道题；请求按总体设置分批。首次留空生成并填写；讨论时勾选题目仅作为本轮待发送资料，发送后自动取消勾选。已加入的题目无需重复选择。清空上下文才恢复直接生成。程序题会附带可读取的现有代码。`;
    this.updateContextSummary();
  },
  updateContextSummary() {
    const count = this.el('all').checked ? this.questions.length : this.selected.size;
    this.el('context-summary').textContent = count ? '编辑题目引用' : '＋ 引用题目';
    this.el('references').replaceChildren();
    const context = this.chosen().map(q => this.snapshot(q));
    if (context.length) {
      const pending = this.reference(context, [], true, 'selected');
      pending.querySelector('summary').textContent = `本轮待发送 · 第 ${context.map(q => q.index).join('、')} 题`;
      this.el('references').append(pending);
    }
    this.el('session-references').replaceChildren();
    if (this.contextQuestions.length) {
      const joined = this.reference(this.contextQuestions, [], false, 'selected');
      joined.querySelector('summary').textContent = `已加入对话 · ${this.contextQuestions.length} 题`;
      this.el('session-references').append(joined);
    }
    this.updateActions();
  },
  chosen() { return this.questions.filter((_, index) => this.el('all').checked || this.selected.has(index)); },
  targets(context) {
    const value = this.el('target').value;
    return value === 'all' ? context : [this.questions[Number(value)]].filter(Boolean);
  },
  snapshot(q) {
    return { id: q.id, questionKey: q.questionKey || QuestionKey.from(q), index: q.index, type: q.type, title: q.title, options: q.options, blankCount: q.blankCount,
      exam: q.exam,
      parentTitle: q.parentTitle, parentId: q.parentId, subquestionId: q.subquestionId, images: q.images, parentImages: q.parentImages,
      subquestionNumber: q.subquestionNumber,
      existingAnswer: q.existingAnswer,
      answerDraft: q.type === 'programming' ? q.answerDraft : undefined,
      codeStatus: q.type === 'programming' ? q.codeStatus : undefined, matchingGroups: q.matchingGroups, sortingLabels: q.sortingLabels };
  },
  editorState(q) {
    if (q.remote) return q.editorState;
    if (!q.container) return JSON.stringify(q.existingAnswer ?? null);
    // Compare answer content, not UEditor's asynchronously synchronized backing textarea.
    const current = AIAnswerCore.parseQuestionContainer(q.container, q.docRef, q.sectionHeader);
    return JSON.stringify(current?.existingAnswer ?? null);
  },
  snapshotCurrent(item) {
    const q = this.questions.find(q => this.questionKey(q) === this.questionKey(item));
    if (!q) return this.snapshot(item);
    if (!q.remote && q.container) {
      const current = AIAnswerCore.parseQuestionContainer(q.container, q.docRef, q.sectionHeader);
      if (current) Object.assign(q, current);
      q.editorState = this.editorState(q);
    }
    return this.snapshot(q);
  },
  prepareRequest(mode, input, prior) {
    const selected = prior ? (mode === 'chat' ? [] : prior.context || []) : this.chosen();
    const references = selected.map(q => this.snapshotCurrent(q));
    const known = new Map(this.contextQuestions.map(q => [this.questionKey(q), q]));
    const addedKeys = [], updatedKeys = [];
    for (const q of references) {
      const key = this.questionKey(q), previous = known.get(key);
      if (!previous) addedKeys.push(key);
      else if (JSON.stringify(previous) !== JSON.stringify(q)) updatedKeys.push(key);
      known.set(key, q);
    }
    const context = mode === 'chat' ? [...known.values()] : references;
    const target = mode === 'chat' ? [] : (prior?.target || this.targets(references)).map(q => this.snapshotCurrent(q));
    const referenceKeys = prior?.referenceKeys || references.map(q => this.questionKey(q));
    return JSON.parse(JSON.stringify({ mode, input, context, target, referenceKeys, addedKeys, updatedKeys,
      focusKeys: referenceKeys.length ? referenceKeys : this.lastReferenceKeys,
      contextScope: 'selected', regenerate: Boolean(prior), protocolToken: AIAnswerEnvelope.token() }));
  },
  acceptRequest(request) {
    const known = new Map(this.contextQuestions.map(q => [this.questionKey(q), q]));
    for (const q of [...request.context, ...request.target]) known.set(this.questionKey(q), q);
    this.contextQuestions = [...known.values()];
    if (request.referenceKeys.length) this.lastReferenceKeys = request.referenceKeys;
    const stored = request.mode === 'chat' ? {
      mode: 'chat', input: request.input, contextKeys: request.context.map(q => this.questionKey(q)),
      referenceKeys: request.referenceKeys, focusKeys: request.focusKeys, addedKeys: request.addedKeys,
      updatedKeys: request.updatedKeys, configId: request.configId, localOnly: !request.input
    } : request;
    if (request.mode === 'chat') this.discussionMode = true;
    const text = request.input || (request.mode === 'chat' ? '加入题目资料，暂不解答' : '请解答所选题目并填入答案');
    this.history.push({ role: 'user', text, request: stored });
    this.addBubble('user', text, '', stored);
    this.el('input').value = '';
    this.el('all').checked = false;
    this.selected.clear();
    this.renderQuestions();
  },
  isDiscussion() {
    return this.discussionMode || this.history.some(item => item.role === 'user' &&
      (item.request?.mode === 'chat' || Boolean(item.request?.input?.trim())));
  },
  currentMode(input = this.el('input').value.trim()) { return this.isDiscussion() || input ? 'chat' : 'answer'; },
  restoreSession(saved) {
    saved = AIChatSession.migrate(saved);
    const history = Array.isArray(saved) ? saved : saved?.history;
    this.history = Array.isArray(history) ? history : [];
    const known = new Map((saved?.contextQuestions || []).map(q => [this.questionKey(q), q]));
    this.lastReferenceKeys = saved?.lastReferenceKeys || [];
    for (const item of this.history) {
      const request = item.request;
      if (!request?.context) continue;
      if (!saved?.contextQuestions) {
        for (const q of request.context) known.set(this.questionKey(q), q);
        if (request.context.length) this.lastReferenceKeys = request.context.map(q => this.questionKey(q));
      }
      if (request.mode === 'chat') {
        request.contextKeys = request.context.map(q => this.questionKey(q));
        request.referenceKeys = request.contextKeys;
        delete request.context;
        delete request.target;
      }
    }
    this.contextQuestions = [...known.values()];
    this.lastUsage = saved?.lastUsage || null;
    this.contextError = saved?.contextError || null;
    this.discussionMode = !Array.isArray(saved) && saved?.discussionMode === true;
    this.discussionMode = this.isDiscussion();
    this.history = this.history.slice(-60);
  },
  async persist() {
    await chrome.storage.local.set({ [this.pageKey()]: { version: 2, history: this.history.slice(-60), discussionMode: this.isDiscussion(),
      contextQuestions: this.contextQuestions, lastReferenceKeys: this.lastReferenceKeys,
      lastUsage: this.lastUsage, contextError: this.contextError } });
  },
  async clearContext() {
    if (this.pending) return;
    this.history = [];
    this.discussionMode = false;
    this.contextQuestions = []; this.lastReferenceKeys = []; this.lastUsage = null; this.contextError = null;
    this.el('preview-text').textContent = '';
    this.el('preview-panel').open = false;
    this.renderHistory();
    this.renderQuestions();
    this.task('上下文已清空，已保留题目引用。', 'success');
    try { await this.persist(); }
    catch (error) { this.task(`清空记录保存失败：${error.message}`, 'error'); }
  },
  renderHistory() {
    const feed = this.el('feed'); feed.replaceChildren();
    this.history.forEach(item => {
      const bubble = this.addBubble(item.role, item.text, item.modelLabel ||
        (item.role === 'assistant' ? 'AI · 旧记录未保存模型' : ''), item.request);
      if (item.role === 'assistant' && (item.thought || item.thoughtStatus)) this.addThought(bubble,
        item.thought || this.thoughtNote(item.thoughtStatus), item);
    });
    if (!this.history.length) {
      const empty = document.createElement('p'); empty.className = 'empty-state';
      empty.textContent = '引用本页题目，询问答案、解析或解题方法。'; feed.append(empty);
    }
    this.updateActions();
  },
  reference(context, target = [], removable = false, scope) {
    const wrapper = document.createElement('div'); wrapper.className = 'reference';
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const indices = context.map(q => q.index).join('、');
    const all = scope ? scope === 'all' : this.el('all').checked;
    summary.textContent = `▤ ${all ? `全部题目 · ${context.length} 题` : `第 ${indices} 题 · ${context.length === 1 ? '单题' : `已选 ${context.length} 题`}`}`;
    const content = document.createElement('div'); content.className = 'reference-content';
    for (const q of context) {
      const line = document.createElement('p');
      line.textContent = `第 ${q.index} 题 · ${this.typeLabel(q.type)}\n${q.title}`;
      content.append(line);
    }
    if (target.length) {
      const hint = document.createElement('p');
      hint.textContent = `作答目标：第 ${target.map(q => q.index).join('、')} 题`;
      content.append(hint);
    }
    details.append(summary, content); wrapper.append(details);
    if (removable) {
      const remove = document.createElement('button'); remove.textContent = '×'; remove.setAttribute('aria-label', '移除题目引用');
      remove.onclick = () => { this.el('all').checked = false; this.selected.clear(); this.el('target').value = 'all'; this.renderQuestions(); };
      wrapper.append(remove);
    }
    return wrapper;
  },
  typeLabel(type) { return AIChatView.type(type); },
  thoughtNote(status) {
    return { encrypted: '接口仅返回了加密思考数据，无法展示文本。', hidden: '接口隐藏了本次思考内容。',
      failed: '请求失败，未能获取完整思考内容。', cancelled: '已停止，思考内容未接收完成。'
    }[status] || '接口未返回可展示的思考内容。';
  },
  addThought(bubble, text = '', metadata = {}) {
    const entry = document.createElement('details'); entry.className = 'thought-entry'; entry.open = false;
    const label = document.createElement('summary');
    label.title = '耗时从请求发出计至首次答案正文，包含连接和等待时间。';
    const state = document.createElement('span');
    const spinner = document.createElement('span'); spinner.className = 'thought-spinner'; spinner.hidden = true;
    spinner.setAttribute('aria-hidden', 'true');
    const elapsed = document.createElement('span'); elapsed.className = 'thought-elapsed';
    const duration = metadata.thoughtDurationMs;
    const hasDuration = Number.isFinite(duration) && duration >= 0;
    state.textContent = hasDuration ? '已思考' : '思考记录';
    elapsed.hidden = !hasDuration;
    if (hasDuration) elapsed.textContent = `${Math.floor(duration / 1000)} 秒`;
    label.append(state, ' ', spinner, ' ', elapsed);
    const body = document.createElement('pre'); body.textContent = text;
    entry.append(label, body); bubble.box.insertBefore(entry, bubble.body);
    let following = true, lastScrollTop = 0;
    const trackScroll = () => {
      if (!entry.open || body.scrollTop === lastScrollTop) return;
      if (body.scrollTop < lastScrollTop) following = false;
      else if (body.scrollHeight - body.clientHeight - body.scrollTop <= 2) following = true;
      lastScrollTop = body.scrollTop;
    };
    const scrollToLatest = () => {
      if (entry.open && following) body.scrollTop = body.scrollHeight;
      lastScrollTop = body.scrollTop;
    };
    body.addEventListener('scroll', trackScroll);
    entry.addEventListener('toggle', () => {
      if (!entry.open) return;
      following = true;
      scrollToLatest();
    });
    const setText = value => {
      // Capture manual movement even if its scroll event has not been dispatched yet.
      trackScroll();
      body.textContent = value;
      scrollToLatest();
    };
    return { body, entry, label, state, spinner, elapsed, setText };
  },
  addBubble(role, text, modelLabel = '', request) {
    this.el('feed').querySelector('.empty-state')?.remove();
    const box = document.createElement('article'); box.className = `message ${role}`;
    const name = document.createElement('b'); name.textContent = modelLabel || 'AI';
    const body = document.createElement('pre'); body.textContent = text || '';
    if (role === 'assistant') box.append(name);
    const references = request?.referenceKeys
      ? request.referenceKeys.map(key => this.contextQuestions.find(q => this.questionKey(q) === key)).filter(Boolean) : request?.context || [];
    if (role === 'user' && references.length) box.append(this.reference(references, request.mode !== 'chat' ? request.target : [], false, 'selected'));
    if (role === 'user' && (request?.addedKeys?.length || request?.updatedKeys?.length)) {
      const changes = document.createElement('p'); changes.className = 'reference-changes';
      changes.textContent = [
        request.addedKeys?.length ? `加入第 ${request.addedKeys.map(key => key.split(':')[0]).join('、')} 题资料` : '',
        request.updatedKeys?.length ? `更新第 ${request.updatedKeys.map(key => key.split(':')[0]).join('、')} 题资料` : ''
      ].filter(Boolean).join('；');
      box.append(changes);
    }
    box.append(body); this.el('feed').append(box); box.scrollIntoView({ block: 'end' });
    return { box, body };
  },
  questionKey(question) { return question.questionKey || `${question.index}:${question.id}`; },
  batchRequests(request, batchSize) {
    return AIAnswerPlan.split(request, batchSize, question => this.questionKey(question));
  },
  batchLabel(request) {
    const questions = request.mode !== 'chat' ? request.target : request.context;
    return questions.length ? `第 ${questions[0].index}${questions.length > 1 ? `–${questions.at(-1).index}` : ''} 题` : '对话';
  },
  async retryRequest(work, maxRetries, job, label) {
    return AIAnswerRunner.retry(work, maxRetries, job.controller.signal,
      (error, attempt) => this.task(`${label}失败，准备第 ${attempt}/${maxRetries} 次重试：${error.message}`));
  },
  async send(mode, prior) {
    if (this.pending) return;
    const input = prior?.input ?? this.el('input').value.trim();
    mode ??= this.currentMode(input);
    if (mode === 'answer' && this.isDiscussion()) return this.task('当前处于讨论模式，请先清空上下文再直接生成答案。', 'error');
    if (mode === 'chat' && !input && (prior || !this.chosen().length)) return;
    const request = this.prepareRequest(mode, input, prior);
    if (mode !== 'chat' && !request.target.length) return this.task('请先选择作答目标', 'error');
    if (mode === 'chat' && !input) {
      this.acceptRequest(request);
      await this.persist();
      return this.task('题目资料已加入对话，可直接输入内容继续讨论。未调用模型。', 'success');
    }
    const config = await AIApi.loadConfig();
    if (this.quickEffort !== null) config.reasoningEffort = this.quickEffort;
    try { AIApi.validateConfig(config); } catch (error) { return this.task(error.message, 'error'); }
    const settings = await AIConfig.loadBatchSettings();
    if (this.pending) return;
    if (!this.currentConfig) this.currentConfig = config;
    request.configId = config.id;
    const historyIndex = prior ? this.history.findLastIndex(item => item.role === 'user' && item.request === prior) : -1;
    const history = prior ? this.history.slice(0, historyIndex) : this.history.slice();
    const batches = this.batchRequests(request, settings.batchSize);
    const job = { controller: new AbortController(), completed: 0, failures: [], failedQuestions: new Set(),
      unansweredQuestions: new Set(), offered: 0, written: 0, maxInputTokens: null,
      timeouts: settings, timeoutSeconds: settings.idleTimeoutSeconds, applyQueue: Promise.resolve() };
    this.lastUsage = null;
    this.pending = job;
    this.setBusy(true);
    try {
      if (!prior) {
        this.acceptRequest(request);
      }
      await this.persist();
      this.task(`共 ${batches.length} 批，每批最多引用 ${settings.batchSize} 题，同时处理 ${Math.min(settings.concurrency, batches.length)} 批；首次响应 ${settings.firstByteTimeoutSeconds} 秒，流空闲 ${settings.idleTimeoutSeconds} 秒。`);
      let nextBatch = 0;
      const worker = async () => {
        while (nextBatch < batches.length && !job.controller.signal.aborted) {
          const batch = batches[nextBatch++];
          const label = this.batchLabel(batch);
          const modelLabel = this.modelLabel(config);
          const assistant = this.addBubble('assistant', '', batches.length > 1 ? `${modelLabel} · ${label}` : modelLabel);
          const thoughtView = this.addThought(assistant);
          try {
            // The same request generates the answer and its structure; validation runs locally.
            const done = await this.retryRequest(async () => {
              const reply = await this.streamReply(config, batch, history, job, assistant, thoughtView);
              job.controller.signal.throwIfAborted();
              const usage = AIConfig.normalizeUsage(reply.usage || {}, config.apiType);
              if (usage.inputTokens !== null && (job.maxInputTokens === null || usage.inputTokens > job.maxInputTokens)) {
                job.maxInputTokens = usage.inputTokens;
                this.lastUsage = { identity: AIConfig.contextIdentity(config), modelLabel, mode,
                  ...usage, measuredAt: Date.now() };
              }
              this.contextError = null;
              this.renderContextInfo();
              const entries = this.parseAnswerEntries(reply.envelope, batch);
              return { ...reply, entries };
            }, settings.maxRetries, job, `${label}生成`);
            this.history.push({ role: 'assistant', text: done.text, thought: done.thought, mode,
              thoughtBlocks: done.thoughtBlocks, thoughtStatus: done.thoughtStatus, usage: done.usage, protocolState: done.protocolState,
              thoughtDurationMs: done.thoughtDurationMs,
              modelLabel, reasoningEffort: config.reasoningEffort, questionKeys: batch.context.map(q => this.questionKey(q)),
              ...(mode === 'answer' ? { answerKeys: batch.target.map(q => this.questionKey(q)) } : {}) });
            if (done.entries?.length) {
              if (mode === 'chat') {
                this.cacheAnswers(done.entries, batch);
                job.offered += done.entries.length;
              } else {
                const offer = job.applyQueue.then(() => {
                  job.controller.signal.throwIfAborted();
                  return this.offerAnswers(done.entries, batch, job);
                });
                job.applyQueue = offer.catch(() => {});
                await offer;
              }
            }
            job.completed++;
            this.task(`已完成 ${job.completed}/${batches.length} 批${job.offered ? `，提供 ${job.offered} 道题答案，写入 ${job.written} 道题` : ''}。`);
          } catch (error) {
            if (job.controller.signal.aborted) break;
            if (error.contextLimit) {
              this.contextError = { identity: AIConfig.contextIdentity(config), mode };
              this.renderContextInfo();
            }
            job.failures.push(label);
            assistant.body.textContent += `\n\n${label}失败：${error.message}`;
          }
        }
      };
      await AIAnswerRunner.pool(Math.min(settings.concurrency, batches.length), worker);
      this.task(`${job.controller.signal.aborted ? '已停止' : '处理结束'}：完成 ${job.completed}/${batches.length} 批` +
        `${job.offered ? `，提供 ${job.offered} 道题答案，写入 ${job.written} 道题` : ''}` +
        `${job.failures.length ? `；失败：${job.failures.join('、')}，可重新选择这些题目重试` : ''}` +
        `${job.unansweredQuestions.size ? `；第 ${[...job.unansweredQuestions].join('、')} 题在聊天中未确定答案，未填写` : ''}` +
        `${job.saved ? `，其中 ${job.saved} 题已填写并暂存` : ''}` +
        `${job.applyError ? `；已暂停后续填写：${job.applyError.message}` : ''}` +
        `${job.failedQuestions.size ? `；第 ${[...job.failedQuestions].join('、')} 题${job.applyError ? '暂存未确认' : '写入失败'}，请刷新题目后重试` : ''}。`,
        job.failures.length || job.failedQuestions.size ? 'error' : 'info');
    } catch (error) { this.task(error.message, 'error'); }
    finally {
      this.pending = null;
      this.setBusy(false);
      await this.persist();
    }
  },
  streamReply(config, request, history, job, assistant, thoughtView) {
    const signal = job.controller.signal;
    signal.throwIfAborted();
    assistant.body.textContent = '';
    thoughtView.state.textContent = '思考中';
    thoughtView.spinner.hidden = false;
    thoughtView.elapsed.hidden = false;
    thoughtView.elapsed.textContent = '0 秒';
    thoughtView.setText(config.reasoningEffort === 'none'
      ? '当前选择不思考；若模型仍返回可展示内容，会实时显示在这里。' : '正在等待模型返回思考内容…');
    return new Promise((resolve, reject) => {
      const startedAt = performance.now();
      let port, finished = false, keepAliveTimer, thoughtTimer, thoughtDurationMs;
      let rawText = '', text = '', envelope, thought = '', thoughtStatus = 'not_returned', usage, protocolState;
      let thoughtBlocks = [];
      const updateElapsed = () => {
        thoughtView.elapsed.textContent = `${Math.floor((thoughtDurationMs ?? performance.now() - startedAt) / 1000)} 秒`;
      };
      const stopThinking = error => {
        thoughtDurationMs ??= performance.now() - startedAt;
        clearInterval(thoughtTimer);
        thoughtView.spinner.hidden = true;
        thoughtView.state.textContent = error ? error.name === 'AbortError' ? '已停止 ·' : '请求失败 ·' : '已思考';
        updateElapsed();
      };
      const complete = error => {
        if (finished) return;
        finished = true;
        clearInterval(keepAliveTimer);
        signal.removeEventListener('abort', cancel);
        stopThinking(error);
        if (error) thoughtStatus = error.name === 'AbortError' ? 'cancelled' : 'failed';
        thoughtView.setText(thought ? thought + (error ? `\n\n${this.thoughtNote(thoughtStatus)}` : '') : this.thoughtNote(thoughtStatus));
        assistant.body.textContent = text;
        port?.disconnect();
        if (error) reject(error); else resolve({ text, envelope, thought, thoughtBlocks, thoughtStatus, usage, protocolState, thoughtDurationMs });
      };
      const cancel = () => {
        try { port.postMessage({ type: 'cancel' }); }
        catch (error) { /* The port may already be disconnected. */ }
        complete(signal.reason);
      };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        port = chrome.runtime.connect({ name: 'AI_CHAT_STREAM' });
        port.onMessage.addListener(message => {
          if (finished) return;
          if (message.type === 'delta') {
            if (message.delta?.trim() && thoughtDurationMs === undefined) stopThinking();
            rawText += message.delta;
            text = AIAnswerEnvelope.visible(rawText, request.protocolToken);
            assistant.body.textContent = text;
            assistant.box.scrollIntoView({ block: 'end' });
          }
          if (message.type === 'thought') {
            if (message.blocks) thoughtBlocks = message.blocks;
            else {
              const id = message.blockId || 'legacy';
              let block = thoughtBlocks.find(item => item.id === id);
              if (!block) { block = { id, kind: message.kind || 'content', text: '' }; thoughtBlocks.push(block); }
              block.text += message.delta;
            }
            thought = thoughtBlocks.map(item => item.text).join('\n\n');
            thoughtStatus = 'visible';
            thoughtView.setText(thought);
          }
          if (message.type === 'done') {
            if (typeof message.text === 'string') rawText = message.text;
            if (message.thoughtBlocks) { thoughtBlocks = message.thoughtBlocks; thought = thoughtBlocks.map(item => item.text).join('\n\n'); }
            thoughtStatus = message.thoughtStatus || thoughtStatus;
            usage = message.usage; protocolState = message.protocolState;
            try {
              const parsed = AIAnswerEnvelope.parse(rawText, request.protocolToken);
              text = parsed.visible || (request.mode === 'answer' ? '结构化答案已生成。' : '');
              envelope = parsed.data;
              complete();
            } catch (error) { complete(error); }
          }
          if (message.type === 'error') complete(Object.assign(new Error(message.message), { retryable: message.retryable === true, contextLimit: message.contextLimit === true }));
          if (message.type === 'cancelled') complete(new DOMException('已停止生成', 'AbortError'));
        });
        port.onDisconnect.addListener(() => {
          if (!finished) complete(Object.assign(new Error(chrome.runtime.lastError?.message || '流式连接中断'), { retryable: true }));
        });
        thoughtTimer = setInterval(updateElapsed, 1000);
        keepAliveTimer = setInterval(() => {
          try { port.postMessage({ type: 'ping' }); }
          catch (error) { complete(Object.assign(error, { retryable: true })); }
        }, 20000);
        port.postMessage({ type: 'start', messages: this.messages(config, request, history),
          reasoningEffort: config.reasoningEffort, profileId: config.id, config, timeouts: job.timeouts });
      } catch (error) { complete(error); }
    });
  },
  historyMessages(request, history, config) {
    const keys = new Set(request.context.map(q => this.questionKey(q)));
    const recent = [];
    let includeReply = false, includeLegacyReply = false, previousRequest;
    for (const item of history) {
      if (item.role === 'user' && item.request) {
        previousRequest = item.request;
        const scope = item.request.contextKeys || (item.request.context || []).map(q => this.questionKey(q));
        includeReply = !scope.length || scope.some(key => keys.has(key));
        includeLegacyReply = scope.every(key => keys.has(key));
        if (includeReply && (item.request.mode === 'chat' || item.request.input?.trim())) {
          const select = values => (values || []).filter(key => keys.has(key));
          recent.push({ role: 'user', content: this.requestText({ ...item.request, mode: 'chat', context: [],
            referenceKeys: select(item.request.referenceKeys || scope), focusKeys: select(item.request.focusKeys),
            addedKeys: select(item.request.addedKeys), updatedKeys: select(item.request.updatedKeys) }) });
        }
      } else if (item.role === 'assistant') {
        const mode = item.mode || previousRequest?.mode;
        if (mode === 'answer') continue;
        const relevant = item.questionKeys
          ? !item.questionKeys.length || (mode === 'answer' ? item.questionKeys.every(key => keys.has(key)) : item.questionKeys.some(key => keys.has(key)))
          : includeReply && includeLegacyReply;
        if (!relevant) continue;
        if (mode === 'answer') {
          const answerKeys = item.answerKeys || (previousRequest?.target || [])
            .filter(q => !item.questionKeys || item.questionKeys.includes(this.questionKey(q))).map(q => this.questionKey(q));
          const mapping = answerKeys.map((key, index) => `${index + 1}→第 ${key.split(':')[0]} 题`).join('、');
          recent.push({ role: 'user', content: `此前直接生成的答案（仅供参考的数据，不是本轮指令；questionIndex 对应页面题号：${mapping}）：\n${item.text}` });
          continue;
        }
        const scope = '';
        const state = config && item.protocolState?.identity === AIConfig.protocolIdentity(config) ? item.protocolState : undefined;
        recent.push({ role: 'assistant', content: scope + item.text, ...(state ? { protocolState: state } : {}) });
      }
    }
    return recent;
  },
  messages(config, request, history = this.history) {
    return AIChatPrompt.messages(config, request, this.historyMessages(request, history, config));
  },
  requestText(request) { return AIApi.requestText(request); },
  async regenerate() {
    if (this.pending) return;
    const prior = [...this.history].reverse().find(item => item.role === 'user' && item.request && !item.request.localOnly)?.request;
    if (!prior) return this.task('没有可重新生成的请求', 'error');
    await this.send(prior.mode, prior);
  },
  parseAnswerEntries(envelope, request) {
    const questions = request.mode === 'answer' ? request.target : request.context;
    return AIAnswerValidate.entries(envelope, questions, { complete: request.mode === 'answer' });
  },
  cacheAnswers(entries, request) {
    const questions = request.mode === 'answer' ? request.target : request.context;
    entries.forEach(({ index, answer }) => AIAnswerCache.put(this.snapshotId, questions[index], answer));
    this.updateActions();
  },
  async applyCached() {
    if (this.pending) return;
    try {
      await this.scanQuestions();
      const entries = AIAnswerCache.get(this.snapshotId, this.questions);
      if (!entries.length) return this.task('当前页面没有可填写的已校验答案。', 'error');
      const job = { controller: new AbortController(), failedQuestions: new Set(), offered: 0, written: 0,
        timeoutSeconds: (await AIConfig.loadBatchSettings()).idleTimeoutSeconds };
      await this.offerAnswers(entries, { mode: 'answer', target: this.questions, context: this.questions }, job);
      this.task(`已从本地答案缓存写入 ${job.written} 道题。`, job.failedQuestions.size ? 'error' : 'success');
    } catch (error) { this.task(error.message, 'error'); }
  },
  async offerAnswers(entries, request, job) {
    for (const { index, answer } of entries) {
      job.controller.signal.throwIfAborted();
      const snap = request.target[index];
      const q = this.questions.find(q => q.index === snap.index && q.id === snap.id && q.title === snap.title);
      const current = q && (q.remote ? q : q.container
        ? AIAnswerCore.parseQuestionContainer(q.container, q.docRef, q.sectionHeader) : null);
      if (!current || current.id !== snap.id || current.title !== snap.title || current.type !== snap.type || !QuestionContainers.sameContext(current, snap) ||
          JSON.stringify(current.options) !== JSON.stringify(snap.options) ||
          JSON.stringify(current.existingAnswer) !== JSON.stringify(snap.existingAnswer) ||
          (snap.type === 'programming' && current.answerDraft !== snap.answerDraft) ||
          JSON.stringify(current.matchingGroups) !== JSON.stringify(snap.matchingGroups) || this.editorState(q) !== q.editorState) {
        job.failedQuestions.add(snap.index);
        this.task(`题目 ${snap.index} 或答题区已变化，拒绝写入`, 'error'); continue;
      }
      const card = document.createElement('div'); card.className = 'candidate';
      const code = document.createElement('pre'); code.textContent = JSON.stringify(answer, null, 2);
      const apply = document.createElement('button'); apply.textContent = `写入题目 ${q.index}`;
      apply.onclick = async () => {
        apply.disabled = true;
        try {
          job.controller.signal.throwIfAborted();
          if (!q.remote) {
            const fresh = AIAnswerCore.parseQuestionContainer(q.container, q.docRef, q.sectionHeader);
            if (!fresh || fresh.id !== snap.id || fresh.title !== snap.title || fresh.type !== snap.type ||
                !QuestionContainers.sameContext(fresh, snap) ||
                JSON.stringify(fresh.options) !== JSON.stringify(snap.options) ||
                JSON.stringify(fresh.existingAnswer) !== JSON.stringify(snap.existingAnswer) ||
                (snap.type === 'programming' && fresh.answerDraft !== snap.answerDraft) ||
                JSON.stringify(fresh.matchingGroups) !== JSON.stringify(snap.matchingGroups) || this.editorState(q) !== q.editorState) {
              throw new Error('题目或答题区已变化，请刷新后重新生成');
            }
          }
          const options = { signal: job.controller.signal, timeoutSeconds: job.timeoutSeconds };
          const remoteResult = q.remote ? await this.applyRemote(q, snap, answer, options) : null;
          const applied = q.remote ? remoteResult : await AIAnswerCore.applyAnswerToQuestion(q, answer, options);
          job.controller.signal.throwIfAborted();
          if (!applied?.ok) throw new Error(applied?.message || applied?.status || '未找到可写入的编辑器或答案控件');
          if (q.remote) {
            if (remoteResult.question) Object.assign(q, remoteResult.question);
            q.editorState = remoteResult.editorState;
          } else {
            const updated = AIAnswerCore.parseQuestionContainer(q.container, q.docRef, q.sectionHeader);
            if (updated) Object.assign(q, updated);
            q.editorState = this.editorState(q);
          }
          apply.textContent = q.exam ? '已填写并暂存' : '已写入';
          if (q.exam) job.saved = (job.saved || 0) + 1;
          job.failedQuestions.delete(q.index);
          job.written++;
          this.task(`已写入 ${job.written} 道题${job.saved ? `，其中 ${job.saved} 题已填写并暂存` : ''}`, 'success');
        }
        catch (error) {
          job.failedQuestions.add(q.index);
          if (error.examSaveError) {
            apply.textContent = '暂存未确认';
            job.applyError = error;
            job.controller.abort();
          } else apply.disabled = false;
          this.task(`题目 ${q.index} 写入失败：${error.message}`, 'error');
        }
      };
      card.append(code, apply); this.el('feed').append(card);
      job.offered++;
      await apply.onclick();
    }
  },
  task(message, type = 'info') {
    if (!this.root) return;
    const status = this.el('status'); status.hidden = false; status.className = type; status.textContent = message;
  },
  loadContextInfo(config) {
    if (config && this.currentConfig && AIConfig.contextIdentity(config) === AIConfig.contextIdentity(this.currentConfig) &&
        config.apiKey === this.currentConfig.apiKey && (this.infoPort || this.contextInfo?.expiresAt > Date.now())) {
      this.currentConfig = config; this.renderContextInfo(); return;
    }
    const revision = ++this.infoRevision;
    this.infoPort?.disconnect(); this.infoPort = null;
    this.currentConfig = config; this.contextInfo = null;
    this.renderContextInfo();
    if (!config?.baseUrl || !config.apiKey || !config.model) return;
    try {
      const port = chrome.runtime.connect({ name: 'AI_MODEL_INFO' });
      this.infoPort = port;
      port.onMessage.addListener(message => {
        if (revision !== this.infoRevision || !['done', 'error'].includes(message.type)) return;
        this.contextInfo = { identity: AIConfig.contextIdentity(config), expiresAt: Date.now() + 60 * 60 * 1000, maxInputTokens:
          Number.isSafeInteger(message.maxInputTokens) && message.maxInputTokens > 0 ? message.maxInputTokens : null };
        this.infoPort = null; port.disconnect(); this.renderContextInfo();
      });
      port.onDisconnect.addListener(() => { if (this.infoPort === port) this.infoPort = null; });
      port.postMessage({ type: 'start', config });
    } catch (_) { /* Specifications are optional and never block a model request. */ }
  },
  formatTokenCount(value) {
    if (!Number.isSafeInteger(value) || value < 0) return '—';
    return value < 1000 ? String(value) : `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  },
  renderContextInfo() {
    if (!this.el('usage-summary')) return;
    const identity = this.currentConfig && AIConfig.contextIdentity(this.currentConfig);
    const usage = this.lastUsage?.identity === identity ? this.lastUsage : null;
    const limit = this.contextInfo?.identity === identity ? this.contextInfo.maxInputTokens : null;
    const input = usage?.inputTokens ?? null;
    const ratio = input !== null && limit ? input / limit : null;
    this.el('usage-summary').textContent = `上下文：${this.formatTokenCount(input)}`;
    const error = this.contextError?.identity === identity ? this.contextError : null;
    const warning = this.el('context-warning');
    warning.hidden = !error && !(ratio >= 0.8);
    warning.textContent = error
      ? '接口报告上下文超限。请缩小题目范围或减小每批题目数后重试。'
      : ratio >= 0.8 ? '上下文接近上限，建议先填入已确定答案，再清空上下文，继续讨论剩余题目。' : '';
  },
  updateActions() {
    const input = this.el('input').value.trim();
    const selected = this.chosen();
    const hasTarget = this.targets(this.isDiscussion() ? this.contextQuestions : selected).length > 0;
    const chatting = this.currentMode(input) === 'chat';
    this.el('send').textContent = chatting ? '发送' : '生成答案';
    this.el('send').disabled = Boolean(this.pending) || (chatting ? !input && !selected.length : !hasTarget);
    this.el('input').placeholder = this.isDiscussion()
      ? '输入内容继续讨论；也可勾选新题后发送资料。确定答案后点击“填入答案”。'
      : '留空可直接生成并填写答案；发送内容后进入讨论模式…';
    this.el('fill').disabled = Boolean(this.pending) || AIAnswerCache.count(this.snapshotId) === 0;
    this.el('regenerate').disabled = Boolean(this.pending) || !this.history.some(item => item.role === 'user' && item.request && !item.request.localOnly);
    this.el('clear-context').disabled = Boolean(this.pending) || (!this.history.length && !this.contextQuestions.length && !this.isDiscussion());
    this.renderContextInfo();
  },
  setBusy(value) {
    this.updateActions();
    this.el('refresh').disabled = value;
    this.el('stop').hidden = !value;
  },
  async applyRemote(q, snap, answer, { signal, timeoutSeconds } = {}) {
    timeoutSeconds ??= (await AIConfig.loadBatchSettings()).timeoutSeconds;
    signal?.throwIfAborted();
    return QuestionFrame.apply(q.remote, { ...snap, editorState: q.editorState }, answer,
      { signal, timeoutSeconds });
  }
};

FK.ai.chat.main = AIChat;
