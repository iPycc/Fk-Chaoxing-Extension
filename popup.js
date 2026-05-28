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
    
    this.currentTab = null;
    this.isEnabled = true;
    
    this.init();
  }

  async init() {
    this.log('info', '控制面板已加载');
    await this.loadPluginState();
    await this.getCurrentTab();
    await this.detectPageType();
    await this.loadInitialLogs();
    await this.updateQuestionCount();
    this.bindEvents();
    this.startLogListener();
  }

  // 加载插件开关状态
  async loadPluginState() {
    const data = await chrome.storage.local.get('pluginEnabled');
    this.isEnabled = data.pluginEnabled !== false;
    this.pluginToggleEl.checked = this.isEnabled;
    this.updateButtonsState();
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
