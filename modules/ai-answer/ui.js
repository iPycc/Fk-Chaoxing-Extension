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
