// Chaoxing Copy & Paste Helper - Main Entry
// Load all modules and initialize

// Import modules (loaded via manifest.json content_scripts)
// Modules: PasteEnabler, CopyEnabler, CopyAllQuestion, UEditorUnlock, AIAnswerHelper

const ChaoxingHelper = {
  // Init early modules (document_start)
  initEarlyModules() {
    try {
      PasteEnabler.init();
      UEditorUnlock.init();
    } catch (err) {}
  },

  // Init DOM-dependent modules
  initDOMModules() {
    try {
      CopyEnabler.decrypt().catch(() => {});
      CopyAllQuestion.init();
      AIAnswerHelper.init();
    } catch (err) {}
  },

  // Main init
  init() {
    try {
      console.log('[CX] Extension loaded');
      this.initEarlyModules();
      
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.initDOMModules());
      } else {
        this.initDOMModules();
      }
    } catch (err) {}
  }
};

// Start
try {
  ChaoxingHelper.init();
} catch (err) {}
