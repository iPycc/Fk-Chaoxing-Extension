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
      
      // 仅在顶层窗口输出加载完成日志
      if (window.self === window.top) {
        GlobalLogger.info('插件加载完成');
      }
    } catch (err) {
      GlobalLogger.error('模块初始化失败', err.message);
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
  ChaoxingHelper.init();
} catch (err) {
  console.error('[Fk-Chaoxing] Boot failure:', err);
}
