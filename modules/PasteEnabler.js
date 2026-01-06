// PasteEnabler - Remove copy/paste/selection restrictions

const PasteEnabler = {
  // Remove global event restrictions
  removeGlobalRestrictions() {
    try {
      const events = ['paste', 'contextmenu', 'selectstart', 'dragstart', 'copy', 'cut', 'keydown'];
      let count = 0;
      events.forEach(eventType => {
        try { 
          if (document[`on${eventType}`]) {
            document[`on${eventType}`] = null;
            count++;
          }
        } catch (err) {}
      });
      if (document.body) this.removeElementRestrictions(document.body);
      
      // GlobalLogger.info('Global restrictions removed', `Cleared ${count} event handlers`);
    } catch (err) {
      // GlobalLogger.warning('Failed to remove global restrictions', err.message);
    }
  },

  // Inject CSS to force user-select
  injectGlobalStyles() {
    try {
      const style = document.createElement('style');
      style.textContent = `* { user-select: text !important; -webkit-user-select: text !important; -moz-user-select: text !important; -ms-user-select: text !important; }`;
      (document.head || document.documentElement).appendChild(style);
      // GlobalLogger.info('Global styles injected');
    } catch (err) {
      // GlobalLogger.error('Failed to inject global styles', err.message);
    }
  },

  // Remove restrictions from element
  removeElementRestrictions(element) {
    if (!element) return;
    try {
      element.removeAttribute('readonly');
      element.removeAttribute('disabled');
      ['onpaste', 'oncopy', 'oncut', 'oncontextmenu', 'onselectstart', 'ondragstart', 'onkeydown'].forEach(attr => {
        try { element.removeAttribute(attr); element[attr] = null; } catch (err) {}
      });
      element.style.userSelect = 'text';
      element.style.webkitUserSelect = 'text';
    } catch (err) {}
  },

  // Enable all editable elements
  enableExistingElements() {
    try {
      const elements = document.querySelectorAll('input, textarea, [contenteditable]');
      elements.forEach(el => this.removeElementRestrictions(el));
      if (elements.length > 0) {
        // GlobalLogger.info('Enabled existing elements', `Processed ${elements.length} elements`);
      }
    } catch (err) {}
  },

  // Handle paste event
  handlePaste(e) {
    try {
      e.preventDefault();
      e.stopPropagation();
      const doc = e.target.ownerDocument || document;
      const text = (e.clipboardData || window.clipboardData)?.getData?.('text/plain') || '';
      if (text) this.insertText(doc, text);
    } catch (err) {}
  },


  // Insert text at cursor
  insertText(doc, text) {
    try { if (doc.execCommand?.('insertText', false, text)) return true; } catch (err) {}
    try {
      const sel = doc.getSelection();
      if (sel?.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const node = doc.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
    } catch (err) {}
    try { if (doc.body) doc.body.appendChild(doc.createTextNode(text)); } catch (err) {}
    return false;
  },

  // MutationObserver for dynamic elements
  startMutationObserver() {
    try {
      const observer = new MutationObserver(mutations => {
        mutations.forEach(m => m.addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          try {
            if (node.matches?.('input, textarea, [contenteditable]')) this.removeElementRestrictions(node);
            node.querySelectorAll?.('input, textarea, [contenteditable]').forEach(el => this.removeElementRestrictions(el));
            if (node.tagName === 'IFRAME') {
              try {
                const doc = node.contentDocument || node.contentWindow?.document;
                doc?.querySelectorAll('input, textarea, [contenteditable]').forEach(el => this.removeElementRestrictions(el));
              } catch (e) {}
            }
          } catch (err) {}
        }));
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      // GlobalLogger.info('MutationObserver started');
    } catch (err) {}
  },

  init() {
    this.injectGlobalStyles();
    this.removeGlobalRestrictions();
    this.enableExistingElements();
    this.startMutationObserver();
    
    // 仅在顶层窗口输出日志，避免 iframe 重复刷屏
    if (window.self === window.top) {
      GlobalLogger.info('复制粘贴限制已解除');
    }
  }
};
