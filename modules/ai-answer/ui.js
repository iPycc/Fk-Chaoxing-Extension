// AI 答题助手 UI 模块
const AIAnswerUI = {
  // 检查是否是主页面或考试页面
  isMainPage() {
    return window.location.href.includes('mooc1.chaoxing.com/mycourse/studentstudy') ||
           window.location.href.includes('mooc2-ans.chaoxing.com/mycourse/studentstudy');
  },

  isExamPage() {
    return window.location.href.includes('/exam-ans/mooc2/exam/preview');
  },

  shouldShowUI() {
    return this.isMainPage() || this.isExamPage();
  },

  // 注入 CSS 样式
  injectStyles() {
    if (document.getElementById('ai-answer-styles')) return;
    
    const link = document.createElement('link');
    link.id = 'ai-answer-styles';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('modules/ai-answer/notify.css');
    document.head.appendChild(link);
  },

  // 之前的按钮插入逻辑已移除，由 Popup 接管
  insertButtons() {
    // Legacy support: Do nothing
  }
};

// 浮动通知面板模块
const AINotify = {
  panel: null,
  logsContainer: null,
  isDragging: false,
  dragOffset: { x: 0, y: 0 },

  // 检查是否是主页面或考试页面
  isMainPage() {
    return window.location.href.includes('mooc1.chaoxing.com/mycourse/studentstudy') ||
           window.location.href.includes('mooc2-ans.chaoxing.com/mycourse/studentstudy');
  },

  isExamPage() {
    return window.location.href.includes('/exam-ans/mooc2/exam/preview');
  },

  shouldShowUI() {
    return this.isMainPage() || this.isExamPage();
  },

  // 初始化通知面板
  init() {
    if (!this.shouldShowUI()) return;
    if (document.getElementById('ai-notify-panel')) return;
    
    GlobalLogger.info('AI 通知面板已加载');
    
    // 随机位置
    const randomTop = Math.floor(Math.random() * 200) + 100;
    const randomRight = Math.floor(Math.random() * 100) + 20;
    
    const panelHtml = `
      <div id="ai-notify-panel" style="top:${randomTop}px;right:${randomRight}px;">
        <div id="ai-notify-header">
          <h4>AI 答题助手</h4>
          <div class="ai-notify-controls">
            <button class="ai-notify-btn" id="ai-notify-clear" title="清空日志">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
            <button class="ai-notify-btn" id="ai-notify-minimize" title="最小化">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <button class="ai-notify-btn" id="ai-notify-close" title="关闭">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
        <div id="ai-notify-logs"></div>
        <div id="ai-notify-resize"></div>
      </div>
      <div id="ai-notify-fab" title="打开 AI 助手">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path><path d="M12 8v14"></path><path d="M12 11H8a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-4"></path></svg>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', panelHtml);
    
    this.panel = document.getElementById('ai-notify-panel');
    this.logsContainer = document.getElementById('ai-notify-logs');
    
    this.bindEvents();
    
    // 默认隐藏面板，显示悬浮按钮
    this.panel.style.display = 'none';
    document.getElementById('ai-notify-fab').style.display = 'flex';
  },

  // 绑定事件
  bindEvents() {
    const header = document.getElementById('ai-notify-header');
    const fab = document.getElementById('ai-notify-fab');
    
    // 拖拽功能
    header.addEventListener('mousedown', (e) => this.startDrag(e));
    document.addEventListener('mousemove', (e) => this.onDrag(e));
    document.addEventListener('mouseup', () => this.stopDrag());
    
    // 按钮事件
    document.getElementById('ai-notify-close').addEventListener('click', () => this.hide());
    document.getElementById('ai-notify-minimize').addEventListener('click', () => this.hide());
    document.getElementById('ai-notify-clear').addEventListener('click', () => this.clear());
    
    // 悬浮按钮点击
    fab.addEventListener('click', () => this.show());
    
    // 悬浮按钮拖拽
    fab.addEventListener('mousedown', (e) => this.startFabDrag(e));
  },

  // 开始拖拽面板
  startDrag(e) {
    if (e.target.closest('.ai-notify-btn')) return;
    this.isDragging = true;
    const rect = this.panel.getBoundingClientRect();
    this.dragOffset.x = e.clientX - rect.left;
    this.dragOffset.y = e.clientY - rect.top;
    this.panel.style.transition = 'none';
  },

  // 拖拽中
  onDrag(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    
    let x = e.clientX - this.dragOffset.x;
    let y = e.clientY - this.dragOffset.y;
    
    // 边界限制
    x = Math.max(0, Math.min(x, window.innerWidth - this.panel.offsetWidth));
    y = Math.max(0, Math.min(y, window.innerHeight - this.panel.offsetHeight));
    
    this.panel.style.left = x + 'px';
    this.panel.style.top = y + 'px';
    this.panel.style.right = 'auto';
  },

  // 停止拖拽
  stopDrag() {
    this.isDragging = false;
    if (this.panel) {
      this.panel.style.transition = '';
    }
  },

  // 悬浮按钮拖拽
  startFabDrag(e) {
    const fab = document.getElementById('ai-notify-fab');
    let isDragging = false;
    let startX = e.clientX;
    let startY = e.clientY;
    
    const onMove = (e) => {
      if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) {
        isDragging = true;
      }
      if (isDragging) {
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
        fab.style.left = (e.clientX - 25) + 'px';
        fab.style.top = (e.clientY - 25) + 'px';
      }
    };
    
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  // 显示面板
  show() {
    if (this.panel) {
      this.panel.style.display = 'flex';
      document.getElementById('ai-notify-fab').style.display = 'none';
    }
  },

  // 隐藏面板
  hide() {
    if (this.panel) {
      this.panel.style.display = 'none';
      document.getElementById('ai-notify-fab').style.display = 'flex';
    }
  },

  // 清空日志
  clear() {
    if (this.logsContainer) {
      this.logsContainer.innerHTML = '';
    }
  },

  // 添加日志
  log(message, type = 'info') {
    if (!this.logsContainer) this.init();
    if (!this.logsContainer) return;
    
    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logItem = document.createElement('div');
    logItem.className = `ai-log-item ai-log-${type}`;
    logItem.innerHTML = `<span class="ai-log-time">${time}</span>${message}`;
    
    this.logsContainer.appendChild(logItem);
    this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
  },

  info(msg) { this.log(msg, 'info'); },
  success(msg) { this.log(msg, 'success'); },
  error(msg) { this.log(msg, 'error'); },
  warning(msg) { this.log(msg, 'warning'); }
};
