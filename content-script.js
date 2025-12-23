// Chaoxing Copy & Paste Helper - Content Script
// This file will contain the main extension logic

/**
 * PasteEnabler - Module to remove copy/paste/selection restrictions
 */
const PasteEnabler = {
  /**
   * Remove global event restrictions from document
   * Removes paste/contextmenu/selectstart/dragstart/copy/cut/keydown events
   */
  removeGlobalRestrictions() {
    try {
      const events = ['paste', 'contextmenu', 'selectstart', 'dragstart', 'copy', 'cut', 'keydown'];
      
      // Remove event handlers from document
      events.forEach(eventType => {
        try {
          document[`on${eventType}`] = null;
        } catch (err) {
          // Silently handle individual event removal errors
        }
      });
      
      // Remove restrictions from document.body
      if (document.body) {
        this.removeElementRestrictions(document.body);
      }
      
      console.log('[CX] Global restrictions removed');
    } catch (err) {
      // Silently handle errors
    }
  },

  /**
   * Inject global CSS styles to force user-select: text
   */
  injectGlobalStyles() {
    try {
      const style = document.createElement('style');
      style.textContent = `
        * {
          user-select: text !important;
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    } catch (err) {
      // Silently handle errors
    }
  },

  /**
   * Remove restrictions from a specific element
   * Removes readonly/disabled attributes and event restriction attributes
   */
  removeElementRestrictions(element) {
    if (!element) return;

    try {
      // Remove readonly and disabled attributes
      element.removeAttribute('readonly');
      element.removeAttribute('disabled');

      // Remove event restriction attributes
      const eventAttrs = [
        'onpaste', 'oncopy', 'oncut', 'oncontextmenu',
        'onselectstart', 'ondragstart', 'onkeydown'
      ];
      
      eventAttrs.forEach(attr => {
        try {
          element.removeAttribute(attr);
          element[attr] = null;
        } catch (err) {
          // Silently handle individual attribute removal errors
        }
      });

      // Force user-select style
      element.style.userSelect = 'text';
      element.style.webkitUserSelect = 'text';
    } catch (err) {
      // Silently handle element restriction removal errors
    }
  },

  /**
   * Enable all existing editable elements on the page
   */
  enableExistingElements() {
    try {
      const selectors = 'input, textarea, [contenteditable]';
      const elements = document.querySelectorAll(selectors);
      
      elements.forEach(element => {
        this.removeElementRestrictions(element);
      });
    } catch (err) {
      // Silently handle errors
    }
  },

  /**
   * Handle paste event
   * Prevents default behavior and inserts text at cursor position
   */
  handlePaste(e) {
    try {
      e.preventDefault();
      e.stopPropagation();
      
      const doc = e.target.ownerDocument || document;
      const clipboardData = e.clipboardData || window.clipboardData;
      
      // Get text from clipboard
      const text = clipboardData?.getData?.('text/plain') || 
                   window.clipboardData?.getData?.('Text') || '';
      
      if (text) {
        this.insertText(doc, text);
      }
    } catch (err) {
      // Silently handle paste errors
    }
  },

  /**
   * Insert text at cursor position
   * Uses execCommand or Selection API as fallback
   * @param {Document} doc - Document object
   * @param {string} text - Text to insert
   * @returns {boolean} - Success status
   */
  insertText(doc, text) {
    try {
      // Try using execCommand to insert text
      if (doc.execCommand?.('insertText', false, text)) {
        return true;
      }
    } catch (err) {
      // execCommand failed, try fallback
    }
    
    try {
      // Fallback: Use Selection API
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
    } catch (err) {
      // Selection API failed
    }
    
    try {
      // Last fallback: Append to body
      if (doc.body) {
        doc.body.appendChild(doc.createTextNode(text));
      }
    } catch (err) {
      // All methods failed
    }
    
    return false;
  },

  /**
   * Start MutationObserver to handle dynamically added elements
   * Monitors for new input/textarea/contenteditable elements and iframes
   */
  startMutationObserver() {
    try {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            try {
              // Handle the node itself if it's an editable element
              if (node.matches && node.matches('input, textarea, [contenteditable]')) {
                this.removeElementRestrictions(node);
              }

              // Handle child elements
              if (node.querySelectorAll) {
                const editableElements = node.querySelectorAll('input, textarea, [contenteditable]');
                editableElements.forEach(element => {
                  this.removeElementRestrictions(element);
                });
              }

              // Handle iframes (same-origin only)
              if (node.tagName === 'IFRAME') {
                try {
                  const iframeDoc = node.contentDocument || node.contentWindow?.document;
                  if (iframeDoc) {
                    // Process iframe content
                    const iframeElements = iframeDoc.querySelectorAll('input, textarea, [contenteditable]');
                    iframeElements.forEach(element => {
                      this.removeElementRestrictions(element);
                    });
                  }
                } catch (e) {
                  // Cross-origin iframe, silently skip
                }
              }
            } catch (err) {
              // Silently handle individual node processing errors
            }
          });
        });
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    } catch (err) {
      // Silently handle errors
    }
  },

  /**
   * Initialize PasteEnabler module
   */
  init() {
    this.injectGlobalStyles();
    this.removeGlobalRestrictions();
    this.enableExistingElements();
    this.startMutationObserver();
  }
};

/**
 * CopyEnabler - Module for font decryption
 */
const CopyEnabler = {
  /**
   * Main decryption function
   * Loads table.json, parses encrypted font, and replaces text
   */
  async decrypt() {
    try {
      // Find style element containing encrypted font
      const styleElement = this.findStyleContaining('font-cxsecret');
      if (!styleElement) {
        // No encrypted font found, silently skip
        return;
      }

      // Extract base64 font data from style
      const fontMatch = styleElement.textContent.match(/base64,([\w\W]+?)'/);
      if (!fontMatch) return;

      // Parse font using Typr
      const fontData = Typr.parse(this.base64ToUint8Array(fontMatch[1]))[0];
      
      // Load character mapping table
      const tableUrl = chrome.runtime.getURL('assets/table.json');
      const response = await fetch(tableUrl);
      if (!response.ok) return;
      const table = await response.json();
      
      // Create character mapping
      const charMap = this.createCharMap(fontData, table);
      
      // Replace encrypted text
      this.replaceEncryptedText(charMap);
      
      console.log(`[CX] Decrypted ${Object.keys(charMap).length} chars`);
    } catch (error) {
      // Silently handle errors
    }
  },

  /**
   * Find style element containing specific text
   * @param {string} text - Text to search for
   * @returns {HTMLStyleElement|null} - Found style element or null
   */
  findStyleContaining(text) {
    const styles = document.querySelectorAll('style');
    return Array.from(styles).find(style => 
      style.textContent.includes(text)
    ) || null;
  },

  /**
   * Convert base64 string to Uint8Array
   * @param {string} base64 - Base64 encoded string
   * @returns {Uint8Array} - Decoded binary data
   */
  base64ToUint8Array(base64) {
    const data = window.atob(base64);
    return new Uint8Array([...data].map(char => char.charCodeAt(0)));
  },

  /**
   * Create character mapping from font data and table
   * Uses Typr to parse font glyphs and md5 to calculate hash
   * @param {Object} font - Parsed font object from Typr
   * @param {Object} table - Character mapping table (md5 hash -> unicode)
   * @returns {Object} - Character map (encrypted char -> decrypted char)
   */
  createCharMap(font, table) {
    const charMap = {};
    // Iterate through common Chinese character range (U+4E00 to U+9FA5)
    for (let i = 19968; i < 40870; i++) {
      const glyph = Typr.U.codeToGlyph(font, i);
      if (!glyph) continue;
      
      // Get glyph path and calculate md5 hash
      const path = Typr.U.glyphToPath(font, glyph);
      const pathHash = md5(JSON.stringify(path)).slice(24); // Last 8 characters
      
      // Map encrypted character to decrypted character
      if (table[pathHash]) {
        charMap[String.fromCharCode(i)] = String.fromCharCode(table[pathHash]);
      }
    }
    return charMap;
  },

  /**
   * Replace encrypted text in all .font-cxsecret elements
   * @param {Object} charMap - Character mapping (encrypted -> decrypted)
   */
  replaceEncryptedText(charMap) {
    const elements = document.querySelectorAll('.font-cxsecret');
    elements.forEach(element => {
      let html = element.innerHTML;
      // Replace each encrypted character with its decrypted counterpart
      Object.entries(charMap).forEach(([encrypted, decrypted]) => {
        html = html.replace(new RegExp(encrypted, 'g'), decrypted);
      });
      element.innerHTML = html;
      // Remove the font-cxsecret class after decryption
      element.classList.remove('font-cxsecret');
    });
  }
};

/**
 * CopyAllQuestion - Module for one-click copy all questions
 */
const CopyAllQuestion = {
  MESSAGE: {
    REQUEST: 'CX_GET_TITLES',
    RESPONSE: 'CX_TITLES_RESPONSE'
  },

  /**
   * Extract questions from document
   * Parses .TiMu containers and .Zy_TItle titles
   * Formats options as A/B/C/D
   * @param {Document} doc - Document to extract from
   * @returns {Array} - Array of question objects
   */
  extractQuestionsFromDocument(doc) {
    const questions = [];
    
    // 辅助函数：从题目容器中提取标题
    const getTitleFrom = (root) => {
      const titleNode = root.querySelector('.Zy_TItle .fontLabel, .Zy_Title .fontLabel, .newZy_TItle .fontLabel, .newZy_Title .fontLabel')
        || root.querySelector('.Zy_TItle, .Zy_Title, .newZy_TItle, .newZy_Title');
      return (titleNode?.textContent || '').replace(/\s+/g, ' ').trim();
    };
    
    // Find all question containers
    const containers = Array.from(doc.querySelectorAll('.TiMu'));
    
    if (containers.length > 0) {
      containers.forEach(box => {
        const title = getTitleFrom(box);
        if (!title) return;
        
        // Extract options from ul.Zy_ulTop
        const ul = box.querySelector('ul.Zy_ulTop.w-top.fl');
        const lis = ul ? Array.from(ul.querySelectorAll(':scope > li')) : [];
        const options = lis.map((li, idx) => {
          const p = li.querySelector('p') || li.querySelector('a') || li;
          const text = (p?.textContent || '').replace(/\s+/g, ' ').trim();
          const letter = String.fromCharCode(65 + idx); // A,B,C...
          return `${letter}. ${text}`;
        }).filter(Boolean);
        
        // Determine question type based on option count
        let type = 'other';
        if (options.length === 4) type = 'single';
        else if (options.length >= 5) type = 'multi';
        
        questions.push({ title, options, type });
      });
    }
    
    // 若无 TiMu 容器，退回到标题列表作为简答题/其他题
    if (questions.length === 0) {
      const titles = this.extractTitlesFromDocument(doc);
      titles.forEach(t => questions.push({ title: t, options: [], type: 'other' }));
    }
    
    return questions;
  },
  
  /**
   * Extract titles from document (legacy compatibility)
   * @param {Document} doc - Document to extract from
   * @returns {Array} - Array of title strings
   */
  extractTitlesFromDocument(doc) {
    // 覆盖更多页面结构（老版/新版、题目容器、TiMu 包裹等）
    const primarySelectors = [
      '.Zy_TItle .fontLabel',
      '.Zy_Title .fontLabel',
      '.newZy_TItle .fontLabel',
      '.newZy_Title .fontLabel',
      '.TiMu .Zy_TItle .fontLabel',
      '.TiMu .Zy_Title .fontLabel',
      '[class*="Zy_"][class*="TItle"] .fontLabel',
      '[class*="Zy_"][class*="Title"] .fontLabel'
    ];

    const fallbackSelectors = [
      '.Zy_TItle',
      '.Zy_Title',
      '.newZy_TItle',
      '.newZy_Title',
      '.TiMu .Zy_TItle',
      '.TiMu .Zy_Title'
    ];

    const set = new Set();

    // 先从 fontLabel（解密字体）中提取
    primarySelectors.forEach(sel => {
      doc.querySelectorAll(sel).forEach(n => {
        const text = (n.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) set.add(text);
      });
    });

    // 若未命中，则退回到题目容器本身文本
    if (set.size === 0) {
      fallbackSelectors.forEach(sel => {
        doc.querySelectorAll(sel).forEach(n => {
          const text = (n.textContent || '').replace(/\s+/g, ' ').trim();
          if (text) set.add(text);
        });
      });
    }

    return Array.from(set);
  },

  /**
   * Inject modal HTML for preview and editing
   * Creates modal dialog for displaying collected questions
   */
  injectModal() {
    try {
      // Check if modal already exists
      if (document.getElementById('cx-copy-modal-overlay')) return;
      
      const modalHtml = `
        <div id="cx-copy-modal-overlay" style="
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 10000;
          display: none;
        ">
          <div id="cx-copy-modal-content" style="
            background: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            width: 80%;
            max-width: 850px;
            max-height: 95%; 
            display: flex;
            flex-direction: column;
          ">
            <h3 style="margin-top: 0; margin-bottom: 15px; color: #333;">全部题目预览与编辑</h3>
            <textarea id="cx-copy-modal-textarea" style="
              width: 100%;
              flex-grow: 1;
              min-height: 450px;
              height: 600px;
              border: 1px solid #ddd;
              border-radius: 4px;
              padding: 10px;
              font-size: 14px;
              line-height: 1.5;
              resize: vertical;
              outline: none;
              box-sizing: border-box;
            "></textarea>
            <div id="cx-copy-modal-footer" style="
              display: flex;
              justify-content: flex-end;
              gap: 10px;
              margin-top: 20px;
            ">
              <button id="cx-copy-modal-cancel" style="
                padding: 8px 16px;
                border: 1px solid #d9d9d9;
                border-radius: 4px;
                background: #fff;
                cursor: pointer;
                font-size: 14px;
                color: #333;
              ">取消</button>
              <button id="cx-copy-modal-copy" style="
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                background: #1677ff;
                color: #fff;
                cursor: pointer;
                font-size: 14px;
              ">一键复制</button>
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      
      // 获取模态框元素
      const modalOverlay = document.getElementById('cx-copy-modal-overlay');
      const textarea = document.getElementById('cx-copy-modal-textarea');
      const cancelButton = document.getElementById('cx-copy-modal-cancel');
      const copyButton = document.getElementById('cx-copy-modal-copy');

      // 取消按钮事件
      cancelButton.addEventListener('click', () => {
        modalOverlay.style.display = 'none';
      });

      // 复制按钮事件
      copyButton.addEventListener('click', async () => {
        try {
          await this.copyToClipboard(textarea.value);
          this.toast('已复制题目内容');
          modalOverlay.style.display = 'none';
        } catch (e) {
          this.toast('复制失败，请重试');
        }
      });

      // 点击遮罩层关闭模态框
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          modalOverlay.style.display = 'none';
        }
      });
    } catch (err) {
      // Silently handle errors
    }
  },

  /**
   * Show modal with content
   * @param {string} content - Content to display in modal
   */
  showModal(content) {
    const modalOverlay = document.getElementById('cx-copy-modal-overlay');
    const textarea = document.getElementById('cx-copy-modal-textarea');
    if (modalOverlay && textarea) {
      textarea.value = content;
      modalOverlay.style.display = 'flex';
    }
  },

  /**
   * Insert copy button after "章节详情" header
   * Creates and inserts the "点击复制所有题目" button
   */
  insertCopyButton() {
    try {
      // Check if button already exists
      if (document.getElementById('__cx_copy_all_btn')) return;
      
      // Find "章节详情" header - 原始代码查找 h2 标签
      const h2s = Array.from(document.querySelectorAll('h2'));
      const anchor = h2s.find(h => h.textContent?.trim()?.includes('章节详情'));
      
      if (!anchor) return;
      
      // Create copy button
      const btn = document.createElement('button');
      btn.id = '__cx_copy_all_btn';
      btn.textContent = '点击复制所有题目';
      btn.setAttribute('type', 'button');
      btn.style.cssText = [
        'position: sticky',
        'top: 8px',
        'margin: 8px 0',
        'padding: 6px 12px',
        'background: #1677ff',
        'color: #fff',
        'border: none',
        'border-radius: 4px',
        'font-size: 14px',
        'cursor: pointer',
        'z-index: 9999'
      ].join(';');
      
      btn.addEventListener('click', async () => {
        try {
          const content = await this.collectAllTitles();
          this.showModal(content);
        } catch (e) {
          this.toast('收集题目失败，请重试');
        }
      });
      
      // Insert button after header
      anchor.insertAdjacentElement('afterend', btn);
    } catch (err) {
      // Silently handle errors
    }
  },

  /**
   * Collect all titles from current page and iframes
   * Recursively collects questions from main document and all iframes
   * @returns {Promise<string>} - Formatted string of all questions
   */
  async collectAllTitles() {
    const sections = await this.collectTitlesFromDocument(document);
    const lines = [];
    
    sections.forEach(({ header, questions }) => {
      if (questions?.length) {
        if (header) {
          lines.push(`# ${header}`);
          lines.push('');
        }
        questions.forEach((q, idx) => {
          const titleLine = `${idx + 1}. ${q.title}`;
          lines.push(titleLine);
          if (Array.isArray(q.options) && q.options.length) {
            q.options.forEach(opt => lines.push(opt));
          }
          lines.push('');
        });
      }
    });
    
    return lines.join('\n');
  },

  /**
   * Collect titles from a specific document (递归采集指定文档内所有题目，含嵌套 iframe)
   * @param {Document} doc - Document to collect from
   * @returns {Promise<Array>} - Array of section objects with header and questions
   */
  async collectTitlesFromDocument(doc) {
    const sections = [];
    const header = this.findHeaderTitle(doc) || doc.title || '';
    const questions = this.extractQuestionsFromDocument(doc);
    if (questions.length) sections.push({ header, questions });

    const frames = Array.from(doc.querySelectorAll('iframe'));
    for (const frame of frames) {
      try {
        const fdoc = frame.contentDocument;
        if (fdoc) {
          const childSections = await this.collectTitlesFromDocument(fdoc);
          sections.push(...childSections);
        } else {
          const res = await this.collectFromFrame(frame);
          if (res?.questions?.length) sections.push(res);
        }
      } catch (_) {
        const res = await this.collectFromFrame(frame);
        if (res?.questions?.length) sections.push(res);
      }
    }

    return sections;
  },

  /**
   * Collect from cross-origin iframe using postMessage
   * @param {HTMLIFrameElement} frame - Iframe element
   * @returns {Promise<Object>} - Section object with header and questions
   */
  collectFromFrame(frame) {
    // 优先同源直接采集
    try {
      const doc = frame.contentDocument;
      if (doc) {
        const questions = this.extractQuestionsFromDocument(doc);
        const header = this.findHeaderTitle(doc) || doc.title || '';
        return Promise.resolve({ header, questions });
      }
    } catch (_) {
      // 跨域，继续使用 postMessage
    }

    // 跨域使用 postMessage 请求
    const id = Math.random().toString(36).slice(2);
    return new Promise((resolve) => {
      const onMessage = (event) => {
        try {
          const data = event.data || {};
          if (data?.type === this.MESSAGE.RESPONSE && data.id === id) {
            window.removeEventListener('message', onMessage);
            const questions = Array.isArray(data.questions) 
              ? data.questions 
              : (data.titles || []).map(t => ({ title: t, options: [], type: 'other' }));
            resolve({ header: data.header || '', questions });
          }
        } catch (err) {
          // Silently handle message parsing errors
        }
      };
      window.addEventListener('message', onMessage);

      // 超时保护
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        resolve({ header: '', questions: [] });
      }, 3000);

      try {
        frame.contentWindow?.postMessage({ type: this.MESSAGE.REQUEST, id }, '*');
      } catch (e) {
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve({ header: '', questions: [] });
      }
    });
  },

  /**
   * Find header title in document
   * @param {Document} doc - Document to search
   * @returns {string} - Header title or empty string
   */
  findHeaderTitle(doc) {
    // 子页面：作业标题常在 .ceyan_name h3 或 .newTestTitle
    const h3 = doc.querySelector('.ceyan_name h3');
    if (h3?.textContent) return h3.textContent.trim();
    
    const testName = doc.querySelector('.newTestTitle .TestTitle_name');
    if (testName?.textContent) return testName.textContent.trim();
    
    // 顶层列表页面：寻找"章节详情"
    const h2 = Array.from(doc.querySelectorAll('h2')).find(h => h.textContent?.includes('章节详情'));
    if (h2?.textContent) return h2.textContent.trim();
    
    return '';
  },

  /**
   * Setup message handler for cross-origin iframe communication
   * Responds to postMessage requests from parent frames
   */
  setupMessageHandler() {
    try {
      window.addEventListener('message', async (event) => {
        try {
          const data = event.data || {};
          if (data?.type !== this.MESSAGE.REQUEST || !data.id) return;
          
          // 只响应超星域名消息
          const host = new URL(event.origin).hostname || '';
          if (!/chaoxing\.com$/.test(host)) return;

          const titles = this.extractTitlesFromDocument(document); // 兼容旧协议
          const questions = this.extractQuestionsFromDocument(document);
          const header = this.findHeaderTitle(document) || document.title || '';
          
          event.source?.postMessage({
            type: this.MESSAGE.RESPONSE,
            id: data.id,
            titles, // 兼容旧协议
            questions,
            header
          }, event.origin);
        } catch (err) {
          // 忽略跨域或解析错误
        }
      }, false);
    } catch (err) {
      // Silently handle errors
    }
  },

  /**
   * Copy text to clipboard
   * Uses modern Clipboard API with execCommand fallback
   * @param {string} text - Text to copy
   * @returns {Promise<boolean>} - Success status
   */
  async copyToClipboard(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {
      // Clipboard API failed, use fallback
    }
    
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { 
      document.execCommand('copy'); 
    } catch (_) {
      // execCommand failed
    }
    document.body.removeChild(ta);
    return true;
  },

  /**
   * Show toast notification
   * @param {string} msg - Message to display
   */
  toast(msg) {
    try {
      const el = document.createElement('div');
      el.textContent = msg;
      el.style.cssText = [
        'position: fixed',
        'left: 50%',
        'top: 24px',
        'transform: translateX(-50%)',
        'background: rgba(0,0,0,0.75)',
        'color: #fff',
        'padding: 8px 12px',
        'border-radius: 4px',
        'font-size: 13px',
        'z-index: 10000'
      ].join(';');
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1500);
    } catch (_) {
      // Toast failed
    }
  },

  /**
   * Initialize CopyAllQuestion module
   */
  init() {
    try {
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          this.injectModal();
          this.insertCopyButton();
          this.setupMessageHandler();
        });
      } else {
        this.injectModal();
        this.insertCopyButton();
        this.setupMessageHandler();
      }
    } catch (err) {
      // Silently handle errors
    }
  }
};

