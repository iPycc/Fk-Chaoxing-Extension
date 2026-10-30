// Application entry point.
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

      CopyEnabler.ready().catch((err) => {
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
      
      // The top frame owns extraction; child frames only serve the frame bridge.
      if (window.self === window.top) {
        GlobalLogger.info('插件加载完成');
      }
      if (window.self === window.top) this.autoExtractQuestions();
    } catch (err) {
      GlobalLogger.error('模块初始化失败', err.message);
    }
  },

  // 自动提取题目逻辑
  async autoExtractQuestions() {
    try {
      const url = window.location.href;
      // 支持更多超星考试/作业/章节页面的 URL 匹配模式
      const isExam = url.includes('/exam-ans/mooc2/exam/preview') || url.includes('/exam/test/reVersionTestStartNew');
      const isHomeworkOrChapter = url.includes('/mycourse/studentstudy') || url.includes('/work/mooc/') || url.includes('/work/doHomeWorkNew') || url.includes('knowledge/cards');
      const isHomeworkWorkPage = url.includes('/mooc-ans/mooc2/work/dowork') || url.includes('/work/dowork');
      
      if (!(isExam || isHomeworkOrChapter || isHomeworkWorkPage)) return;
      const result = await QuestionCollector.collectStable();
      if (result.status !== 'stable') {
        chrome.runtime.sendMessage({ action: 'updateBadge', count: 0 });
        GlobalLogger.warning(QuestionReport.message(result.diagnostics));
        return;
      }
      const count = result.snapshot.items.length;
      GlobalLogger.success(`自动提取完成，共 ${count} 道题目`);
      chrome.runtime.sendMessage({ action: 'updateBadge', count, snapshotId: result.snapshot.id });
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

FK.app.main = ChaoxingHelper;

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
