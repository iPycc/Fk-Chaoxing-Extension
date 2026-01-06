// AI 答题助手主入口
const AIAnswerHelper = {
  // 初始化
  init() {
    try {
      // 在主页面或考试页面初始化 UI（但不插入按钮）
      if (AIAnswerUI.shouldShowUI()) {
        AINotify.init();
        AIAnswerUI.injectStyles();
        // GlobalLogger.info('AI 答题助手已加载');
      }
    } catch (err) {
      GlobalLogger.error('AI 初始化失败');
    }
  }
};
