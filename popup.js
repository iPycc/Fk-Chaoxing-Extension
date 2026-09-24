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
    this.btnAutoApplyToggle = document.getElementById('btn-auto-apply-toggle');
    this.btnAutoApplyText = document.getElementById('btn-auto-apply-text');
    this.btnAiText = document.getElementById('btn-ai-text');
    this.aiQuickReasoning = document.getElementById('ai-quick-reasoning');
    this.aiProfileName = document.getElementById('ai-profile-name');
    this.aiBaseUrl = document.getElementById('ai-base-url');
    this.aiApiKey = document.getElementById('ai-api-key');
    this.aiModelId = document.getElementById('ai-model-id');
    this.aiApiPath = document.getElementById('ai-api-path');
    this.aiTemperature = document.getElementById('ai-temperature');
    this.aiApiType = document.getElementById('ai-api-type');
    this.aiReasoningEffort = document.getElementById('ai-reasoning-effort');
    this.aiProfiles = [];
    this.activeAiProfileId = null;
    this.editorId = null;
    this.editorSnapshot = '';
    this.currentView = 'home';
    this.currentTab = null;
    this.isEnabled = true;
    this.autoApplyAnswers = false;
    this.init();
  }

  async init() {
    this.bindEvents();
    await Promise.all([this.loadPluginState(), this.loadAutoApplyState(), this.loadBatchSettings()]);
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
    this.views.forEach(name => { document.getElementById(`view-${name}`).hidden = name !== view; });
    this.currentView = view;
    return true;
  }

  getDefaultAiProfile() {
    return { id: '', name: '', baseUrl: '', path: '/chat/completions', apiKey: '', model: '',
      apiType: 'chat_completions', reasoningEffort: '', temperature: 0.3 };
  }

  normalizeAiProfile(profile = {}) {
    const normalized = AIConfig.normalize({ ...this.getDefaultAiProfile(), ...profile,
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
          this.activeAiProfileId = profile.id;
          await this.persistAiProfiles();
          this.renderAiProfileList();
          this.updateAiAnswerButton();
          this.resetQuickReasoning();
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
  }

  async saveBatchSettings() {
    const error = document.getElementById('batch-settings-error');
    error.hidden = true;
    try {
      const settings = AIConfig.normalizeBatchSettings({
        batchSize: document.getElementById('ai-batch-size').value,
        concurrency: document.getElementById('ai-concurrency').value,
        maxRetries: document.getElementById('ai-max-retries').value
      });
      await chrome.storage.local.set({ aiBatchSettings: settings });
      this.log('success', '答题设置已保存');
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  }

  formState() {
    return { name: this.aiProfileName.value, baseUrl: this.aiBaseUrl.value, apiKey: this.aiApiKey.value,
      model: this.aiModelId.value, path: this.aiApiPath.value, apiType: this.aiApiType.value,
      reasoningEffort: this.aiReasoningEffort.value, temperature: this.aiTemperature.value };
  }

  openEditor(profile = null, draft = null) {
    this.editorId = profile?.id || null;
    const data = profile || draft || this.getDefaultAiProfile();
    this.aiProfileName.value = data.name || '';
    this.aiBaseUrl.value = data.baseUrl || '';
    this.aiApiKey.value = data.apiKey || '';
    this.aiModelId.value = data.model || '';
    this.aiApiType.value = data.apiType || 'chat_completions';
    this.aiApiPath.value = data.path || AIConfig.defaultPath(data.apiType);
    this.aiReasoningEffort.value = data.reasoningEffort || '';
    this.aiTemperature.value = data.temperature ?? '';
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

  validateAiProfile(profile) {
    if (!profile.name) throw new Error('请填写显示名称');
    if (!profile.baseUrl) throw new Error('请填写 API 地址');
    let url;
    try { url = new URL(profile.baseUrl); } catch (err) { throw new Error('API 地址格式不正确'); }
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('API 地址需使用 HTTP 或 HTTPS');
    if (!profile.apiKey) throw new Error('请填写 API 密钥');
    if (!profile.model) throw new Error('请填写模型 ID');
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
    this.aiTemperature.disabled = this.aiReasoningEffort.value !== '';
  }

  resetQuickReasoning() {
    this.aiQuickReasoning.value = this.getActiveAiProfile()?.reasoningEffort || '';
  }

  updateAiAnswerButton() {
    const profile = this.getActiveAiProfile();
    this.btnAiText.textContent = profile ? `使用 ${profile.name} 答题` : '请先配置 AI 模型';
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
    this.btnAutoApplyToggle.disabled = !this.isEnabled;
  }

  async togglePluginState() {
    this.isEnabled = this.pluginToggleEl.checked;
    await chrome.storage.local.set({ pluginEnabled: this.isEnabled });
    this.log(this.isEnabled ? 'success' : 'warning', `插件已${this.isEnabled ? '开启' : '关闭'}，刷新页面生效`);
    this.updateButtonsState();
  }

  async loadAutoApplyState() {
    const data = await chrome.storage.local.get('autoApplyAnswers');
    this.autoApplyAnswers = data.autoApplyAnswers === true;
    this.updateAutoApplyButton();
  }

  updateAutoApplyButton() {
    this.btnAutoApplyText.textContent = `自动作答：${this.autoApplyAnswers ? '开启' : '关闭'}`;
    this.btnAutoApplyToggle.classList.toggle('active', this.autoApplyAnswers);
  }

  async toggleAutoApplyState() {
    this.autoApplyAnswers = !this.autoApplyAnswers;
    await chrome.storage.local.set({ autoApplyAnswers: this.autoApplyAnswers });
    this.updateAutoApplyButton();
    this.log('info', `自动作答已${this.autoApplyAnswers ? '开启' : '关闭'}`);
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
      const response = await chrome.tabs.sendMessage(this.currentTab.id, { action: 'aiAnswer', config });
      if (!response?.success) throw new Error(response?.message || '启动答题任务失败');
      this.log('info', '答题任务已启动，进度请查看页面悬浮面板');
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
    ['ai-batch-size', 'ai-concurrency', 'ai-max-retries'].forEach(id => {
      on(id, 'input', () => { document.getElementById('batch-settings-error').hidden = true; });
    });
    on('btn-ai-config-save', 'click', () => this.saveAiProfile());
    on('btn-ai-config-delete', 'click', () => this.deleteAiProfile());
    on('btn-ai-config-test', 'click', () => this.testAiConnection());
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
    });
    on('ai-reasoning-effort', 'change', () => this.updateTemperatureState());
    on('btn-ai-answer', 'click', () => this.aiAnswer());
    on('btn-extract-auto', 'click', () => this.getQuestions());
    on('btn-auto-apply-toggle', 'click', () => this.toggleAutoApplyState());
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
      if (changes.autoApplyAnswers) {
        this.autoApplyAnswers = changes.autoApplyAnswers.newValue === true;
        this.updateAutoApplyButton();
      }
      if (changes.aiBatchSettings && this.currentView === 'settings') this.loadBatchSettings();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => new PopupController());
