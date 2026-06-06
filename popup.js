// Popup 控制面板脚本

class PopupController {
  constructor() {
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
    this.btnAiIcon = document.getElementById('btn-ai-icon');
    this.btnAiIconDefault = document.getElementById('btn-ai-icon-default');
    this.aiConfigModal = document.getElementById('ai-config-modal');
    this.btnAiConfigOpen = document.getElementById('btn-ai-config-open');
    this.btnAiConfigClose = document.getElementById('btn-ai-config-close');
    this.aiProfileSelect = document.getElementById('ai-profile-select');
    this.aiProfileName = document.getElementById('ai-profile-name');
    this.aiBaseUrl = document.getElementById('ai-base-url');
    this.aiApiKey = document.getElementById('ai-api-key');
    this.aiModelId = document.getElementById('ai-model-id');
    this.aiApiPath = document.getElementById('ai-api-path');
    this.aiTemperature = document.getElementById('ai-temperature');
    this.btnAiProfileNew = document.getElementById('btn-ai-profile-new');
    this.btnAiConfigSave = document.getElementById('btn-ai-config-save');
    this.btnAiConfigDelete = document.getElementById('btn-ai-config-delete');
    
    this.currentTab = null;
    this.isEnabled = true;
    this.autoApplyAnswers = false;
    this.aiProfiles = [];
    this.activeAiProfileId = null;
    
    this.init();
  }

  async init() {
    this.log('info', '控制面板已加载');
    await this.loadPluginState();
    await this.loadAutoApplyState();
    await this.loadAiProfiles();
    await this.getCurrentTab();
    await this.detectPageType();
    await this.loadInitialLogs();
    await this.updateQuestionCount();
    this.bindEvents();
    this.startLogListener();
    
    // 检测是否有草稿，有则自动打开配置模态窗
    await this.checkAndOpenDraftModal();
  }

  // 检测是否有未保存的草稿，有则自动打开配置模态窗
  async checkAndOpenDraftModal() {
    const data = await chrome.storage.local.get(['aiProfiles', 'aiConfigDraft']);
    const hasProfiles = Array.isArray(data.aiProfiles) && data.aiProfiles.length > 0;
    const hasDraft = data.aiConfigDraft && (
      data.aiConfigDraft.name || 
      data.aiConfigDraft.baseUrl || 
      data.aiConfigDraft.apiKey || 
      data.aiConfigDraft.model
    );
    
    // 如果有草稿且没有有效配置，自动打开配置模态窗
    if (hasDraft && !hasProfiles) {
      this.aiConfigModal.hidden = false;
      this.fillAiProfileFormFromDraft(data.aiConfigDraft);
      this.log('info', '检测到未保存的配置草稿，已自动打开');
    }
  }

  getDefaultAiProfile() {
    return {
      id: 'default',
      name: '默认模型',
      baseUrl: '',
      path: '/chat/completions',
      apiKey: '',
      model: '',
      temperature: 0.3
    };
  }

  normalizeAiProfile(profile = {}) {
    const defaults = this.getDefaultAiProfile();
    const normalized = { ...defaults, ...profile };
    normalized.id = normalized.id || `model-${Date.now()}`;
    normalized.name = (normalized.name || normalized.model || defaults.name).trim();
    normalized.baseUrl = (normalized.baseUrl || '').trim().replace(/\/+$/, '');
    normalized.path = (normalized.path || defaults.path).trim();
    if (!normalized.path.startsWith('/')) {
      normalized.path = `/${normalized.path}`;
    }
    normalized.apiKey = (normalized.apiKey || '').trim();
    normalized.model = (normalized.model || '').trim();
    normalized.temperature = Number.isFinite(Number(normalized.temperature)) ? Number(normalized.temperature) : defaults.temperature;
    return normalized;
  }

  // 加载插件开关状态
  async loadPluginState() {
    const data = await chrome.storage.local.get('pluginEnabled');
    this.isEnabled = data.pluginEnabled !== false;
    this.pluginToggleEl.checked = this.isEnabled;
    this.updateButtonsState();
  }

