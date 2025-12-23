// Chaoxing Copy & Paste Helper - Injected Page Script
// This script runs in the page context to access window.UE (UEditor instances)
// 
// 关键说明：
// Chrome 扩展的 Content Script 运行在"隔离世界"中，无法直接访问页面的全局变量（如 window.UE）
// 因此需要通过注入 <script> 标签的方式，将此脚本注入到页面上下文中执行
// 这样就可以像油猴脚本使用 unsafeWindow 一样访问 UE.instants

(function() {
  'use strict';

  /**
   * Remove restrictions from a specific element
   * Removes readonly/disabled attributes and event restriction attributes
   * @param {HTMLElement} element - Element to process
   */
  function removeElementRestrictions(element) {
    if (!element) return;

    // Remove readonly and disabled attributes
    element.removeAttribute('readonly');
    element.removeAttribute('disabled');

    // Remove event restriction attributes
    ['paste', 'contextmenu', 'keydown', 'selectstart', 'dragstart', 'copy', 'cut']
      .forEach(event => {
        element[`on${event}`] = null;
        element.removeAttribute(`on${event}`);
      });

    // Force user-select style
    Object.assign(element.style, {
      userSelect: 'text',
      webkitUserSelect: 'text',
      mozUserSelect: 'text',
      msUserSelect: 'text',
      pointerEvents: 'auto'
    });
  }

  /**
   * Handle paste event for UEditor
   * Prevents default behavior and inserts text at cursor position
   * @param {ClipboardEvent} e - Paste event
   */
  function handlePaste(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const doc = e.target.ownerDocument || document;
    const clipboardData = e.clipboardData || window.clipboardData;
    
    // 仅处理文本粘贴
    const text = clipboardData?.getData?.('text/plain') || 
                 window.clipboardData?.getData?.('Text') || '';
    
    if (text) {
      insertText(doc, text);
    }
  }

  /**
   * Insert text at cursor position
   * @param {Document} doc - Document object
   * @param {string} text - Text to insert
   */
  function insertText(doc, text) {
    // 尝试使用 execCommand 插入文本
    if (doc.execCommand?.('insertText', false, text)) {
      return true;
    }
    
    // 回退方案：使用 Selection API
    const selection = doc.getSelection();
    if (selection?.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = doc.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
    
    // 最后回退：直接追加到 body
    if (doc.body) {
      doc.body.appendChild(doc.createTextNode(text));
    }
    return false;
  }

  /**
   * Process a single UEditor instance
   * Enables paste functionality and removes restrictions
   * 完全按照原始油猴脚本的实现
   * @param {Object} instance - UEditor instance object
   */
  function processUEditorInstance(instance) {
    if (!instance || typeof instance !== 'object') return;

    try {
      // 启用编辑器选项
      if (instance.options) {
        instance.options.pasteplain = true;
        instance.options.readonly = false;
        instance.options.disabled = false;
      }

      // 调用 setEnabled 启用编辑器
      if (instance.setEnabled && instance.body) {
        instance.setEnabled(true);
      }

      // 处理编辑器主体 (instance.body)
      if (instance.body && !instance.body.__cxPasteEnabled) {
        removeElementRestrictions(instance.body);
        instance.body.addEventListener('paste', handlePaste, true);
        instance.body.__cxPasteEnabled = true;
      }

      // 处理 iframe 文档 (instance.iframe?.contentDocument)
      const iframeDoc = instance.iframe?.contentDocument;
      if (iframeDoc && !iframeDoc.__cxPasteEnabled) {
        removeElementRestrictions(iframeDoc.body);
        iframeDoc.addEventListener('paste', handlePaste, true);
        iframeDoc.__cxPasteEnabled = true;
      }
    } catch (err) {
      // Silently handle errors
    }
  }

  /**
   * Monitor and process UEditor instances
   * Detects window.UE.instants and processes all instances
   * Retries up to 40 times with 500ms interval (20 seconds total)
   */
  function monitorUEditor() {
    let attempts = 0;
    const maxAttempts = 40; // 增加到 40 次，共 20 秒
    const interval = 500; // ms
    let foundAny = false;

    const checkUEditor = () => {
      attempts++;

      // 处理主窗口 UEditor 实例
      if (typeof UE !== 'undefined' && UE.instants) {
        const keys = Object.keys(UE.instants);
        if (keys.length > 0) {
          foundAny = true;
          Object.values(UE.instants).forEach(instance => {
            processUEditorInstance(instance);
          });
        }
      }

      // 处理 iframe 中的 UEditor 实例
      document.querySelectorAll('iframe').forEach(iframe => {
        try {
          const iframeWindow = iframe.contentWindow;
          if (iframeWindow?.UE?.instants) {
            const keys = Object.keys(iframeWindow.UE.instants);
            if (keys.length > 0) {
              foundAny = true;
              Object.values(iframeWindow.UE.instants).forEach(instance => {
                processUEditorInstance(instance);
              });
            }
          }
        } catch (error) {
          // 跨域 iframe，静默处理
        }
      });

      // 继续检查直到达到最大尝试次数
      if (attempts < maxAttempts) {
        setTimeout(checkUEditor, interval);
      } else if (foundAny) {
        console.log('[CX] UEditor enabled');
      }
    };

    // 开始检查
    checkUEditor();
  }

  // 启动 UEditor 监控
  // 与原始脚本一致：如果 DOM 还在加载，等待 DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', monitorUEditor);
  } else {
    monitorUEditor();
  }

})();
