// Modal UI Component
const CXModal = {
  id: 'cx-copy-modal-overlay',
  
  // Inject modal HTML into the document
  inject() {
    // Inject Google Fonts if not present
    if (!document.getElementById('cx-google-fonts')) {
      const link = document.createElement('link');
      link.id = 'cx-google-fonts';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Nunito:wght@400;600;700&display=swap';
      document.head.appendChild(link);
    }

    if (document.getElementById(this.id)) return;
    
    const fontFamily = "'Nunito', 'Noto Sans SC', sans-serif";
    
    const modalHtml = `
      <div id="${this.id}" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:none;justify-content:center;align-items:center;z-index:10000;font-family:${fontFamily};">
        <div id="cx-copy-modal-content" style="background:#fff;padding:20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);width:80%;max-width:850px;max-height:95%;display:flex;flex-direction:column;">
          <h3 style="margin-top:0;margin-bottom:15px;color:#333;font-size:18px;font-weight:600;font-family:${fontFamily};">全部题目预览与编辑</h3>
          <textarea id="cx-copy-modal-textarea" style="width:100%;flex-grow:1;min-height:450px;height:600px;border:1px solid #ddd;border-radius:4px;padding:10px;font-size:14px;line-height:1.5;resize:vertical;outline:none;box-sizing:border-box;font-family:${fontFamily};"></textarea>
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
            <button id="cx-copy-modal-cancel" style="padding:8px 16px;border:1px solid #d9d9d9;border-radius:4px;background:#fff;cursor:pointer;font-size:14px;color:#333;font-family:${fontFamily};">取消</button>
            <button id="cx-copy-modal-copy" style="padding:8px 16px;border:none;border-radius:4px;background:#1677ff;color:#fff;cursor:pointer;font-size:14px;font-family:${fontFamily};">一键复制</button>
          </div>
        </div>
      </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    this.bindEvents();
  },

  // Bind event listeners
  bindEvents() {
    const overlay = document.getElementById(this.id);
    const textarea = document.getElementById('cx-copy-modal-textarea');
    
    document.getElementById('cx-copy-modal-cancel').addEventListener('click', () => this.hide());
    
    document.getElementById('cx-copy-modal-copy').addEventListener('click', async () => {
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(textarea.value);
          CXToast.success('已复制题目内容');
          this.hide();
        } else {
          // Fallback
          textarea.select();
          document.execCommand('copy');
          CXToast.success('已复制题目内容');
          this.hide();
        }
      } catch (e) {
        CXToast.error('复制失败，请重试');
        GlobalLogger.error('Copy failed', e.message);
      }
    });
    
    overlay.addEventListener('click', e => {
      if (e.target === overlay) this.hide();
    });
  },

  // Show the modal with content
  show(content) {
    const overlay = document.getElementById(this.id);
    const textarea = document.getElementById('cx-copy-modal-textarea');
    
    if (!overlay) {
      this.inject();
      this.show(content); // Retry
      return;
    }
    
    if (textarea) {
      textarea.value = content;
      overlay.style.display = 'flex';
    }
  },

  // Hide the modal
  hide() {
    const overlay = document.getElementById(this.id);
    if (overlay) {
      overlay.style.display = 'none';
    }
  }
};
