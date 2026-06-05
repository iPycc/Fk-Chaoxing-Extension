// Chaoxing Copy & Paste Helper - Main Entry
// Load all modules and initialize

// Import modules (loaded via manifest.json content_scripts)
// Modules: PasteEnabler, CopyEnabler, QuestionCollector, UEditorUnlock, AIAnswerHelper

const ChaoxingHelper = {
  // Init early modules (document_start)
  initEarlyModules() {
    try {
      PasteEnabler.init();
      UEditorUnlock.init();
    } catch (err) {
      GlobalLogger.error('Early modules initialization failed', err.message);
    }
  },

  // Init DOM-dependent modules
  initDOMModules() {
    try {
      // Listen for UEditor unlock messages from injected script
      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'CX_UE_UNLOCKED') {
          GlobalLogger.success(`已解锁 ${event.data.count} 个 UEditor 编辑器`);
        }
      });

      CopyEnabler.decrypt().catch((err) => {
        GlobalLogger.error('字体解密失败', err.message);
      });
      
      // Initialize new modules
      if (typeof QuestionCollector !== 'undefined') {
        QuestionCollector.init();
      } else {
        GlobalLogger.error('QuestionCollector 未加载');
      }

      if (typeof AIAnswerHelper !== 'undefined') {
        AIAnswerHelper.init();
      }
      
      // 初始化模块，并在顶层窗口和 iframe 内均尝试触发自动提取
      if (window.self === window.top) {
        GlobalLogger.info('插件加载完成');
      }
      this.autoExtractQuestions();
    } catch (err) {
      GlobalLogger.error('模块初始化失败', err.message);
    }
  },

  // 自动提取题目逻辑
  async autoExtractQuestions() {
    try {
      // 允许在 iframe 内部和顶层窗口都执行检测，因为学习通经常将题目嵌在 iframe 中
      const url = window.location.href;
      // 支持更多超星考试/作业/章节页面的 URL 匹配模式
      const isExam = url.includes('/exam-ans/mooc2/exam/preview') || url.includes('/exam/test/reVersionTestStartNew');
      const isHomeworkOrChapter = url.includes('/mycourse/studentstudy') || url.includes('/work/mooc/') || url.includes('/work/doHomeWorkNew') || url.includes('knowledge/cards');
      const isHomeworkWorkPage = url.includes('/mooc-ans/mooc2/work/dowork') || url.includes('/work/dowork');
      
      if (isExam || isHomeworkOrChapter || isHomeworkWorkPage) {
        // 由于超星页面可能存在多层 iframe 嵌套或复杂的异步加载，我们延长等待时间并提供重试机制
        const tryExtract = async (retries = 3) => {
          try {
            const sections = await QuestionCollector.collectFromDocumentRecursive(document);
            let totalQuestions = 0;
            sections.forEach(section => {
              if (section.questions) {
                totalQuestions += section.questions.length;
              }
            });
            
            if (totalQuestions > 0) {
              if (window.self === window.top) {
                 GlobalLogger.success(`自动提取完成，共 ${totalQuestions} 道题目`);
              }
              // 发送消息给 background 更新 badge
              chrome.runtime.sendMessage({
                action: 'updateBadge',
                count: totalQuestions
              });
            } else if (retries > 0) {
              // 如果没找到题目，可能是还没渲染完，1.5秒后再试
              setTimeout(() => tryExtract(retries - 1), 1500);
            }
          } catch(e) {
            if (window.self === window.top) {
              GlobalLogger.error('自动提取题目出错: ' + e.message);
            }
          }
        };

        // 初始延迟 2s 后开始第一次尝试
        setTimeout(() => tryExtract(), 2000);
      }
    } catch (err) {
      console.error('[Fk-Chaoxing] 自动提取失败', err);
    }
  },

  // Main init
  init() {
    try {
      this.initEarlyModules();
      
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.initDOMModules());
      } else {
        this.initDOMModules();
      }
    } catch (err) {
      console.error('[Fk-Chaoxing] 初始化严重错误:', err);
    }
  }
};

// Start
try {
  // Check if plugin is enabled before initializing
  chrome.storage.local.get('pluginEnabled', (data) => {
    if (data.pluginEnabled !== false) {
      ChaoxingHelper.init();
    } else {
      console.log('[Fk-Chaoxing] 插件已软关闭，未加载。');
    }
  });
} catch (err) {
  console.error('[Fk-Chaoxing] Boot failure:', err);
}