  async loadAiProfiles() {
    const data = await chrome.storage.local.get(['aiProfiles', 'activeAiProfileId', 'aiConfig', 'aiConfigDraft']);
    const storedProfiles = Array.isArray(data.aiProfiles) ? data.aiProfiles : [];
    this.aiProfiles = storedProfiles.map(profile => this.normalizeAiProfile(profile));

    // 如果没有配置，不创建默认空配置，而是显示引导
    if (this.aiProfiles.length === 0) {
      // 检查是否有旧版配置需要迁移
      if (data.aiConfig) {
        const legacyConfig = this.normalizeAiProfile(data.aiConfig);
        this.aiProfiles = [legacyConfig];
        await this.persistAiProfiles();
      }
    }

    this.activeAiProfileId = data.activeAiProfileId;
    if (!this.aiProfiles.some(profile => profile.id === this.activeAiProfileId)) {
      this.activeAiProfileId = this.aiProfiles.length > 0 ? this.aiProfiles[0].id : null;
    }

    this.renderAiProfileOptions();
    
    // 如果有草稿，恢复草稿
    if (data.aiConfigDraft && !this.activeAiProfileId) {
      this.fillAiProfileFormFromDraft(data.aiConfigDraft);
    } else if (this.activeAiProfileId) {
      this.fillAiProfileForm(this.getActiveAiProfile());
    } else {
      // 首次使用，显示引导
      this.showFirstTimeGuide();
    }
    
    this.updateAiAnswerButton();
  }

  // 首次使用引导
  showFirstTimeGuide() {
    this.aiProfileSelect.innerHTML = '<option value="">请先添加模型</option>';
    this.aiProfileSelect.value = '';
    this.btnAiConfigDelete.disabled = true;
    
    // 清空表单显示引导占位符
    this.aiProfileName.value = '';
    this.aiProfileName.placeholder = '如：OpenAI / Kimi / 本地模型';
    this.aiBaseUrl.value = '';
    this.aiBaseUrl.placeholder = 'https://api.openai.com/v1';
    this.aiApiKey.value = '';
    this.aiApiKey.placeholder = 'sk-...';
    this.aiModelId.value = '';
    this.aiModelId.placeholder = 'gpt-3.5-turbo';
    this.aiApiPath.value = '/chat/completions';
    this.aiTemperature.value = '0.3';
    
    this.log('info', '首次使用，请点击"配置"添加 AI 模型');
  }

  // 从草稿填充表单
  fillAiProfileFormFromDraft(draft) {
    this.aiProfileName.value = draft.name || '';
    this.aiBaseUrl.value = draft.baseUrl || '';
    this.aiApiKey.value = draft.apiKey || '';
    this.aiModelId.value = draft.model || '';
    this.aiApiPath.value = draft.path || '/chat/completions';
    this.aiTemperature.value = draft.temperature !== undefined ? draft.temperature : 0.3;
  }

  // 保存表单草稿
  async saveFormDraft() {
    const draft = {
      name: this.aiProfileName.value,
      baseUrl: this.aiBaseUrl.value,
      apiKey: this.aiApiKey.value,
      model: this.aiModelId.value,
      path: this.aiApiPath.value,
      temperature: this.aiTemperature.value
    };
    await chrome.storage.local.set({ aiConfigDraft: draft });
  }

  // 清除草稿
  async clearFormDraft() {
    await chrome.storage.local.remove('aiConfigDraft');
  }

  async loadAutoApplyState() {
    const data = await chrome.storage.local.get('autoApplyAnswers');
    this.autoApplyAnswers = data.autoApplyAnswers === true;
    this.updateAutoApplyButton();
  }

  updateAutoApplyButton() {
    if (!this.btnAutoApplyToggle || !this.btnAutoApplyText) return;
    this.btnAutoApplyText.textContent = `自动作答：${this.autoApplyAnswers ? '开启' : '关闭'}`;
    this.btnAutoApplyToggle.classList.toggle('active', this.autoApplyAnswers);
    this.btnAutoApplyToggle.title = this.autoApplyAnswers
      ? '当前会自动将 AI 答案写入编辑器'
      : '当前只显示 AI 返回答案，不自动填写';
  }

  getActiveAiProfile() {
    if (this.aiProfiles.length === 0) {
      return null;
    }
    return this.aiProfiles.find(profile => profile.id === this.activeAiProfileId) || this.aiProfiles[0];
  }

