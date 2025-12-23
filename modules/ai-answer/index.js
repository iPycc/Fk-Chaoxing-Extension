// AI 答题助手主入口
const AIAnswerHelper = {
  // 初始化
  init() {
    try {
      // 只在主页面初始化 UI
      if (AIAnswerUI.isMainPage()) {
        AINotify.init();
        AIAnswerUI.injectStyles();
        AIAnswerUI.insertButtons();
        console.log('[AI] 答题助手已加载');
      }
    } catch (err) {
      console.error('[AI] 初始化失败:', err);
    }
  }
};
