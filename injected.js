// Chaoxing Copy & Paste Helper - Injected Page Script
// This script runs in the page context to access window.UE (UEditor instances)

(function() {
  'use strict';

  const LOG_PREFIX = '[Fk-Chaoxing]';

  // Exam saves use the site's serializer and temporary-save callback, never final submission.
  const examSaves = new Map();
  document.addEventListener('CX_EXAM_TEMP_SAVE_CANCEL', event => {
    examSaves.get(event.target)?.();
  });
  document.addEventListener('CX_EXAM_TEMP_SAVE', event => {
    const container = event.target;
    if (!/^sigleQuestionDiv_\d+$/.test(container?.id || '') || examSaves.has(container)) return;
    let request;
    try { request = JSON.parse(container.dataset.cxExamSaveRequest); } catch (_) { return; }
    if (!request.id || !Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0 || !Array.isArray(request.fields)) return;
    container.dataset.cxExamSaveAccepted = request.id;
    const qid = container.id.slice('sigleQuestionDiv_'.length);
    let finished = false, sent = false, poll, timeout;
    const finish = error => {
      if (finished) return;
      finished = true;
      clearInterval(poll); clearTimeout(timeout); examSaves.delete(container);
      container.dataset.cxExamSaveResult = JSON.stringify({ id: request.id, ok: !error, error: error || '' });
      container.dispatchEvent(new Event('CX_EXAM_TEMP_SAVE_RESULT', { bubbles: true }));
    };
    examSaves.set(container, () => finish('已停止等待暂存；已发出的暂存请求可能仍会完成'));
    const fieldsMatch = () => request.fields.length > 0 && request.fields.every(expected => {
      const field = Array.from(container.querySelectorAll('input, textarea')).find(node => node.name === expected.name && node.id === expected.id);
      return field && field.value === expected.value;
    }) && (request.frames || []).every(expected => {
      const frame = Array.from(container.querySelectorAll('iframe')).find(node => node.id === expected.id);
      return frame && frame.contentDocument?.body?.innerHTML === expected.html;
    });
    const idle = () => !window.submitOnce && !window.submitAjaxHandle && !window.Edit_Timed_Saving &&
      !window.Edit_LocalCache_Saving && !window.Ueditor_Attachment_Saving;
    const step = () => {
      if (finished) return;
      try {
        if (document.getElementById('answerMode')?.value !== '1') throw new Error('当前页面不支持整卷单题暂存');
        if (!container.isConnected || !fieldsMatch()) throw new Error('答题区已变化，暂存未确认');
        if (sent) {
          if (idle()) throw new Error('原生暂存未确认，请检查页面的错误提示');
          return;
        }
        if (!idle()) return;
        if (typeof window.submitForm !== 'function' || typeof window.setStuAnswerOfSomeQues !== 'function' ||
            typeof window.changeQuestionCardColor !== 'function' || typeof window.$ !== 'function') {
          throw new Error('页面未提供可用的单题暂存能力，请刷新后重试');
        }
        for (const textarea of container.querySelectorAll('textarea[id^="answer"]')) {
          if (!window.UE?.getEditor) throw new Error('页面编辑器尚未准备好');
          const editor = window.UE.getEditor(textarea.id);
          if (!editor?.setContent || !editor.sync) throw new Error('页面编辑器尚未准备好');
          editor.setContent(textarea.value, false);
          editor.sync();
        }
        const wrapped = window.$(container);
        window.setStuAnswerOfSomeQues(wrapped);
        if (!fieldsMatch()) throw new Error('原生答案字段与填写内容不一致，已暂停暂存');
        sent = true;
        window.submitForm(true, wrapped, () => {
          if (finished) return;
          try {
            if (!container.isConnected || !fieldsMatch()) throw new Error('暂存期间答题区已变化，结果未确认');
            window.changeQuestionCardColor(qid);
            if (!document.getElementById(`answerSheet${qid}`)?.classList.contains('active') || container.classList.contains('_unsavedstate')) {
              throw new Error('页面未确认本题已作答，暂存未确认');
            }
            finish();
          } catch (error) { finish(error.message); }
        });
      } catch (error) { finish(error.message); }
    };
    timeout = setTimeout(() => finish('等待单题暂存超时'), request.timeoutMs);
    poll = setInterval(step, 100);
    step();
  });

  // Synchronous bridge to the page-owned CodeMirror 5 instance. DOM line nodes
  // may be virtualized, so they must never be treated as the complete source.
  document.addEventListener('CX_CODE_EDITOR_READ', event => {
    const element = event.target;
    const editor = element?.CodeMirror;
    if (!editor?.getValue) return;
    element.dataset.cxCodeValue = editor.getValue();
  });
  document.addEventListener('CX_CODE_EDITOR_WRITE', event => {
    const element = event.target;
    const editor = element?.CodeMirror;
    if (!editor?.setValue || !element.hasAttribute('data-cx-code-write')) return;
    editor.setValue(element.dataset.cxCodeWrite);
    element.dataset.cxCodeWritten = 'true';
  });

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
  function handlePaste(e, instance) {
    e.preventDefault();
    e.stopPropagation();
    
    const doc = e.target.ownerDocument || document;
    const clipboardData = e.clipboardData || window.clipboardData;
    
    // 仅处理文本粘贴
    const text = clipboardData?.getData?.('text/plain') || 
                 window.clipboardData?.getData?.('Text') || '';
    
    if (text) {
      insertText(doc, text);
      syncUEditorContent(instance);
      setTimeout(() => syncUEditorContent(instance), 0);
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

  function dispatchChangeEvents(target) {
    if (!target?.dispatchEvent) return;

    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function normalizeEditorHtml(html) {
    const normalized = String(html || '').trim();
    const plainText = normalized
      .replace(/<br\s*\/?>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .trim();

    return plainText ? normalized : '<p><br/></p>';
  }

  function getInstanceDocument(instance) {
    return instance?.textarea?.ownerDocument
      || instance?.container?.ownerDocument
      || instance?.iframe?.ownerDocument
      || document;
  }

  function syncBlankPreview(textarea, html) {
    if (!textarea) return;

    textarea.value = html;
    textarea.textContent = html;
    dispatchChangeEvents(textarea);

    if (!textarea.id) return;

    const inputDivId = textarea.id.replace(/^answerEditor/, 'inpDiv');
    const inputDiv = textarea.ownerDocument?.getElementById(inputDivId);
    if (inputDiv) {
      inputDiv.innerHTML = html;
    }
  }

  function syncUEditorContent(instance) {
    if (!instance) return;

    let html = '';
    try {
      html = typeof instance.getContent === 'function'
        ? instance.getContent()
        : instance.body?.innerHTML || '';
    } catch (err) {
      html = instance.body?.innerHTML || '';
    }

    html = normalizeEditorHtml(html);

    try {
      if (typeof instance.sync === 'function') {
        instance.sync();
      }
    } catch (err) {
      // 忽略同步异常，继续手动补齐显示层
    }

    let textarea = instance.textarea || null;
    const ownerDoc = getInstanceDocument(instance);
    if (!textarea && instance.key) {
      textarea = ownerDoc.getElementById(instance.key);
    }
    if (!textarea && instance.container) {
      textarea = instance.container.parentElement?.querySelector(
        'textarea[id^="answerEditor"], textarea[id^="answer"]:not([id^="answertype"])'
      ) || null;
    }

    syncBlankPreview(textarea, html);

    try {
      if (typeof instance.fireEvent === 'function') {
        instance.fireEvent('contentChange');
        instance.fireEvent('selectionchange');
      }
    } catch (err) {
      // 忽略事件触发异常
    }
  }

  /**
   * Process a single UEditor instance
   * Enables paste functionality and removes restrictions
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
        instance.body.addEventListener('paste', event => handlePaste(event, instance), true);
        instance.body.__cxPasteEnabled = true;
      }
      if (instance.body && !instance.body.__cxBlurSyncEnabled) {
        instance.body.addEventListener('blur', () => syncUEditorContent(instance), true);
        instance.body.__cxBlurSyncEnabled = true;
      }

      // 处理 iframe 文档 (instance.iframe?.contentDocument)
      const iframeDoc = instance.iframe?.contentDocument;
      if (iframeDoc && !iframeDoc.__cxPasteEnabled) {
        removeElementRestrictions(iframeDoc.body);
        iframeDoc.addEventListener('paste', event => handlePaste(event, instance), true);
        iframeDoc.__cxPasteEnabled = true;
      }
      if (iframeDoc && !iframeDoc.__cxBlurSyncEnabled) {
        iframeDoc.addEventListener('blur', () => syncUEditorContent(instance), true);
        iframeDoc.__cxBlurSyncEnabled = true;
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
    let totalInstancesFound = 0;

    // console.log(`${LOG_PREFIX} Starting UEditor monitoring`);

    const checkUEditor = () => {
      attempts++;
      let currentBatchCount = 0;

      // 处理主窗口 UEditor 实例
      if (typeof UE !== 'undefined' && UE.instants) {
        const keys = Object.keys(UE.instants);
        if (keys.length > 0) {
          foundAny = true;
          currentBatchCount += keys.length;
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
              currentBatchCount += keys.length;
              Object.values(iframeWindow.UE.instants).forEach(instance => {
                processUEditorInstance(instance);
              });
            }
          }
        } catch (error) {
          // 跨域 iframe，静默处理
        }
      });
      
      if (currentBatchCount > totalInstancesFound) {
          totalInstancesFound = currentBatchCount;
      }

      // 继续检查直到达到最大尝试次数
      if (attempts < maxAttempts) {
        setTimeout(checkUEditor, interval);
      } else {
        if (foundAny) {
          console.log(`${LOG_PREFIX} 已解锁 ${totalInstancesFound} 个 UEditor 编辑器`);
          window.postMessage({ type: 'CX_UE_UNLOCKED', count: totalInstancesFound }, '*');
        }
      }
    };

    // 开始检查
    checkUEditor();
  }

  function monitorDialogueState() {
    if (!window.location.pathname.startsWith('/mooc2-ans-vue/situationalDialogue')) return;

    let boundVm = null;
    let unwatch = null;
    const emit = requestId => {
      const vm = document.querySelector('.chat-page')?.__vue__;
      const send = () => window.postMessage({
        type: 'CX_DIALOGUE_STATE',
        requestId,
        isSending: document.querySelector('.chat-page')?.__vue__ === vm &&
          typeof vm?.isSending === 'boolean' && typeof vm.$watch === 'function' ? vm.isSending : null
      }, '*');
      if (typeof vm?.$nextTick === 'function') vm.$nextTick(send);
      else send();
    };
    const bind = () => {
      const vm = document.querySelector('.chat-page')?.__vue__ || null;
      if (vm === boundVm) return;
      unwatch?.();
      boundVm = vm;
      unwatch = typeof vm?.$watch === 'function' && typeof vm.isSending === 'boolean'
        ? vm.$watch('isSending', () => emit(null), { immediate: true }) : null;
      if (!unwatch) emit(null);
    };

    window.addEventListener('message', event => {
      if (event.source !== window || event.data?.type !== 'CX_DIALOGUE_STATE_REQUEST') return;
      bind();
      emit(event.data.requestId);
    });
    const observe = () => {
      new MutationObserver(bind).observe(document.documentElement, { childList: true, subtree: true });
      bind();
    };
    if (document.documentElement) observe();
    else document.addEventListener('DOMContentLoaded', observe, { once: true });
  }

  monitorDialogueState();

  // 启动 UEditor 监控
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', monitorUEditor);
  } else {
    monitorUEditor();
  }

})();
