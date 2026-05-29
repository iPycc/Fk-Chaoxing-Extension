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
    this.aiConfigPanel = document.getElementById('ai-config-panel');
    this.btnAiConfigToggle = document.getElementById('btn-ai-config-toggle');
    this.aiProfileSelect = document.getElementById('ai-profile-select');
    this.aiProfileName = document.getElementById('ai-profile-name');
    this.aiBaseUrl = document.getElementById('ai-base-url');
    this.aiApiKey = document.getElementById('ai-api-key');
    this.aiModelId = document.getElementById('ai-model-id');
    this.aiApiPath = document.getElementById('ai-api-path');
    this.aiTemperature = document.getElementById('ai-temperature');
    this.aiMaxTokens = document.getElementById('ai-max-tokens');
    this.btnAiProfileNew = document.getElementById('btn-ai-profile-new');
    this.btnAiConfigSave = document.getElementById('btn-ai-config-save');
    this.btnAiConfigDelete = document.getElementById('btn-ai-config-delete');
    
    this.currentTab = null;
    this.isEnabled = true;
    this.aiProfiles = [];
    this.activeAiProfileId = null;
    
    this.init();
  }

  async init() {
    this.log('info', '控制面板已加载');
    await this.loadPluginState();
    await this.loadAiProfiles();
    await this.getCurrentTab();
    await this.detectPageType();
    await this.loadInitialLogs();
    await this.updateQuestionCount();
    this.bindEvents();
    this.startLogListener();
  }

  getDefaultAiProfile() {
    return {
      id: 'default',
      name: '默认模型',
      baseUrl: 'https://api.openai.com/v1',
      path: '/chat/completions',
      apiKey: '',
      model: '',
      temperature: 0.3,
      maxTokens: 2000
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
    normalized.maxTokens = Number.isFinite(Number(normalized.maxTokens)) ? Number(normalized.maxTokens) : defaults.maxTokens;
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
    const data = await chrome.storage.local.get(['aiProfiles', 'activeAiProfileId', 'aiConfig']);
    const storedProfiles = Array.isArray(data.aiProfiles) ? data.aiProfiles : [];
    this.aiProfiles = storedProfiles.map(profile => this.normalizeAiProfile(profile));

    if (this.aiProfiles.length === 0) {
      const legacyConfig = data.aiConfig ? this.normalizeAiProfile(data.aiConfig) : this.getDefaultAiProfile();
      this.aiProfiles = [legacyConfig];
    }

    this.activeAiProfileId = data.activeAiProfileId || this.aiProfiles[0].id;
    if (!this.aiProfiles.some(profile => profile.id === this.activeAiProfileId)) {
      this.activeAiProfileId = this.aiProfiles[0].id;
    }

    this.renderAiProfileOptions();
    this.fillAiProfileForm(this.getActiveAiProfile());
  }

  getActiveAiProfile() {
    return this.aiProfiles.find(profile => profile.id === this.activeAiProfileId) || this.aiProfiles[0] || this.getDefaultAiProfile();
  }

  renderAiProfileOptions() {
    this.aiProfileSelect.innerHTML = '';
    this.aiProfiles.forEach(profile => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name || profile.model || '未命名模型';
      this.aiProfileSelect.appendChild(option);
    });
    this.aiProfileSelect.value = this.activeAiProfileId;
  }

  fillAiProfileForm(profile) {
    const normalized = this.normalizeAiProfile(profile);
    this.aiProfileName.value = normalized.name;
    this.aiBaseUrl.value = normalized.baseUrl;
    this.aiApiKey.value = normalized.apiKey;
    this.aiModelId.value = normalized.model;
    this.aiApiPath.value = normalized.path;
    this.aiTemperature.value = normalized.temperature;
    this.aiMaxTokens.value = normalized.maxTokens;
    this.btnAiConfigDelete.disabled = this.aiProfiles.length <= 1;
  }

  readAiProfileForm(id = this.activeAiProfileId) {
    return this.normalizeAiProfile({
      id,
      name: this.aiProfileName.value,
      baseUrl: this.aiBaseUrl.value,
      path: this.aiApiPath.value,
      apiKey: this.aiApiKey.value,
      model: this.aiModelId.value,
      temperature: this.aiTemperature.value,
      maxTokens: this.aiMaxTokens.value
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

  async saveAiProfile() {
    try {
      const profile = this.readAiProfileForm();
      this.validateAiProfile(profile);
      await this.requestAiHostPermission(profile.baseUrl);

      const index = this.aiProfiles.findIndex(item => item.id === profile.id);
      if (index >= 0) {
        this.aiProfiles[index] = profile;
      } else {
        this.aiProfiles.push(profile);
      }
      this.activeAiProfileId = profile.id;
      await this.persistAiProfiles();
      this.renderAiProfileOptions();
      this.fillAiProfileForm(profile);
      this.log('success', `已保存 AI 模型配置：${profile.name}`);
    } catch (err) {
      this.log('error', `保存 AI 配置失败：${err.message}`);
    }
  }

  createAiProfile() {
    const profile = this.normalizeAiProfile({
      id: `model-${Date.now()}`,
      name: `新模型 ${this.aiProfiles.length + 1}`,
      baseUrl: 'https://api.openai.com/v1',
      path: '/chat/completions',
      apiKey: '',
      model: ''
    });
    this.aiProfiles.push(profile);
    this.activeAiProfileId = profile.id;
    this.renderAiProfileOptions();
    this.fillAiProfileForm(profile);
    this.log('info', '已创建新模型配置，请填写后保存');
  }

  async deleteAiProfile() {
    if (this.aiProfiles.length <= 1) {
      this.log('warning', '至少需要保留一个 AI 模型配置');
      return;
    }

    const removed = this.getActiveAiProfile();
    this.aiProfiles = this.aiProfiles.filter(profile => profile.id !== this.activeAiProfileId);
    this.activeAiProfileId = this.aiProfiles[0].id;
    await this.persistAiProfiles();
    this.renderAiProfileOptions();
    this.fillAiProfileForm(this.getActiveAiProfile());
    this.log('success', `已删除 AI 模型配置：${removed.name}`);
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

    // 自动获取题目
    this.btnExtractAuto.addEventListener('click', () => {
      this.getQuestions();
    });

    // AI 答题
    this.btnAiAnswer.addEventListener('click', () => {
      this.aiAnswer();
    });

    this.btnAiConfigToggle.addEventListener('click', () => {
      const willOpen = this.aiConfigPanel.hidden;
      this.aiConfigPanel.hidden = !willOpen;
      this.btnAiConfigToggle.textContent = willOpen ? '收起' : '展开';
    });

    this.aiProfileSelect.addEventListener('change', () => {
      this.activeAiProfileId = this.aiProfileSelect.value;
      this.fillAiProfileForm(this.getActiveAiProfile());
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
