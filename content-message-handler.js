// Content Script 消息处理器
// 处理来自 popup 的消息请求

const ContentMessageHandler = {
  // 初始化消息监听
  init() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // 保持消息通道开启以支持异步响应
    });
    console.log('[CX] 消息处理器已初始化');
  },

  // 处理消息
  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'getQuestions':
          await this.handleGetQuestions(sendResponse);
          break;
        
        case 'showQuestionModal':
          this.handleShowModal(request, sendResponse);
          break;
        
        case 'aiAnswer':
          await this.handleAIAnswer(sendResponse);
          break;
        
        case 'getLogs':
          this.handleGetLogs(sendResponse);
          break;
        
        case 'getQuestionCount':
          await this.handleGetQuestionCount(sendResponse);
          break;
        
        default:
          sendResponse({ success: false, message: '未知操作' });
      }
    } catch (err) {
      console.error('[CX] 消息处理失败:', err);
      sendResponse({ success: false, message: err.message });
    }
  },

  // 处理获取题目请求
  async handleGetQuestions(sendResponse) {
    try {
      // 仅在顶层窗口处理，避免重复获取
      if (window.self !== window.top) {
        return;
      }

      GlobalLogger.info('获取题目');
      
      // 收集题目
      const content = await CopyAllQuestion.collectAllTitles();
      const sections = await CopyAllQuestion.collectTitlesFromDocument(document);
      
      // 统计题目数量
      let totalQuestions = 0;
      sections.forEach(section => {
        if (section.questions) {
          totalQuestions += section.questions.length;
        }
      });

      GlobalLogger.success(`获取到 ${totalQuestions} 道题目`);

      // 保存题目数量到全局
      this.lastQuestionCount = totalQuestions;

      sendResponse({
        success: true,
        count: totalQuestions,
        content: content
      });
    } catch (err) {
      GlobalLogger.error('获取题目失败');
      sendResponse({
        success: false,
        message: '获取题目失败'
      });
    }
  },

  // 处理显示弹窗请求
  handleShowModal(request, sendResponse) {
    try {
      // 仅在顶层窗口显示弹窗
      if (window.self !== window.top) {
        return;
      }

      // 调用 CopyAllQuestion 的 showModal 方法
      CopyAllQuestion.showModal(request.content);
      sendResponse({ success: true });
    } catch (err) {
      sendResponse({ success: false, message: err.message });
    }
  },

  // 处理 AI 答题请求
  async handleAIAnswer(sendResponse) {
    try {
      // 仅在顶层窗口处理
      if (window.self !== window.top) {
        return;
      }

      GlobalLogger.info('开始 AI 答题流程...');
      
      // 检查 AI 模块是否可用
      if (typeof AIAnswerCore === 'undefined') {
        throw new Error('AI 模块未加载');
      }

      // 调用 AI 答题核心逻辑
      await AIAnswerCore.processAllQuestions();

      // 获取题目数量
      const questions = await AIAnswerCore.collectQuestions();
      
      GlobalLogger.success('AI 答题流程完成');

      sendResponse({
        success: true,
        answerCount: questions.length,
        message: 'AI 分析完成'
      });
    } catch (err) {
      GlobalLogger.error('AI 答题失败: ' + err.message);
      sendResponse({
        success: false,
        message: 'AI 答题失败: ' + err.message
      });
    }
  },

  // 处理获取日志请求
  handleGetLogs(sendResponse) {
    try {
      const logs = GlobalLogger.getAllLogs();
      sendResponse({
        success: true,
        logs: logs
      });
    } catch (err) {
      sendResponse({
        success: false,
        message: err.message
      });
    }
  },

  // 处理获取题目数量请求
  async handleGetQuestionCount(sendResponse) {
    try {
      // 仅在顶层窗口处理
      if (window.self !== window.top) {
        return;
      }

      // 实时获取题目数量，不再依赖缓存
      const sections = await CopyAllQuestion.collectTitlesFromDocument(document);
      let totalQuestions = 0;
      sections.forEach(section => {
        if (section.questions) {
          totalQuestions += section.questions.length;
        }
      });

      // 更新缓存
      this.lastQuestionCount = totalQuestions;

      sendResponse({
        success: true,
        count: totalQuestions
      });
    } catch (err) {
      sendResponse({
        success: false,
        message: err.message
      });
    }
  },

  // 存储上次获取的题目数量
  lastQuestionCount: 0
};

// 初始化消息处理器
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    ContentMessageHandler.init();
  });
} else {
  ContentMessageHandler.init();
}
