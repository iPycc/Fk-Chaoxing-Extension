// Popup navigation, model management and answer launch.
class PopupController {
  constructor() {
    this.views = ['home', 'settings', 'models', 'model-editor'];
    this.logContainer = document.getElementById('log-content');
    this.pageTitleEl = document.getElementById('page-title');
    this.pageUrlEl = document.getElementById('page-url');
    this.pageFaviconEl = document.getElementById('page-favicon');
    this.pluginToggleEl = document.getElementById('plugin-toggle');
    this.btnExtractAuto = document.getElementById('btn-extract-auto');
    this.btnAiAnswer = document.getElementById('btn-ai-answer');
    this.btnAiText = document.getElementById('btn-ai-text');
    this.aiQuickReasoning = document.getElementById('ai-quick-reasoning');
    this.aiProfileName = document.getElementById('ai-profile-name');
    this.aiBaseUrl = document.getElementById('ai-base-url');
    this.aiApiKey = document.getElementById('ai-api-key');
    this.aiModelId = document.getElementById('ai-model-id');
    this.aiApiPath = document.getElementById('ai-api-path');
    this.aiTemperature = document.getElementById('ai-temperature');
    this.aiApiType = document.getElementById('ai-api-type');
    this.aiApiVersion = document.getElementById('ai-api-version');
    this.aiWorkspaceId = document.getElementById('ai-workspace-id');
    this.aiClaudeFallbackMaxTokens = document.getElementById('ai-claude-fallback-max-tokens');
    this.aiModelChoice = document.getElementById('ai-model-choice');
    this.aiModelOptions = document.getElementById('ai-model-options');
    this.aiModelOptionsToggle = document.getElementById('btn-ai-model-options');
    this.remoteModels = [];
    this.activeModelIndex = -1;
    this.aiReasoningEffort = document.getElementById('ai-reasoning-effort');
    this.aiAnswerPrompt = document.getElementById('ai-answer-prompt');
    this.aiChatPrompt = document.getElementById('ai-chat-prompt');
    this.aiProfiles = [];
    this.activeAiProfileId = null;
    this.editorId = null;
    this.editorSnapshot = '';
    this.currentView = 'home';
    this.modelQuery = null;
    this.currentTab = null;
    this.isEnabled = true;
    this.init();
  }

  async init() {
    this.bindEvents();
    await Promise.all([this.loadPluginState(), this.loadBatchSettings()]);
    const draft = await this.loadAiProfiles();
    await this.getCurrentTab();
    this.detectPageType();
    await this.loadInitialLogs();
    this.updateQuestionCount();
    this.startLogListener();
    if (!this.aiProfiles.length && draft) this.openEditor(null, draft);
  }

  navigate(view, force = false) {
    if (!force && this.currentView === 'model-editor' && view !== 'model-editor' &&
        this.editorSnapshot !== JSON.stringify(this.formState()) &&
        !window.confirm('模型配置尚未保存，确定放弃修改吗？')) return false;
    if (this.currentView === 'model-editor' && view !== 'model-editor') this.invalidateModelQuery();
    this.views.forEach(name => { document.getElementById(`view-${name}`).hidden = name !== view; });
    this.currentView = view;
    return true;
  }

  getDefaultAiProfile() {
    return { id: '', name: '', baseUrl: '', path: '/chat/completions', apiKey: '', model: '',
      apiType: 'chat_completions', apiVersion: '2026-10-21', workspaceId: '', reasoningEffort: '', temperature: 0.3,
      answerPrompt: AIConfig.defaultAnswerPrompt, chatPrompt: AIConfig.defaultChatPrompt };
  }

  normalizeAiProfile(profile = {}) {
    const normalized = AIConfig.normalize({ ...profile,
      path: profile.path || AIConfig.defaultPath(profile.apiType),
      temperature: profile.temperature === undefined ? AIConfig.defaultTemperature(profile.apiType) : profile.temperature });
    normalized.id = profile.id || `model-${Date.now()}`;
    normalized.name = (profile.name || profile.model || '未命名模型').trim();
    return normalized;
  }

