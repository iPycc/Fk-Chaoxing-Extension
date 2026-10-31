// Learning-page dialogue integration.
const DialogueAssistant = {
  port: null,
  busy: false,
  generated: '',
  status: '',
  statusType: '',
  keepAliveTimer: null,
  lockedInputs: new Map(),
  session: null,
  pendingTurn: null,
  agentState: null,
  checking: false,
  stateRequests: new Map(),
  nextStateRequestId: 0,
  reasoningEffort: null,
  profileId: null,
  profileConfig: null,
  profileDefaultEffort: '',
  profileLoadId: 0,

  init() {
    if (window.self !== window.top || window.location.hostname !== 'mooc2-ans.chaoxing.com' ||
        !window.location.pathname.startsWith('/mooc2-ans-vue/situationalDialogue')) return;

    window.addEventListener('message', event => this.onPageState(event));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || (!changes.activeAiProfileId && !changes.aiProfiles && !changes.aiConfig)) return;
      this.loadProfileEffort(Boolean(changes.activeAiProfileId));
    });
    this.loadProfileEffort(true);
    this.ensureUI();
    this.requestAgentState();
    const observer = new MutationObserver(() => this.ensureUI());
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    window.addEventListener('keydown', event => this.guardSend(event), true);
    window.addEventListener('click', event => this.guardSend(event), true);
    window.addEventListener('submit', event => this.guardSend(event), true);
    window.addEventListener('pagehide', () => {
      this.stop();
      this.resetSession();
    }, { once: true });
  },

  isChatPage() {
    return window.location.pathname === '/mooc2-ans-vue/situationalDialogue/chat';
  },

  async loadProfileEffort(resetSelection = false) {
    const loadId = ++this.profileLoadId;
    try {
      const data = await chrome.storage.local.get(['aiProfiles', 'activeAiProfileId', 'aiConfig']);
      if (loadId !== this.profileLoadId) return;
      const profiles = Array.isArray(data.aiProfiles) ? data.aiProfiles : [];
      const active = profiles.find(item => item.id === data.activeAiProfileId) || profiles[0] || data.aiConfig;
      const id = active?.id || data.activeAiProfileId || null;
      const effort = AIConfig.efforts.includes(active?.reasoningEffort) ? active.reasoningEffort : '';
      if (resetSelection || id !== this.profileId || this.reasoningEffort === null) this.reasoningEffort = effort;
      this.profileId = id;
      this.profileConfig = active || null;
      this.profileDefaultEffort = effort;
      this.render();
    } catch (err) {
      if (loadId !== this.profileLoadId) return;
      this.reasoningEffort = '';
      this.setStatus('无法读取模型设置', 'error');
    }
  },

  onPageState(event) {
    if (event.source !== window || event.data?.type !== 'CX_DIALOGUE_STATE') return;
    const state = event.data.isSending;
    this.agentState = typeof state === 'boolean' ? state : null;
    const request = this.stateRequests.get(event.data.requestId);
    if (request) {
      clearTimeout(request.timer);
      this.stateRequests.delete(event.data.requestId);
      request.resolve(this.agentState);
    }
    if (this.busy && this.agentState !== false) this.stop('智能体回复状态发生变化，本次生成已取消');
    this.render();
  },

  requestAgentState() {
    const requestId = ++this.nextStateRequestId;
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.stateRequests.delete(requestId);
        this.agentState = null;
        this.render();
        resolve(null);
      }, 1500);
      this.stateRequests.set(requestId, { resolve, timer });
      window.postMessage({ type: 'CX_DIALOGUE_STATE_REQUEST', requestId }, '*');
    });
  },

  ensureUI() {
    if (!this.isChatPage()) {
      if (this.busy) this.stop();
      this.resetSession();
      this.agentState = null;
      this.reasoningEffort = this.profileDefaultEffort;
      return;
    }
    const currentSystem = this.readSystem();
    if (currentSystem && (this.session?.system || this.pendingTurn?.system) &&
        currentSystem !== (this.pendingTurn?.system || this.session?.system)) {
      if (this.busy) this.stop();
      this.resetSession();
      this.reasoningEffort = this.profileDefaultEffort;
    }
    if (this.busy && this.pendingTurn && !this.isPendingAgentUnchanged()) {
      this.stop('智能体回复内容发生变化，本次生成已取消');
    }
    const toolbar = document.querySelector('.chat-container .input-toolbar__actions');
    if (!toolbar) return;
    toolbar.classList.add('cx-dialogue-actions');

    if (!toolbar.querySelector('#cx-dialogue-generate')) {
      const button = document.createElement('button');
      button.id = 'cx-dialogue-generate';
      button.type = 'button';
      button.className = 'cx-dialogue-generate';
      button.addEventListener('click', () => this.busy ? this.stop() : this.start());
      toolbar.appendChild(button);
    }
    if (!toolbar.querySelector('#cx-dialogue-effort')) {
      const select = document.createElement('select');
      select.id = 'cx-dialogue-effort';
      select.className = 'cx-dialogue-effort';
      select.setAttribute('aria-label', '思考等级');
      select.title = '本次练习的思考等级';
      const labels = ['模型默认', '不思考', '低', '中', '高', '超高', '最高'];
      AIConfig.efforts.forEach((effort, index) => {
        const option = document.createElement('option');
        option.value = effort;
        option.textContent = labels[index];
        select.appendChild(option);
      });
      select.addEventListener('change', () => { this.reasoningEffort = select.value; });
      toolbar.appendChild(select);
    }
    if (!toolbar.querySelector('#cx-dialogue-status')) {
      const status = document.createElement('span');
      status.id = 'cx-dialogue-status';
      status.className = 'cx-dialogue-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      toolbar.appendChild(status);
    }
    this.render();
    if (this.busy) {
      this.lockInput();
      if (this.generated) {
        const input = document.querySelector('.chat-container .input-textarea');
        if (input && input.value !== this.generated) this.setDraft(this.generated);
      }
    }
  },

  render() {
    const button = document.getElementById('cx-dialogue-generate');
    const select = document.getElementById('cx-dialogue-effort');
    const status = document.getElementById('cx-dialogue-status');
    if (button) {
      const label = this.busy ? '停止生成' : '生成回复';
      if (button.textContent !== label) button.textContent = label;
      if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
      if (button.classList.contains('cx-dialogue-generate--busy') !== this.busy) {
        button.classList.toggle('cx-dialogue-generate--busy', this.busy);
      }
      button.disabled = !this.busy && (this.checking || this.agentState !== false || this.reasoningEffort === null);
    }
    if (select) {
      select.disabled = this.busy || this.reasoningEffort === null;
      if (this.reasoningEffort !== null && select.value !== this.reasoningEffort) {
        select.value = this.reasoningEffort;
      }
    }
    if (status) {
      const reason = this.agentState === true ? '等待智能体回复完成' :
        this.agentState === null ? '无法确认智能体是否已结束回复' :
          this.reasoningEffort === null ? '正在读取模型设置' : '';
      const message = !this.busy && reason ? reason : this.status;
      const type = !this.busy && reason && this.agentState === null ? 'error' : this.statusType;
      if (status.textContent !== message) status.textContent = message;
      if (status.title !== message) status.title = message;
      if (status.dataset.type !== type) status.dataset.type = type;
    }
    const footer = document.querySelector('.chat-container .chat-footer');
    if (footer && footer.classList.contains('cx-dialogue-generating') !== this.busy) {
      footer.classList.toggle('cx-dialogue-generating', this.busy);
    }
  },

  setStatus(message, type = '') {
    this.status = message;
    this.statusType = type;
    this.render();
  },

  readText(element) {
    return String(element?.innerText || element?.textContent || '').trim();
  },

  readSystem(root = document) {
    const task = root.querySelector('.task-detail');
    const title = this.readText(task?.querySelector('.task-detail__title'));
    const description = this.readText(task?.querySelector('.task-detail__description'));
    const scenario = this.readText(task?.querySelector('.task-detail__scenario-text'));
    const roles = Array.from(task?.querySelectorAll('.task-detail__role') || []);
    const selfName = this.readText(roles[0]?.querySelector('.task-detail__role-name')) || '学生';
    const agentName = this.readText(roles[1]?.querySelector('.task-detail__role-name')) || '智能体';
    if (!title && !description && !scenario) return null;
    return [
      `你正在完成 AI 实践情景对话。请扮演“${selfName}”，与“${agentName}”交流。`,
      '下面的 user 消息是智能体发言，assistant 消息是你此前生成的回复。',
      '根据最新一条智能体消息生成学生下一轮回复。只输出可直接发送的自然口语纯文本，不要角色标签或解释。禁止任何 Markdown 格式，包括加粗、列表、标题、引用、链接和代码块。',
      `任务标题：${title}`,
      `任务说明：${description}`,
      `情景：${scenario}`
    ].join('\n');
  },

  resetSession() {
    this.session = null;
    this.pendingTurn = null;
  },

  readAgentTexts(root = document) {
    return Array.from(root.querySelectorAll('.chat-container .message-list .message-row'))
      .filter(row => row.classList.contains('message-row--ai'))
      .map(row => this.readText(row.querySelector('.message-bubble')));
  },

  isPendingAgentUnchanged(root = document) {
    if (!this.pendingTurn) return true;
    const rows = Array.from(root.querySelectorAll('.chat-container .message-list .message-row'));
    const agentTexts = this.readAgentTexts(root);
    return this.readSystem(root) === this.pendingTurn.system &&
      rows[rows.length - 1]?.classList.contains('message-row--ai') &&
      agentTexts.length === this.pendingTurn.agentTexts.length &&
      agentTexts.every((text, index) => text === this.pendingTurn.agentTexts[index]);
  },

  prepareTurn(root = document) {
    const system = this.readSystem(root);
    if (!system) throw new Error('未找到任务说明');
    const rows = Array.from(root.querySelectorAll('.chat-container .message-list .message-row'));
    const lastRow = rows[rows.length - 1];
    if (!lastRow?.classList.contains('message-row--ai')) {
      throw new Error('请等待智能体回复后再生成下一轮');
    }
    const agentTexts = this.readAgentTexts(root);
    if (!agentTexts.length || !agentTexts[agentTexts.length - 1]) {
      throw new Error('未找到智能体消息');
    }

    const previous = this.session;
    const sameHistory = previous && previous.system === system &&
      previous.agentTexts.length <= agentTexts.length &&
      previous.agentTexts.every((text, index) => text === agentTexts[index]);
    if (previous && !sameHistory) {
      if (previous.system !== system) this.reasoningEffort = this.profileDefaultEffort;
      this.resetSession();
    }
    if (sameHistory && agentTexts.length === previous.agentTexts.length) {
      const input = root.querySelector('.chat-container .input-textarea');
      if (String(input?.value || '').trim()) {
        throw new Error('请先清空当前草稿，再重新生成这条回复');
      }
      return {
        system, agentTexts,
        messages: previous.messages.slice(0, -1),
        replaceCandidate: true
      };
    }
    const messages = sameHistory ? previous.messages.slice() : [{ role: 'system', content: system }];
    messages.push({ role: 'user', content: agentTexts[agentTexts.length - 1] });
    return { system, agentTexts, messages };
  },

  lockInput() {
    const input = document.querySelector('.chat-container .input-textarea');
    if (input && !this.lockedInputs.has(input)) {
      this.lockedInputs.set(input, input.readOnly);
      input.readOnly = true;
    }
  },

  unlockInputs() {
    for (const [input, readOnly] of this.lockedInputs) input.readOnly = readOnly;
    this.lockedInputs.clear();
  },

  setDraft(value) {
    const input = document.querySelector('.chat-container .input-textarea');
    if (!input) return;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.scrollTop = input.scrollHeight;
  },

  guardSend(event) {
    if (!this.busy) return;
    const target = event.target;
    const isEnter = event.type === 'keydown' && event.key === 'Enter' &&
      target?.matches?.('.chat-container .input-textarea');
    const isSendClick = event.type === 'click' && target?.closest?.('.chat-container .send-button');
    const isSubmit = event.type === 'submit' && target?.closest?.('.chat-container');
    if (isEnter || isSendClick || isSubmit) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },

  async start() {
    if (this.busy || this.checking) return;
    this.checking = true;
    this.render();
    const state = await this.requestAgentState();
    this.checking = false;
    if (state !== false) {
      this.setStatus(state === true ? '请等待智能体回复完成' : '无法确认智能体是否已结束回复', 'error');
      return;
    }
    if (this.reasoningEffort === null) {
      this.setStatus('模型设置尚未就绪', 'error');
      return;
    }
    if (!document.querySelector('.chat-container .input-textarea')) {
      this.setStatus('未找到对话输入框', 'error');
      return;
    }
    let turn;
    try {
      turn = this.prepareTurn();
    } catch (err) {
      this.setStatus(err.message, 'error');
      return;
    }

    if (turn.replaceCandidate) {
      this.session = {
        system: turn.system,
        agentTexts: turn.agentTexts.slice(0, -1),
        messages: turn.messages.slice(0, -1)
      };
    }
    this.generated = '';
    this.pendingTurn = turn;
    this.busy = true;
    this.lockInput();
    this.setStatus('正在连接模型…');
    let port;
    try {
      port = chrome.runtime.connect({ name: 'AI_DIALOGUE_STREAM' });
      this.port = port;
      port.onMessage.addListener(message => {
        if (this.port !== port) return;
        if (this.agentState !== false || !this.isPendingAgentUnchanged()) {
          this.stop('智能体回复内容发生变化，本次生成已取消');
          return;
        }
        if (message.type === 'delta') {
          this.generated += message.delta;
          this.setDraft(this.generated);
          this.setStatus('正在生成…');
        } else if (message.type === 'done') {
          if (typeof message.text === 'string') {
            this.generated = message.text;
            this.setDraft(this.generated);
          }
          if (!this.generated.trim()) {
            this.finish(port, '生成失败：模型未返回回复', 'error');
          } else {
            this.session = {
              system: turn.system,
              agentTexts: turn.agentTexts,
              messages: [...turn.messages, { role: 'assistant', content: this.generated,
                ...(message.protocolState ? { protocolState: message.protocolState } : {}) }]
            };
            this.finish(port, '回复已生成，请检查后发送');
          }
        } else if (message.type === 'error') {
          this.finish(port, `生成失败：${message.message}`, 'error');
        } else if (message.type === 'cancelled') {
          this.finish(port, '已停止生成');
        }
      });
      port.onDisconnect.addListener(() => {
        if (this.port === port) this.finish(port, '连接已中断，已生成内容可继续编辑', 'error');
      });
      port.postMessage({ type: 'start', messages: turn.messages, reasoningEffort: this.reasoningEffort,
        ...(this.profileConfig ? { config: this.profileConfig } : {}) });
      this.keepAliveTimer = setInterval(() => {
        if (this.port !== port) return;
        try { port.postMessage({ type: 'ping' }); }
        catch (err) { this.finish(port, '连接已中断，已生成内容可继续编辑', 'error'); }
      }, 20000);
    } catch (err) {
      this.finish(port, `启动失败：${err.message}`, 'error');
    }
  },

  finish(port, message, type = '') {
    if (port && this.port !== port) return;
    this.port = null;
    this.busy = false;
    this.pendingTurn = null;
    clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
    this.unlockInputs();
    this.setStatus(message, type);
    try { port?.disconnect(); } catch (err) { /* Already disconnected. */ }
  },

  stop(message = '已停止生成') {
    if (!this.busy) return;
    const port = this.port;
    try { port?.postMessage({ type: 'cancel' }); } catch (err) { /* The port may be closed. */ }
    this.finish(port, message);
  }
};
