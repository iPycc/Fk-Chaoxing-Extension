// AI feature entry point.
const AIAnswerHelper = {
  // 初始化
  init() {
    try {
      DialogueAssistant.init();
      AIChat.init();
    } catch (err) {
      GlobalLogger.error('AI 初始化失败');
    }
  }
};
