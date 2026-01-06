// Popup 控制面板脚本

class PopupController {
  constructor() {
    this.logContainer = document.getElementById('log-content');
    this.pageTypeEl = document.getElementById('page-type');
    this.statusIconEl = document.getElementById('status-icon');
    this.statusIconBgEl = document.getElementById('status-icon-bg');
    this.questionCountEl = document.getElementById('question-count');
    this.currentTab = null;
    
    this.init();
  }

  async init() {
    this.log('info', '控制面板已加载');
    await this.getCurrentTab();
    await this.detectPageType();
    await this.loadInitialLogs();
    await this.updateQuestionCount();
    this.bindEvents();
    this.startLogListener();
  }

  // 获取当前标签页
  async getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    this.currentTab = tab;
    return tab;
  }

  // 检测页面类型
  async detectPageType() {
    if (!this.currentTab) return;

    const url = this.currentTab.url;
    let color = '#999';
    let text = '非超星页面';
    let iconClass = 'ri-close-circle-line';
    let bgClass = '';
    
    if (url.includes('/exam-ans/mooc2/exam/preview')) {
      text = '考试页面';
      color = '#722ed1';
      iconClass = 'ri-edit-circle-line';
      bgClass = 'exam-bg';
      this.log('info', '检测到考试页面');
    } else if (url.includes('/mycourse/studentstudy')) {
      text = '作业页面';
      color = '#1677ff';
      iconClass = 'ri-book-read-line';
      bgClass = 'work-bg';
      this.log('info', '检测到作业页面');
    } else if (url.includes('chaoxing.com')) {
      text = '超星页面';
      color = '#52c41a';
      iconClass = 'ri-global-line';
      bgClass = 'other-bg';
      this.log('info', '检测到超星页面');
    } else {
      this.log('warning', '当前不是超星页面');
    }

    this.pageTypeEl.textContent = text;
    this.pageTypeEl.style.color = color;
    
    if (this.statusIconEl) {
      this.statusIconEl.className = iconClass;
      this.statusIconEl.style.color = color;
      
      // 移除之前的 spin 动画
      this.statusIconEl.classList.remove('spin-animation');
    }
    
    if (this.statusIconBgEl) {
      this.statusIconBgEl.style.backgroundColor = color + '1A'; // 10% 透明度
    }
  }

  // 绑定事件
  bindEvents() {
    // 重载扩展
    document.getElementById('btn-reload').addEventListener('click', () => {
      this.reloadExtension();
    });

    // 获取所有题目
    document.getElementById('btn-get-questions').addEventListener('click', () => {
      this.getQuestions();
    });

    // AI 答题
    document.getElementById('btn-ai-answer').addEventListener('click', () => {
      this.aiAnswer();
    });

    // 清空日志
    document.getElementById('btn-clear-log').addEventListener('click', () => {
      this.clearLog();
    });
  }

  // 重载扩展
  async reloadExtension() {
    this.log('info', '正在重载扩展...');
    const btn = document.getElementById('btn-reload');
    const icon = btn.querySelector('i');
    icon.classList.add('spin-animation');
    
    try {
      chrome.runtime.reload();
    } catch (err) {
      this.log('error', '重载失败: ' + err.message);
      icon.classList.remove('spin-animation');
    }
  }

  // 获取所有题目
  async getQuestions() {
    const btn = document.getElementById('btn-get-questions');
    const icon = btn.querySelector('.action-icon i');
    const originalIconClass = icon.className;
    
    btn.disabled = true;
    btn.classList.add('loading');
    icon.className = 'ri-loader-4-line spin-animation';
    
    this.log('info', '正在获取题目...');

    try {
      const result = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'getQuestions'
      });

      if (result.success) {
        this.questionCountEl.textContent = result.count;
        this.log('success', `获取到 ${result.count} 道题目`);
        
        // 显示题目预览弹窗（不是直接复制）
        await chrome.tabs.sendMessage(this.currentTab.id, {
          action: 'showQuestionModal',
          content: result.content
        });
      } else {
        this.log('error', result.message || '获取题目失败');
      }
    } catch (err) {
      this.log('error', '获取题目失败');
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
      icon.className = originalIconClass;
    }
  }

  // AI 答题
  async aiAnswer() {
    const btn = document.getElementById('btn-ai-answer');
    const icon = btn.querySelector('.action-icon i');
    const originalIconClass = icon.className;
    
    btn.disabled = true;
    btn.classList.add('loading');
    icon.className = 'ri-loader-4-line spin-animation';
    
    this.log('info', '开始 AI 答题流程...');

    try {
      // 先获取题目
      this.log('info', '步骤 1/2: 获取题目');
      const result = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'getQuestions'
      });

      if (!result.success) {
        this.log('error', '获取题目失败');
        return;
      }

      this.questionCountEl.textContent = result.count;
      this.log('success', `获取到 ${result.count} 道题目`);

      // 复制到剪贴板
      if (result.content) {
        await navigator.clipboard.writeText(result.content);
        this.log('success', '题目已复制到剪贴板');
      }

      // 调用 AI
      this.log('info', '步骤 2/2: 调用 AI 分析');
      const aiResult = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'aiAnswer'
      });

      if (aiResult.success) {
        this.log('success', 'AI 分析完成');
        this.log('info', `获取到 ${aiResult.answerCount} 个答案`);
      } else {
        this.log('error', aiResult.message || 'AI 分析失败');
      }
    } catch (err) {
      this.log('error', 'AI 答题失败: ' + err.message);
      this.log('warning', '请确保当前页面是超星学习通页面');
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
      icon.className = originalIconClass;
    }
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
    
    // 如果是第一条日志且是默认消息，则替换
    if (this.logContainer.children.length === 1 && 
        this.logContainer.children[0].textContent.includes('等待操作')) {
      this.logContainer.innerHTML = '';
    }
    
    this.logContainer.appendChild(logItem);
    
    // 自动滚动到底部
    this.logContainer.scrollTop = this.logContainer.scrollHeight;

    // 限制日志数量
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
        // 清空默认日志
        this.logContainer.innerHTML = '';
        
        // 添加所有历史日志
        result.logs.forEach(log => {
          const logItem = document.createElement('div');
          logItem.className = `log-item ${log.type}`;
          logItem.innerHTML = `
            <span class="log-time">${log.time}</span>
            <span class="log-msg">${log.message}</span>
          `;
          this.logContainer.appendChild(logItem);
        });
        
        // 滚动到底部
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
      }
    } catch (err) {
      // 页面可能还未加载完成，忽略错误
    }
  }

  // 更新题目数量
  async updateQuestionCount() {
    try {
      const result = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'getQuestionCount'
      });

      if (result.success && result.count !== undefined) {
        this.questionCountEl.textContent = result.count;
      }
    } catch (err) {
      // 忽略错误
    }
  }

  // 开始监听日志
  startLogListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'log' && request.log) {
        const logItem = document.createElement('div');
        logItem.className = `log-item ${request.log.type}`;
        logItem.innerHTML = `
          <span class="log-time">${request.log.time}</span>
          <span class="log-msg">${request.log.message}</span>
        `;
        
        // 如果是第一条日志且是默认消息，则替换
        if (this.logContainer.children.length === 1 && 
            this.logContainer.children[0].textContent.includes('等待操作')) {
          this.logContainer.innerHTML = '';
        }
        
        this.logContainer.appendChild(logItem);
        this.logContainer.scrollTop = this.logContainer.scrollHeight;

        // 限制日志数量
        while (this.logContainer.children.length > 50) {
          this.logContainer.removeChild(this.logContainer.firstChild);
        }
      }
    });
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