  renderAiProfileOptions() {
    this.aiProfileSelect.innerHTML = '';
    
    if (this.aiProfiles.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '请先添加模型';
      this.aiProfileSelect.appendChild(option);
      this.aiProfileSelect.value = '';
      return;
    }
    
    this.aiProfiles.forEach(profile => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name || profile.model || '未命名模型';
      this.aiProfileSelect.appendChild(option);
    });
    this.aiProfileSelect.value = this.activeAiProfileId || '';
  }

  fillAiProfileForm(profile) {
    if (!profile) {
      this.showFirstTimeGuide();
      return;
    }
    
    const normalized = this.normalizeAiProfile(profile);
    this.aiProfileName.value = normalized.name || '';
    this.aiBaseUrl.value = normalized.baseUrl || '';
    this.aiApiKey.value = normalized.apiKey || '';
    this.aiModelId.value = normalized.model || '';
    this.aiApiPath.value = normalized.path || '/chat/completions';
    this.aiTemperature.value = normalized.temperature !== undefined ? normalized.temperature : 0.3;
    this.btnAiConfigDelete.disabled = this.aiProfiles.length <= 1;
    this.updateAiAnswerButton();
  }

  updateAiAnswerButton() {
    const profile = this.getActiveAiProfile();
    
    // 如果没有有效配置，显示引导
    if (!profile || !profile.baseUrl) {
      this.btnAiText.textContent = '请先配置 AI 模型';
      this.btnAiIcon.style.display = 'none';
      this.btnAiIconDefault.style.display = 'inline-block';
      this.btnAiAnswer.disabled = !this.isEnabled;
      return;
    }
    
    const modelName = profile.name || profile.model || 'AI';
    this.btnAiText.textContent = `使用 ${modelName} 答题`;
    
    if (profile.baseUrl) {
      try {
        const url = new URL(profile.baseUrl);
        let hostname = url.hostname;
        const parts = hostname.split('.');
        if (parts.length > 2) {
          // 处理类似 .com.cn, .co.uk 的情况
          if (['com', 'co', 'net', 'org', 'edu', 'gov'].includes(parts[parts.length - 2])) {
            hostname = parts.slice(-3).join('.');
          } else {
            hostname = parts.slice(-2).join('.');
          }
        }
        
        this.btnAiIcon.src = `https://${hostname}/favicon.ico`;
        this.btnAiIcon.style.display = 'inline-block';
        this.btnAiIconDefault.style.display = 'none';
        
        // Handle image load error
        this.btnAiIcon.onerror = () => {
          this.btnAiIcon.style.display = 'none';
          this.btnAiIconDefault.style.display = 'inline-block';
        };
      } catch (e) {
        this.btnAiIcon.style.display = 'none';
        this.btnAiIconDefault.style.display = 'inline-block';
      }
    } else {
      this.btnAiIcon.style.display = 'none';
      this.btnAiIconDefault.style.display = 'inline-block';
    }
  }

  readAiProfileForm(id = this.activeAiProfileId) {
    // 如果没有选中模型，生成新ID
    const profileId = id || `model-${Date.now()}`;
    return this.normalizeAiProfile({
      id: profileId,
      name: this.aiProfileName.value,
      baseUrl: this.aiBaseUrl.value,
      path: this.aiApiPath.value,
      apiKey: this.aiApiKey.value,
      model: this.aiModelId.value,
      temperature: this.aiTemperature.value
    });
  }

  validateAiProfile(profile) {
    if (!profile.name) {
      throw new Error('请填写显示名称');
    }
    if (!profile.baseUrl) {
      throw new Error('请填写 API 地址');
    }
    new URL(profile.baseUrl);
    if (!profile.apiKey) {
      throw new Error('请填写 API 密钥');
    }
    if (!profile.model) {
      throw new Error('请填写模型 ID');
    }
  }

  async requestAiHostPermission(baseUrl) {
    const originPattern = `${new URL(baseUrl).origin}/*`;
    const hasPermission = await chrome.permissions.contains({ origins: [originPattern] });
    if (hasPermission) return true;

    const granted = await chrome.permissions.request({ origins: [originPattern] });
    if (!granted) {
      throw new Error(`未授权访问 ${originPattern}`);
    }
    return true;
  }

  async persistAiProfiles() {
    await chrome.storage.local.set({
      aiProfiles: this.aiProfiles,
      activeAiProfileId: this.activeAiProfileId,
      aiConfig: this.getActiveAiProfile()
    });
  }

  async testAiConnection(profile) {
    const url = `${profile.baseUrl.replace(/\/+$/, '')}${profile.path}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${profile.apiKey}`
    };
    const body = JSON.stringify({
      model: profile.model,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1 // 用最少的 token 进行测试
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = `HTTP ${response.status} ${response.statusText}`;
        try {
          const errData = JSON.parse(errorText);
          if (errData.error && errData.error.message) {
            errorMsg = errData.error.message;
          }
        } catch (e) {
          // Ignore JSON parse error
        }
        throw new Error(errorMsg);
      }
      return true;
    } catch (err) {
      if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
        throw new Error('网络请求失败，请检查 API 地址是否正确以及是否跨域');
      }
      throw err;
    }
  }

  async saveAiProfile() {
    const btn = this.btnAiConfigSave;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '测试连接中...';

    try {
      const profile = this.readAiProfileForm();
      this.validateAiProfile(profile);
      await this.requestAiHostPermission(profile.baseUrl);
      
      // 测试连接
      await this.testAiConnection(profile);

      const index = this.aiProfiles.findIndex(item => item.id === profile.id);
      if (index >= 0) {
        this.aiProfiles[index] = profile;
      } else {
        this.aiProfiles.push(profile);
      }
      this.activeAiProfileId = profile.id;
      await this.persistAiProfiles();
      await this.clearFormDraft(); // 保存成功后清除草稿
      this.renderAiProfileOptions();
      this.fillAiProfileForm(profile);
      this.log('success', `保存成功，连接测试通过：${profile.name}`);
      this.aiConfigModal.hidden = true;
    } catch (err) {
      this.log('error', `保存失败：${err.message}`);
      alert(`配置保存失败：\n${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  async createAiProfile() {
    // 先保存当前表单为草稿
    await this.saveFormDraft();
    
    const profile = this.normalizeAiProfile({
      id: `model-${Date.now()}`,
      name: `新模型 ${this.aiProfiles.length + 1}`,
      baseUrl: '',
      path: '/chat/completions',
      apiKey: '',
      model: ''
    });
    this.aiProfiles.push(profile);
    this.activeAiProfileId = profile.id;
    await this.persistAiProfiles();
    this.renderAiProfileOptions();
    this.fillAiProfileForm(profile);
    this.log('info', '已创建新模型配置，请填写后保存');
  }

  async deleteAiProfile() {
    if (this.aiProfiles.length === 0) {
      return;
    }

    const removed = this.getActiveAiProfile();
    this.aiProfiles = this.aiProfiles.filter(profile => profile.id !== this.activeAiProfileId);
    
    if (this.aiProfiles.length > 0) {
      this.activeAiProfileId = this.aiProfiles[0].id;
    } else {
      this.activeAiProfileId = null;
    }
    
    await this.persistAiProfiles();
    this.renderAiProfileOptions();
    
    if (this.activeAiProfileId) {
      this.fillAiProfileForm(this.getActiveAiProfile());
    } else {
      this.showFirstTimeGuide();
    }
    
    this.updateAiAnswerButton();
    this.log('success', `已删除 AI 模型配置：${removed ? removed.name : ''}`);
  }

  // 切换插件开关状态
  async togglePluginState() {
    this.isEnabled = this.pluginToggleEl.checked;
    await chrome.storage.local.set({ pluginEnabled: this.isEnabled });
    this.log(this.isEnabled ? 'success' : 'warning', `插件已${this.isEnabled ? '开启' : '临时关闭'}，刷新页面生效`);
    this.updateButtonsState();
    
    // 如果想要立即生效并重载当前页面，可以取消下面的注释
    // if (this.currentTab) {
    //   chrome.tabs.reload(this.currentTab.id);
    // }
  }

  // 更新按钮状态
  updateButtonsState() {
    const disabled = !this.isEnabled;
    this.btnExtractAuto.disabled = disabled;
    this.btnAiAnswer.disabled = disabled;
    this.btnAutoApplyToggle.disabled = disabled;
  }

  async toggleAutoApplyState() {
    this.autoApplyAnswers = !this.autoApplyAnswers;
    await chrome.storage.local.set({ autoApplyAnswers: this.autoApplyAnswers });
    this.updateAutoApplyButton();
    this.log('info', this.autoApplyAnswers ? '自动作答已开启，AI 答案会自动写入编辑器' : '自动作答已关闭，AI 仅展示返回答案');
  }

  // 获取当前标签页
  async getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    this.currentTab = tab;
    return tab;
  }

  // 设置插件图标徽章 (气泡)
  async setBadgeText(text) {
    if (!this.currentTab) return;
    try {
      await chrome.action.setBadgeText({
        text: text.toString(),
        tabId: this.currentTab.id
      });
      await chrome.action.setBadgeBackgroundColor({
        color: '#f53f3f', // 红色背景比较醒目
        tabId: this.currentTab.id
      });
    } catch (err) {
      console.error('设置 Badge 失败', err);
    }
  }

  // 检测页面类型
  async detectPageType() {
    if (!this.currentTab) return;

    const url = this.currentTab.url;
    const title = this.currentTab.title || '未知页面';
    const faviconUrl = this.currentTab.favIconUrl;

    // 显示真实页面信息
    this.pageTitleEl.textContent = title;
    this.pageUrlEl.textContent = new URL(url).hostname || url;
    
    if (faviconUrl) {
      this.pageFaviconEl.src = faviconUrl;
    } else {
      this.pageFaviconEl.src = 'icons/chaoxing.png';
    }

    if (url.includes('/exam-ans/mooc2/exam/preview')) {
      this.log('info', '检测到考试页面');
    } else if (url.includes('/mooc-ans/mooc2/work/dowork') || url.includes('/work/dowork')) {
      this.log('info', '检测到作业作答页面');
    } else if (url.includes('/mycourse/studentstudy')) {
      this.log('info', '检测到作业/章节页面');
    } else if (url.includes('chaoxing.com')) {
      this.log('info', '检测到超星页面');
    } else {
      this.log('warning', '当前不是超星页面');
    }
  }

  // 绑定事件
  bindEvents() {
    // 软关闭开关
    this.pluginToggleEl.addEventListener('change', () => {
      this.togglePluginState();
    });

    document.getElementById('btn-refresh').addEventListener('click', () => {
      chrome.runtime.reload();
    });

    // 自动获取题目
    this.btnExtractAuto.addEventListener('click', () => {
      this.getQuestions();
    });

    // AI 答题
    this.btnAiAnswer.addEventListener('click', () => {
      this.aiAnswer();
    });

    this.btnAutoApplyToggle.addEventListener('click', () => {
      this.toggleAutoApplyState();
    });

    this.btnAiConfigOpen.addEventListener('click', async () => {
      this.aiConfigModal.hidden = false;
      
      // 如果没有有效配置，尝试恢复草稿
      if (!this.activeAiProfileId || !this.getActiveAiProfile()) {
        const data = await chrome.storage.local.get('aiConfigDraft');
        if (data.aiConfigDraft) {
          this.fillAiProfileFormFromDraft(data.aiConfigDraft);
          this.log('info', '已恢复上次未保存的配置');
        }
      }
    });

    this.btnAiConfigClose.addEventListener('click', () => {
      this.aiConfigModal.hidden = true;
    });

    this.aiProfileSelect.addEventListener('change', async () => {
      // 切换模型前保存当前表单为草稿
      await this.saveFormDraft();
      
      this.activeAiProfileId = this.aiProfileSelect.value || null;
      await this.persistAiProfiles();
      
      if (this.activeAiProfileId) {
        this.fillAiProfileForm(this.getActiveAiProfile());
      } else {
        // 尝试从草稿恢复
        const data = await chrome.storage.local.get('aiConfigDraft');
        if (data.aiConfigDraft) {
          this.fillAiProfileFormFromDraft(data.aiConfigDraft);
        } else {
          this.showFirstTimeGuide();
        }
      }
    });

    this.btnAiProfileNew.addEventListener('click', () => {
      this.createAiProfile();
    });

    this.btnAiConfigSave.addEventListener('click', () => {
      this.saveAiProfile();
    });

    this.btnAiConfigDelete.addEventListener('click', () => {
      this.deleteAiProfile();
    });

    // 表单输入时自动保存草稿
    const formInputs = [
      this.aiProfileName,
      this.aiBaseUrl,
      this.aiApiKey,
      this.aiModelId,
      this.aiApiPath,
      this.aiTemperature
    ];
    
    formInputs.forEach(input => {
      if (input) {
        input.addEventListener('input', () => {
          this.saveFormDraft();
        });
      }
    });

    // 清空日志
    document.getElementById('btn-clear-log').addEventListener('click', () => {
      this.clearLog();
    });
  }

  // 自动获取题目
  async getQuestions() {
    if (!this.isEnabled) return;
    
    const icon = this.btnExtractAuto.querySelector('i');
    const originalIconClass = icon.className;
    
    this.btnExtractAuto.disabled = true;
    icon.className = '';
    icon.innerHTML = '<span class="loader"></span>';
    
    try {
      chrome.tabs.sendMessage(this.currentTab.id, { action: 'getQuestions' }, async (result) => {
        if (chrome.runtime.lastError) {
          this.log('error', '获取题目失败 (请刷新页面后重试)');
          this.resetExtractButton(icon, originalIconClass);
          return;
        }

        if (result && result.success) {
          this.setBadgeText(result.count);
          this.log('success', `共获取 ${result.count} 道题目`);
          
          await chrome.tabs.sendMessage(this.currentTab.id, {
            action: 'showQuestionModal',
            content: result.content
          });
        } else if (result) {
          this.log('error', result.message || '获取题目失败');
        }
        
        this.resetExtractButton(icon, originalIconClass);
      });
    } catch (err) {
      this.log('error', '获取题目失败 (请刷新页面后重试)');
      this.resetExtractButton(icon, originalIconClass);
    }
  }

  // 重置提取按钮状态
  resetExtractButton(icon, originalIconClass) {
    if (this.isEnabled) this.btnExtractAuto.disabled = false;
    icon.className = originalIconClass;
    icon.innerHTML = '';
  }

  // AI 答题
  async aiAnswer() {
    if (!this.isEnabled) return;
    
    // 检查是否有有效配置
    const profile = this.getActiveAiProfile();
    if (!profile || !profile.baseUrl) {
      this.log('warning', '请先配置 AI 模型');
      this.aiConfigModal.hidden = false;
      return;
    }
    
    const btn = this.btnAiAnswer;
    const icon = btn.querySelector('i');
    const originalIconClass = icon.className;
    
    btn.disabled = true;
    icon.className = '';
    icon.innerHTML = '<span class="loader"></span>';

    try {
      chrome.tabs.sendMessage(this.currentTab.id, { action: 'getQuestions' }, async (result) => {
        if (chrome.runtime.lastError || !result || !result.success) {
          this.log('error', '获取题目失败');
          this.resetAiButton(btn, icon, originalIconClass);
          return;
        }

        this.setBadgeText(result.count);

        if (result.content) {
          await navigator.clipboard.writeText(result.content);
        }

        const aiResult = await chrome.tabs.sendMessage(this.currentTab.id, {
          action: 'aiAnswer'
        });

        if (!aiResult.success) {
          this.log('error', aiResult.message || 'AI 分析失败');
        }
        
        this.resetAiButton(btn, icon, originalIconClass);
      });
    } catch (err) {
      this.log('error', 'AI 答题失败: ' + err.message);
      this.resetAiButton(btn, icon, originalIconClass);
    }
  }

  // 重置 AI 按钮状态
  resetAiButton(btn, icon, originalIconClass) {
    if (this.isEnabled) btn.disabled = false;
    icon.className = originalIconClass;
    icon.innerHTML = '';
  }

  // 清空日志
  clearLog() {
    this.logContainer.innerHTML = '<div class="log-item info"><span class="log-time">--:--:--</span><span class="log-msg">日志已清空</span></div>';
  }

  // 添加日志
  log(type, message) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const logItem = document.createElement('div');
    logItem.className = `log-item ${type}`;
    logItem.innerHTML = `
      <span class="log-time">${time}</span>
      <span class="log-msg">${message}</span>
    `;
    
    if (this.logContainer.children.length === 1 && 
        this.logContainer.children[0].textContent.includes('等待操作')) {
      this.logContainer.innerHTML = '';
    }
    
    this.logContainer.appendChild(logItem);
    this.logContainer.scrollTop = this.logContainer.scrollHeight;

    while (this.logContainer.children.length > 50) {
      this.logContainer.removeChild(this.logContainer.firstChild);
    }
  }

  // 加载初始日志
  async loadInitialLogs() {
    try {
      const result = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'getLogs'
      });

      if (result.success && result.logs && result.logs.length > 0) {
        this.logContainer.innerHTML = '';
        result.logs.forEach(log => {
          const logItem = document.createElement('div');
          logItem.className = `log-item ${log.type}`;
          logItem.innerHTML = `
            <span class="log-time">${log.time}</span>
            <span class="log-msg">${log.message}</span>
          `;
          this.logContainer.appendChild(logItem);
        });
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
      }
    } catch (err) {
      // 页面可能未加载完成
    }
  }

  // 更新题目数量
  async updateQuestionCount() {
    try {
      // 尝试向所有 frame 发送消息获取最新状态，直到拿到一个有效数字
      chrome.tabs.sendMessage(this.currentTab.id, { action: 'getQuestionCount' }, (result) => {
        if (chrome.runtime.lastError) {
          return;
        }
        if (result && result.success && result.count !== undefined && result.count > 0) {
          this.setBadgeText(result.count);
        }
      });
    } catch (err) {
      // 忽略错误
    }
  }

  // 开始监听日志
  startLogListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'log' && request.log) {
        this.log(request.log.type, request.log.message);
      }
    });
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
