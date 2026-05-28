// Modal UI Component
const CXModal = {
  id: 'cx-copy-modal-overlay',
  
  // Inject modal HTML into the document
  inject() {
    if (document.getElementById(this.id)) return;
    
    // 使用系统默认字体体系，保持干净克制
    const fontFamily = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
    const monoFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    
    const modalHtml = `
      <div id="${this.id}" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:none;justify-content:center;align-items:center;z-index:99999;font-family:${fontFamily};">
        <div id="cx-copy-modal-content" style="background:#ffffff;border-radius:12px;box-shadow:0 10px 25px -5px rgba(0, 0, 0, 0.1);width:95%;max-width:1000px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;border:1px solid #e5e7eb;">
          
          <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid #f3f4f6;">
            <h3 style="margin:0;color:#111827;font-size:18px;font-weight:600;letter-spacing:-0.025em;">题目提取结果</h3>
            <button id="cx-copy-modal-close" style="background:transparent;border:none;color:#9ca3af;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;border-radius:6px;transition:background 0.2s;" onmouseover="this.style.background='#f3f4f6';this.style.color='#4b5563'" onmouseout="this.style.background='transparent';this.style.color='#9ca3af'">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          
          <div style="padding:24px;flex-grow:1;display:flex;flex-direction:column;overflow:hidden;">
            <textarea id="cx-copy-modal-textarea" style="width:100%;flex-grow:1;min-height:450px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;font-size:14px;color:#374151;line-height:1.6;resize:none;outline:none;box-sizing:border-box;font-family:${monoFamily};transition:border-color 0.2s;" onfocus="this.style.borderColor='#d1d5db'" onblur="this.style.borderColor='#e5e7eb'"></textarea>
          </div>
          
          <div style="display:flex;justify-content:flex-end;align-items:center;gap:12px;padding:16px 24px;border-top:1px solid #f3f4f6;background:#fafafa;">
            <button id="cx-copy-modal-cancel" style="padding:8px 16px;border:1px solid #e5e7eb;border-radius:6px;background:#ffffff;cursor:pointer;font-size:14px;font-weight:500;color:#374151;transition:all 0.2s;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#ffffff'">取消</button>
            <button id="cx-copy-modal-copy" style="padding:8px 16px;border:none;border-radius:6px;background:#111827;color:#ffffff;cursor:pointer;font-size:14px;font-weight:500;transition:all 0.2s;display:flex;align-items:center;gap:6px;" onmouseover="this.style.background='#374151'" onmouseout="this.style.background='#111827'">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              一键复制
            </button>
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
    
    document.getElementById('cx-copy-modal-close').addEventListener('click', () => this.hide());
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
