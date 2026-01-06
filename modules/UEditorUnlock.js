// UEditorUnlock - Unlock UEditor rich text editor
// Inject script to page context to access window.UE

const UEditorUnlock = {
  // Inject page script to access UE instances
  injectPageScript() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injected.js');
      script.onload = function() { this.remove(); };
      
      const parent = document.head || document.documentElement;
      if (parent) {
        parent.appendChild(script);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          (document.head || document.documentElement).appendChild(script);
        }, { once: true });
      }
    } catch (err) {}
  },

  init() {
    this.injectPageScript();
    // 移除日志 - 太详细
  }
};