  async loadAiProfiles() {
    const data = await chrome.storage.local.get(['aiProfiles', 'activeAiProfileId', 'aiConfig', 'aiConfigDraft']);
    this.aiProfiles = (Array.isArray(data.aiProfiles) ? data.aiProfiles : []).map(item => this.normalizeAiProfile(item));
    if (!this.aiProfiles.length && data.aiConfig) {
      this.aiProfiles = [this.normalizeAiProfile(data.aiConfig)];
      this.activeAiProfileId = this.aiProfiles[0].id;
      await this.persistAiProfiles();
    } else {
      this.activeAiProfileId = this.aiProfiles.some(item => item.id === data.activeAiProfileId)
        ? data.activeAiProfileId : this.aiProfiles[0]?.id || null;
    }
    this.renderAiProfileList();
    this.updateAiAnswerButton();
    this.resetQuickReasoning();
    return data.aiConfigDraft;
  }

  getActiveAiProfile() {
    return this.aiProfiles.find(item => item.id === this.activeAiProfileId) || this.aiProfiles[0] || null;
  }

  async persistAiProfiles() {
    await chrome.storage.local.set({ aiProfiles: this.aiProfiles, activeAiProfileId: this.activeAiProfileId,
      aiConfig: this.getActiveAiProfile() });
  }

  renderAiProfileList() {
    const list = document.getElementById('ai-profile-list');
    list.replaceChildren();
    document.getElementById('settings-model-summary').textContent = this.aiProfiles.length
      ? `${this.aiProfiles.length} 个模型 · 当前：${this.getActiveAiProfile()?.name}` : '尚未配置模型';
    if (!this.aiProfiles.length) {
      const empty = document.createElement('p');
      empty.className = 'settings-caption';
      empty.textContent = '还没有模型。点击右上角“添加”开始配置。';
      list.appendChild(empty);
    }
    this.aiProfiles.forEach(profile => {
      const row = document.createElement('div');
      row.className = 'profile-row';
      const meta = document.createElement('div');
      meta.className = 'profile-meta';
      const name = document.createElement('strong');
      name.textContent = profile.name;
      const model = document.createElement('small');
      model.textContent = profile.model;
      meta.append(name, model);
      row.appendChild(meta);
      if (profile.id === this.activeAiProfileId) {
        const active = document.createElement('span');
        active.className = 'profile-active';
        active.textContent = '当前使用';
        row.appendChild(active);
      } else {
        const activate = document.createElement('button');
        activate.type = 'button';
        activate.className = 'btn btn-outline profile-activate';
        activate.textContent = '使用';
        activate.addEventListener('click', async () => {
          activate.disabled = true;
          try {
            await this.requestAiHostPermission(profile.baseUrl);
            this.activeAiProfileId = profile.id;
            await this.persistAiProfiles();
            this.renderAiProfileList();
            this.updateAiAnswerButton();
            this.resetQuickReasoning();
          } catch (err) {
            this.log('error', `切换模型失败：${err.message}`);
            activate.disabled = false;
          }
        });
        row.appendChild(activate);
      }
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn-icon profile-edit';
      edit.title = `编辑 ${profile.name}`;
      edit.setAttribute('aria-label', edit.title);
      edit.textContent = '✎';
      edit.addEventListener('click', () => this.openEditor(profile));
      row.appendChild(edit);
      list.appendChild(row);
    });
  }

  async loadBatchSettings() {
    const settings = await AIConfig.loadBatchSettings();
    document.getElementById('ai-batch-size').value = settings.batchSize;
    document.getElementById('ai-concurrency').value = settings.concurrency;
    document.getElementById('ai-max-retries').value = settings.maxRetries;
    document.getElementById('ai-timeout-seconds').value = settings.timeoutSeconds;
  }