/**
 * ChaoxingHelper - Main entry point for the extension
 */
const ChaoxingHelper = {
  /**
   * Inject Page Script to access window.UE (UEditor instances)
   * Creates a <script> tag to inject injected.js into page context
   * 
   * 关键说明：
   * Chrome 扩展的 Content Script 运行在"隔离世界"中，无法直接访问页面的全局变量
   * 油猴脚本使用 @grant unsafeWindow 可以直接访问 window.UE
   * Chrome 扩展需要通过注入 <script> 标签的方式来访问页面上下文
   */
  injectPageScript() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injected.js');
      script.onload = function() {
        this.remove(); // Clean up after injection
      };
      script.onerror = function() {
        // Failed to load
      };
      
      // 在 document_start 时，document.head 可能还不存在
      // 使用 document.documentElement 作为备选
      const parent = document.head || document.documentElement;
      if (parent) {
        parent.appendChild(script);
      } else {
        // 如果连 documentElement 都不存在，等待 DOM 准备好再注入
        document.addEventListener('DOMContentLoaded', () => {
          (document.head || document.documentElement).appendChild(script);
        }, { once: true });
      }
    } catch (err) {
      // Silently handle injection errors
    }
  },

  /**
   * Initialize modules that need to run at document_start
   * These modules must execute before page scripts to be effective
   */
  initEarlyModules() {
    try {
      // PasteEnabler must run early to intercept restrictions
      PasteEnabler.init();
      
      // Inject Page Script early to catch UEditor initialization
      this.injectPageScript();
    } catch (err) {
      // Silently handle errors
    }
  },

  /**
   * Initialize modules that need to run after DOM is ready
   * These modules require DOM elements to be present
   */
  initDOMModules() {
    try {
      // Font decryption requires style elements to be present
      CopyEnabler.decrypt().catch(() => {});
      
      // CopyAllQuestion requires DOM structure to be ready
      CopyAllQuestion.init();
    } catch (err) {
      // Silently handle errors
    }
  },

  /**
   * Main initialization entry point
   * Handles both document_start and DOMContentLoaded timing
   * Requirements: 5.3 - Content Script injection at document_start
   */
  init() {
    try {
      console.log('[CX] Extension loaded');
      
      // Phase 1: Initialize early modules immediately (document_start)
      this.initEarlyModules();
      
      // Phase 2: Initialize DOM-dependent modules after DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.initDOMModules());
      } else {
        this.initDOMModules();
      }
    } catch (err) {
      // Critical error in initialization
    }
  }
};

// Initialize immediately since we run at document_start
// Wrap in try-catch to prevent any errors from breaking the page
try {
  ChaoxingHelper.init();
} catch (err) {
  // Failed to start
}