  async saveBatchSettings() {
    const error = document.getElementById('batch-settings-error');
    error.hidden = true;
    try {
      const settings = AIConfig.normalizeBatchSettings({
        batchSize: document.getElementById('ai-batch-size').value,
        concurrency: document.getElementById('ai-concurrency').value,
        maxRetries: document.getElementById('ai-max-retries').value,
        timeoutSeconds: document.getElementById('ai-timeout-seconds').value
      });
      await chrome.storage.local.set({ aiBatchSettings: settings });
      this.log('success', '答题设置已保存');
      this.navigate('home');
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  }

  formState() {
    return { name: this.aiProfileName.value, baseUrl: this.aiBaseUrl.value, apiKey: this.aiApiKey.value,
      model: this.aiModelId.value, path: this.aiApiPath.value, apiType: this.aiApiType.value,
      apiVersion: this.aiApiVersion.value, workspaceId: this.aiWorkspaceId.value,
      claudeFallbackMaxTokens: this.aiClaudeFallbackMaxTokens.value,
      reasoningEffort: this.aiReasoningEffort.value, temperature: this.aiTemperature.value,
      answerPrompt: this.aiAnswerPrompt.value, chatPrompt: this.aiChatPrompt.value };
  }

  openEditor(profile = null, draft = null) {
    this.invalidateModelQuery();
    this.editorId = profile?.id || null;
    const data = AIConfig.normalize(profile || draft || this.getDefaultAiProfile());
    this.aiProfileName.value = data.name || '';
    this.aiBaseUrl.value = data.baseUrl || '';
    this.aiApiKey.value = data.apiKey || '';
    this.aiModelId.value = data.model || '';
    this.aiApiType.value = data.apiType || 'chat_completions';
    this.aiApiVersion.value = data.apiVersion || '2026-10-21';
    this.aiWorkspaceId.value = data.workspaceId || '';
    this.aiClaudeFallbackMaxTokens.value = data.claudeFallbackMaxTokens ?? '';
    this.aiApiPath.value = data.path || AIConfig.defaultPath(data.apiType);
    this.aiReasoningEffort.value = data.reasoningEffort || '';
    this.aiTemperature.value = data.temperature ?? '';
    this.aiAnswerPrompt.value = data.answerPrompt;
    this.aiChatPrompt.value = data.chatPrompt;
    this.aiApiKey.type = 'password';
    document.getElementById('btn-key-visibility').title = '显示密钥';
    document.getElementById('btn-key-visibility').setAttribute('aria-label', '显示密钥');
    document.getElementById('btn-key-visibility').textContent = '显示';
    document.getElementById('model-editor-title').textContent = profile ? '编辑模型' : '添加模型';
    document.getElementById('btn-ai-config-delete').hidden = !profile;
    document.getElementById('model-editor-error').hidden = true;
    document.getElementById('model-editor-status').hidden = true;
    this.updateTemperatureState();
    this.editorSnapshot = JSON.stringify(this.formState());
    this.navigate('model-editor', true);
  }

  readAiProfileForm() {
    return AIConfig.normalize({ ...this.formState(), id: this.editorId || `model-${Date.now()}` });
  }

  validateAiConnection(profile) {
    if (!profile.baseUrl) throw new Error('请填写 API 地址');
    let url;
    try { url = new URL(profile.baseUrl); } catch (err) { throw new Error('API 地址格式不正确'); }
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('API 地址需使用 HTTP 或 HTTPS');
    if (!profile.apiKey) throw new Error('请填写 API 密钥');
  }

  validateAiProfile(profile) {
    if (!profile.name) throw new Error('请填写显示名称');
    this.validateAiConnection(profile);
    if (!profile.model) throw new Error('请填写模型 ID');
  }

  renderModelOptions(models) {
    this.setModelOptionsOpen(false);
    this.remoteModels = models;
    this.aiModelOptions.replaceChildren();
    models.forEach((model, index) => {
      const option = document.createElement('li');
      option.id = `ai-model-option-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.textContent = model.id;
      option.addEventListener('click', () => this.selectModelOption(index));
      this.aiModelOptions.appendChild(option);
    });
    if (!models.length) {
      const empty = document.createElement('li');
      empty.className = 'model-options-empty';
      empty.setAttribute('role', 'presentation');
      empty.textContent = '暂无可选模型，可拉取模型或直接输入 ID。';
      this.aiModelOptions.appendChild(empty);
    }
  }

  setModelOptionsOpen(open) {
    this.aiModelOptions.hidden = !open;
    this.aiModelId.setAttribute('aria-expanded', String(open));
    this.aiModelOptionsToggle.setAttribute('aria-expanded', String(open));
    this.aiModelOptionsToggle.setAttribute('aria-label', open ? '收起模型列表' : '展开模型列表');
    this.setActiveModelOption(open ? this.remoteModels.findIndex(model => model.id === this.aiModelId.value) : -1);
  }

  setActiveModelOption(index) {
    this.activeModelIndex = index;
    const options = this.aiModelOptions.querySelectorAll('[role="option"]');
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    if (index < 0) this.aiModelId.removeAttribute('aria-activedescendant');
    else {
      this.aiModelId.setAttribute('aria-activedescendant', options[index].id);
      options[index].scrollIntoView({ block: 'nearest' });
    }
  }

  selectModelOption(index) {
    this.aiModelId.value = this.remoteModels[index].id;
    this.setModelOptionsOpen(false);
    this.aiModelId.focus();
  }

  handleModelChoiceKey(event) {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const wasOpen = !this.aiModelOptions.hidden;
      if (!wasOpen) this.setModelOptionsOpen(true);
      const count = this.remoteModels.length;
      if (!count) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const index = this.activeModelIndex < 0 ? (direction > 0 ? 0 : count - 1)
        : wasOpen ? (this.activeModelIndex + direction + count) % count : this.activeModelIndex;
      this.setActiveModelOption(index);
    } else if (event.key === 'Enter' && !this.aiModelOptions.hidden && this.activeModelIndex >= 0) {
      event.preventDefault();
      this.selectModelOption(this.activeModelIndex);
    } else if (event.key === 'Escape' && !this.aiModelOptions.hidden) {
      event.preventDefault();
      this.setModelOptionsOpen(false);
    } else if (event.key === 'Tab') this.setModelOptionsOpen(false);
  }

  invalidateModelQuery() {
    const query = this.modelQuery;
    this.modelQuery = null;
    if (query?.keepAliveTimer) clearInterval(query.keepAliveTimer);
    if (query?.port) {
      try { query.port.postMessage({ type: 'cancel' }); } catch (_) { /* Already disconnected. */ }
      query.port.disconnect();
    }
    document.getElementById('btn-ai-models-fetch').disabled = false;
    document.getElementById('ai-models-status').hidden = true;
    this.renderModelOptions([]);
  }

  async fetchAiModels() {
    this.invalidateModelQuery();
    const query = {};
    this.modelQuery = query;
    const button = document.getElementById('btn-ai-models-fetch');
    const status = document.getElementById('ai-models-status');
    const finish = (message, models) => {
      if (this.modelQuery !== query || query.finished) return;
      query.finished = true;
      if (query.keepAliveTimer) clearInterval(query.keepAliveTimer);
      const port = query.port;
      query.port = null;
      port?.disconnect();
      button.disabled = false;
      status.hidden = false;
      status.textContent = message;
      this.renderModelOptions(models || []);
    };
    button.disabled = true;
    status.hidden = false;
    status.textContent = '正在拉取模型…';
    try {
      // Discovery only requires connection fields, independent of generation settings.
      const config = AIConfig.normalize({ baseUrl: this.aiBaseUrl.value, apiKey: this.aiApiKey.value,
        path: this.aiApiPath.value, apiType: this.aiApiType.value,
        apiVersion: this.aiApiVersion.value, workspaceId: this.aiWorkspaceId.value });
      this.validateAiConnection(config);
      await this.requestAiHostPermission(config.baseUrl);
      if (this.modelQuery !== query) return;
      const port = chrome.runtime.connect({ name: 'AI_MODEL_QUERY' });
      query.port = port;
      query.keepAliveTimer = setInterval(() => {
        try { port.postMessage({ type: 'ping' }); }
        catch (_) { finish('模型查询连接中断，可重试或手动填写 ID。'); }
      }, 20000);
      port.onMessage.addListener(message => {
        if (message.type === 'done') finish(message.models.length ? `已拉取 ${message.models.length} 个模型，请选择或手动填写 ID。` : '模型列表为空，可继续手动填写 ID。', message.models);
        if (message.type === 'error') finish(`拉取失败：${message.message}。可重试或手动填写 ID。`);
      });
      port.onDisconnect.addListener(() => {
        if (query.port === port) { query.port = null; finish('模型查询连接中断，可重试或手动填写 ID。'); }
      });
      port.postMessage({ type: 'start', config });
    } catch (error) { finish(`拉取失败：${error.message}`); }
  }

  showEditorMessage(message, type = 'error') {
    const element = document.getElementById(`model-editor-${type}`);
    element.textContent = message;
    element.hidden = !message;
    document.getElementById(`model-editor-${type === 'error' ? 'status' : 'error'}`).hidden = true;
  }

  async saveAiProfile() {
    const button = document.getElementById('btn-ai-config-save');
    button.disabled = true;
    try {
      const profile = this.readAiProfileForm();
      this.validateAiProfile(profile);
      await this.requestAiHostPermission(profile.baseUrl);
      const index = this.aiProfiles.findIndex(item => item.id === profile.id);
      if (index < 0) this.aiProfiles.push(profile);
      else this.aiProfiles[index] = profile;
      this.activeAiProfileId = profile.id;
      await this.persistAiProfiles();
      await chrome.storage.local.remove('aiConfigDraft');
      this.editorSnapshot = JSON.stringify(this.formState());
      this.renderAiProfileList();
      this.updateAiAnswerButton();
      this.resetQuickReasoning();
      this.log('success', `模型 ${profile.name} 已保存`);
      this.navigate('models', true);
    } catch (err) {
      this.showEditorMessage(`保存失败：${err.message}`);
    } finally {
      button.disabled = false;
    }
  }

  async deleteAiProfile() {
    if (!this.editorId || !window.confirm('确定删除这个模型配置吗？')) return;
    this.aiProfiles = this.aiProfiles.filter(item => item.id !== this.editorId);
    if (this.activeAiProfileId === this.editorId) this.activeAiProfileId = this.aiProfiles[0]?.id || null;
    await this.persistAiProfiles();
    this.renderAiProfileList();
    this.updateAiAnswerButton();
    this.resetQuickReasoning();
    this.log('success', '模型配置已删除');
    this.navigate('models', true);
  }

  async requestAiHostPermission(baseUrl) {
    const origin = `${new URL(baseUrl).origin}/*`;
    if (await chrome.permissions.contains({ origins: [origin] })) return;
    if (!await chrome.permissions.request({ origins: [origin] })) throw new Error(`未授权访问 ${origin}`);
  }

  async authorizeImageSite() {
    const button = document.getElementById('btn-image-site-authorize');
    const status = document.getElementById('image-site-status');
    button.disabled = true;
    status.hidden = true;
    try {
      let url;
      try { url = new URL(document.getElementById('ai-image-site').value.trim()); }
      catch (_) { throw new Error('请填写完整的 HTTP 或 HTTPS 图片网站地址'); }
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('图片网站地址必须使用 HTTP 或 HTTPS');
      // Request directly from the click handler, before any asynchronous work.
      if (!await chrome.permissions.request({ origins: [`${url.origin}/*`] })) throw new Error(`未授权访问 ${url.origin}，图片请求不会继续`);
      status.className = 'settings-caption';
      status.textContent = `已授权 ${url.origin}，请回到页面重试。`;
    } catch (error) {
      status.className = 'field-error';
      status.textContent = error.message;
    } finally {
      status.hidden = false;
      button.disabled = false;
    }
  }

  async testAiConnection() {
    const button = document.getElementById('btn-ai-config-test');
    button.disabled = true;
    this.showEditorMessage('正在测试连接（会调用一次模型）', 'status');
    try {
      const profile = this.readAiProfileForm();
      this.validateAiProfile(profile);
      await this.requestAiHostPermission(profile.baseUrl);
      const result = await chrome.runtime.sendMessage({ type: 'AI_API_REQUEST',
        data: { config: profile, messages: [{ role: 'user', content: '仅回复 OK' }] } });
      if (!result?.success) throw new Error(result?.error || '连接测试失败');
      this.showEditorMessage('连接测试通过。尚未保存的修改仍需点击“保存”。', 'status');
    } catch (err) {
      this.showEditorMessage(`连接测试失败：${err.message}`);
    } finally {
      button.disabled = false;
    }
  }

  updateTemperatureState() {
    this.aiTemperature.disabled = this.aiReasoningEffort.value !== '' || this.aiApiType.value === 'anthropic_messages';
    document.getElementById('ai-native-connection').hidden = this.aiApiType.value !== 'anthropic_messages';
  }

  resetQuickReasoning() {
    this.aiQuickReasoning.value = this.getActiveAiProfile()?.reasoningEffort || '';
  }

  updateAiAnswerButton() {
    const profile = this.getActiveAiProfile();
    this.btnAiText.textContent = profile ? '打开作答页面' : '请先配置 AI 模型';
    this.btnAiAnswer.disabled = !this.isEnabled;
  }

  async loadPluginState() {
    const data = await chrome.storage.local.get('pluginEnabled');
    this.isEnabled = data.pluginEnabled !== false;
    this.pluginToggleEl.checked = this.isEnabled;
    this.updateButtonsState();
  }

  updateButtonsState() {
    this.btnExtractAuto.disabled = !this.isEnabled;
    this.btnAiAnswer.disabled = !this.isEnabled;
  }

  async togglePluginState() {
    this.isEnabled = this.pluginToggleEl.checked;
    await chrome.storage.local.set({ pluginEnabled: this.isEnabled });
    this.log(this.isEnabled ? 'success' : 'warning', `插件已${this.isEnabled ? '开启' : '关闭'}，刷新页面生效`);
    this.updateButtonsState();
  }

  async getCurrentTab() {
    [this.currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }

  detectPageType() {
    if (!this.currentTab) return;
    const { url = '', title = '未知页面', favIconUrl } = this.currentTab;
    this.pageTitleEl.textContent = title;
    try { this.pageUrlEl.textContent = new URL(url).hostname; }
    catch (err) { this.pageUrlEl.textContent = url; }
    this.pageFaviconEl.src = favIconUrl || 'icons/chaoxing.png';
  }

  async getQuestions() {
    if (!this.isEnabled || !this.currentTab) return;
    this.btnExtractAuto.disabled = true;
    try {
      const result = await chrome.tabs.sendMessage(this.currentTab.id, { action: 'getQuestions' });
      if (!result?.success) throw new Error(result?.message || '获取题目失败');
      await chrome.action.setBadgeText({ text: String(result.count), tabId: this.currentTab.id });
      this.log('success', `共获取 ${result.count} 道题目`);
      await chrome.tabs.sendMessage(this.currentTab.id, { action: 'showQuestionModal', content: result.content });
    } catch (err) {
      this.log('error', `获取题目失败：${err.message}`);
    } finally {
      this.btnExtractAuto.disabled = !this.isEnabled;
    }
  }

  async aiAnswer() {
    if (!this.isEnabled || !this.currentTab) return;
    const profile = this.getActiveAiProfile();
    if (!profile) {
      this.log('warning', '请先配置 AI 模型');
      this.navigate('settings');
      return;
    }
    this.btnAiAnswer.disabled = true;
    this.aiQuickReasoning.disabled = true;
    try {
      const config = AIConfig.normalize({ ...profile,
        reasoningEffort: this.aiQuickReasoning.value || profile.reasoningEffort });
      this.validateAiProfile(config);
      await this.requestAiHostPermission(config.baseUrl);
      const response = await chrome.tabs.sendMessage(this.currentTab.id,
        { action: 'openAiChat', reasoningEffort: config.reasoningEffort }, { frameId: 0 });
      if (!response?.success) throw new Error(response?.message || '启动答题任务失败');
      this.log('info', '已打开页面内 AI 对话窗');
    } catch (err) {
      this.log('error', `AI 答题失败：${err.message}`);
    } finally {
      this.btnAiAnswer.disabled = !this.isEnabled;
      this.aiQuickReasoning.disabled = false;
      this.resetQuickReasoning();
    }
  }

  async updateQuestionCount() {
    if (!this.currentTab) return;
    try {
      const result = await chrome.tabs.sendMessage(this.currentTab.id, { action: 'getQuestionCount' });
      if (result?.success && result.count > 0) {
        await chrome.action.setBadgeText({ text: String(result.count), tabId: this.currentTab.id });
        await chrome.action.setBadgeBackgroundColor({ color: '#f53f3f', tabId: this.currentTab.id });
      }
    } catch (err) { /* Page may not be ready. */ }
  }

  log(type, message) {
    const item = document.createElement('div');
    item.className = `log-item ${type}`;
    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const text = document.createElement('span');
    text.className = 'log-msg';
    text.textContent = message;
    if (this.logContainer.firstElementChild?.textContent.includes('等待操作')) this.logContainer.replaceChildren();
    item.append(time, text);
    this.logContainer.appendChild(item);
    while (this.logContainer.children.length > 50) this.logContainer.firstElementChild.remove();
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
  }

  async loadInitialLogs() {
    if (!this.currentTab) return;
    try {
      const result = await chrome.tabs.sendMessage(this.currentTab.id, { action: 'getLogs' });
      if (result?.success) result.logs?.forEach(entry => this.log(entry.type, entry.message));
    } catch (err) { /* Page may not be ready. */ }
  }

  startLogListener() {
    chrome.runtime.onMessage.addListener(request => {
      if (request.action === 'log' && request.log) this.log(request.log.type, request.log.message);
    });
  }

  bindEvents() {
    const on = (id, event, handler) => document.getElementById(id).addEventListener(event, handler);
    on('btn-ai-config-open', 'click', () => this.navigate('settings'));
    on('btn-settings-back', 'click', () => this.navigate('home'));
    on('btn-models-open', 'click', () => this.navigate('models'));
    on('btn-models-back', 'click', () => this.navigate('settings'));
    on('btn-model-editor-back', 'click', () => this.navigate('models'));
    on('btn-ai-profile-new', 'click', () => this.openEditor());
    on('btn-batch-save', 'click', () => this.saveBatchSettings());
    on('btn-image-site-authorize', 'click', () => this.authorizeImageSite());
    on('ai-image-site', 'input', () => { document.getElementById('image-site-status').hidden = true; });
    ['ai-batch-size', 'ai-concurrency', 'ai-max-retries', 'ai-timeout-seconds'].forEach(id => {
      on(id, 'input', () => { document.getElementById('batch-settings-error').hidden = true; });
    });
    on('btn-ai-config-save', 'click', () => this.saveAiProfile());
    on('btn-ai-config-delete', 'click', () => this.deleteAiProfile());
    on('btn-ai-config-test', 'click', () => this.testAiConnection());
    on('btn-ai-models-fetch', 'click', () => this.fetchAiModels());
    on('btn-ai-model-options', 'click', () => {
      this.setModelOptionsOpen(this.aiModelOptions.hidden);
      this.aiModelId.focus();
    });
    on('ai-model-id', 'input', () => this.setModelOptionsOpen(false));
    on('ai-model-choice', 'keydown', event => this.handleModelChoiceKey(event));
    on('ai-model-options', 'mousedown', event => event.preventDefault());
    on('ai-model-choice', 'focusout', event => {
      if (!this.aiModelChoice.contains(event.relatedTarget)) this.setModelOptionsOpen(false);
    });
    document.addEventListener('click', event => {
      if (!this.aiModelChoice.contains(event.target)) this.setModelOptionsOpen(false);
    });
    ['ai-base-url', 'ai-api-key', 'ai-api-path', 'ai-api-type', 'ai-api-version', 'ai-workspace-id'].forEach(id => {
      on(id, 'input', () => this.invalidateModelQuery());
      on(id, 'change', () => this.invalidateModelQuery());
    });
    on('btn-prompt-reset', 'click', () => {
      this.aiAnswerPrompt.value = AIConfig.defaultAnswerPrompt;
      this.aiChatPrompt.value = AIConfig.defaultChatPrompt;
      document.getElementById('prompt-preview').hidden = true;
    });
    on('btn-prompt-preview', 'click', () => {
      const preview = document.getElementById('prompt-preview');
      const config = { answerPrompt: this.aiAnswerPrompt.value, chatPrompt: this.aiChatPrompt.value };
      preview.textContent = ['answer', 'chat', 'extract'].map(mode => {
        const label = { answer: '作答：生成答案', chat: '讨论：发送', extract: '提取：填入答案' }[mode];
        const context = mode === 'extract' ? '[讨论记录与当前作答目标]' : '[所选题目与答题区现有内容]';
        return `${label}\nSystem: ${AIConfig.buildSystemPrompt(config, mode)}\n\nUser: ${context}${mode === 'chat' ? '\n[本轮输入]' : ''}`;
      }).join('\n\n────────\n\n');
      preview.hidden = false;
    });
    on('btn-key-visibility', 'click', event => {
      const visible = this.aiApiKey.type === 'password';
      this.aiApiKey.type = visible ? 'text' : 'password';
      event.currentTarget.title = visible ? '隐藏密钥' : '显示密钥';
      event.currentTarget.setAttribute('aria-label', event.currentTarget.title);
      event.currentTarget.textContent = visible ? '隐藏' : '显示';
    });
    on('ai-api-type', 'change', () => {
      this.aiApiPath.value = AIConfig.switchPath(this.aiApiPath.value, this.aiApiType.value);
      if (this.aiApiType.value === 'responses' && this.aiTemperature.value === '0.3') this.aiTemperature.value = '';
      this.updateTemperatureState();
    });
    on('ai-reasoning-effort', 'change', () => this.updateTemperatureState());
    on('btn-ai-answer', 'click', () => this.aiAnswer());
    on('btn-extract-auto', 'click', () => this.getQuestions());
    on('plugin-toggle', 'change', () => this.togglePluginState());
    on('btn-refresh', 'click', () => chrome.runtime.reload());
    on('btn-clear-log', 'click', () => this.logContainer.replaceChildren());
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.aiProfiles) this.aiProfiles = (changes.aiProfiles.newValue || []).map(item => this.normalizeAiProfile(item));
      if (changes.activeAiProfileId) this.activeAiProfileId = changes.activeAiProfileId.newValue;
      if (changes.aiProfiles || changes.activeAiProfileId) {
        this.renderAiProfileList();
        this.updateAiAnswerButton();
        if (!this.aiQuickReasoning.disabled) this.resetQuickReasoning();
      }
      if (changes.aiBatchSettings && this.currentView === 'settings') this.loadBatchSettings();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => new PopupController());
