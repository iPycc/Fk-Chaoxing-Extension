// CopyAllQuestion - One-click copy all questions

const CopyAllQuestion = {
  MESSAGE: { REQUEST: 'CX_GET_TITLES', RESPONSE: 'CX_TITLES_RESPONSE' },

  // Extract questions from document
  extractQuestionsFromDocument(doc) {
    const questions = [];
    const getTitleFrom = (root) => {
      const node = root.querySelector('.Zy_TItle .fontLabel, .Zy_Title .fontLabel, .newZy_TItle .fontLabel, .newZy_Title .fontLabel')
        || root.querySelector('.Zy_TItle, .Zy_Title, .newZy_TItle, .newZy_Title');
      return (node?.textContent || '').replace(/\s+/g, ' ').trim();
    };
    
    const containers = Array.from(doc.querySelectorAll('.TiMu'));
    if (containers.length > 0) {
      containers.forEach(box => {
        const title = getTitleFrom(box);
        if (!title) return;
        const ul = box.querySelector('ul.Zy_ulTop.w-top.fl');
        const lis = ul ? Array.from(ul.querySelectorAll(':scope > li')) : [];
        const options = lis.map((li, idx) => {
          const p = li.querySelector('p') || li.querySelector('a') || li;
          const text = (p?.textContent || '').replace(/\s+/g, ' ').trim();
          return `${String.fromCharCode(65 + idx)}. ${text}`;
        }).filter(Boolean);
        let type = options.length === 4 ? 'single' : options.length >= 5 ? 'multi' : 'other';
        questions.push({ title, options, type });
      });
    }
    
    if (questions.length === 0) {
      this.extractTitlesFromDocument(doc).forEach(t => questions.push({ title: t, options: [], type: 'other' }));
    }
    return questions;
  },
  
  // Extract titles (legacy)
  extractTitlesFromDocument(doc) {
    const primary = ['.Zy_TItle .fontLabel', '.Zy_Title .fontLabel', '.newZy_TItle .fontLabel', '.newZy_Title .fontLabel',
      '.TiMu .Zy_TItle .fontLabel', '.TiMu .Zy_Title .fontLabel'];
    const fallback = ['.Zy_TItle', '.Zy_Title', '.newZy_TItle', '.newZy_Title', '.TiMu .Zy_TItle', '.TiMu .Zy_Title'];
    const set = new Set();
    primary.forEach(sel => doc.querySelectorAll(sel).forEach(n => {
      const text = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) set.add(text);
    }));
    if (set.size === 0) {
      fallback.forEach(sel => doc.querySelectorAll(sel).forEach(n => {
        const text = (n.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) set.add(text);
      }));
    }
    return Array.from(set);
  },


  // Inject modal HTML
  injectModal() {
    try {
      if (document.getElementById('cx-copy-modal-overlay')) return;
      const modalHtml = `
        <div id="cx-copy-modal-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:none;justify-content:center;align-items:center;z-index:10000;">
          <div id="cx-copy-modal-content" style="background:#fff;padding:20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);width:80%;max-width:850px;max-height:95%;display:flex;flex-direction:column;">
            <h3 style="margin-top:0;margin-bottom:15px;color:#333;">全部题目预览与编辑</h3>
            <textarea id="cx-copy-modal-textarea" style="width:100%;flex-grow:1;min-height:450px;height:600px;border:1px solid #ddd;border-radius:4px;padding:10px;font-size:14px;line-height:1.5;resize:vertical;outline:none;box-sizing:border-box;"></textarea>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
              <button id="cx-copy-modal-cancel" style="padding:8px 16px;border:1px solid #d9d9d9;border-radius:4px;background:#fff;cursor:pointer;font-size:14px;color:#333;">取消</button>
              <button id="cx-copy-modal-copy" style="padding:8px 16px;border:none;border-radius:4px;background:#1677ff;color:#fff;cursor:pointer;font-size:14px;">一键复制</button>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      
      const overlay = document.getElementById('cx-copy-modal-overlay');
      const textarea = document.getElementById('cx-copy-modal-textarea');
      document.getElementById('cx-copy-modal-cancel').addEventListener('click', () => overlay.style.display = 'none');
      document.getElementById('cx-copy-modal-copy').addEventListener('click', async () => {
        try {
          await this.copyToClipboard(textarea.value);
          this.toast('已复制题目内容');
          overlay.style.display = 'none';
        } catch (e) { this.toast('复制失败，请重试'); }
      });
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
    } catch (err) {}
  },

  showModal(content) {
    const overlay = document.getElementById('cx-copy-modal-overlay');
    const textarea = document.getElementById('cx-copy-modal-textarea');
    if (overlay && textarea) { textarea.value = content; overlay.style.display = 'flex'; }
  },

  // Insert copy button
  insertCopyButton() {
    try {
      if (document.getElementById('__cx_copy_all_btn')) return;
      const anchor = Array.from(document.querySelectorAll('h2')).find(h => h.textContent?.trim()?.includes('章节详情'));
      if (!anchor) return;
      
      const btn = document.createElement('button');
      btn.id = '__cx_copy_all_btn';
      btn.textContent = '📋 复制题目';
      btn.type = 'button';
      btn.style.cssText = 'position:sticky;top:8px;margin:8px 4px 8px 0;padding:6px 12px;background:#fff;color:#333;border:1px solid #d9d9d9;border-radius:4px;font-size:13px;cursor:pointer;z-index:9999;transition:all 0.2s';
      btn.addEventListener('mouseenter', () => {
        btn.style.borderColor = '#1677ff';
        btn.style.color = '#1677ff';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.borderColor = '#d9d9d9';
        btn.style.color = '#333';
      });
      btn.addEventListener('click', async () => {
        try {
          const content = await this.collectAllTitles();
          this.showModal(content);
        } catch (e) { this.toast('收集题目失败，请重试'); }
      });
      anchor.insertAdjacentElement('afterend', btn);
    } catch (err) {}
  },


  // Collect all titles
  async collectAllTitles() {
    const sections = await this.collectTitlesFromDocument(document);
    const lines = [];
    sections.forEach(({ header, questions }) => {
      if (questions?.length) {
        if (header) { lines.push(`# ${header}`); lines.push(''); }
        questions.forEach((q, idx) => {
          lines.push(`${idx + 1}. ${q.title}`);
          if (Array.isArray(q.options) && q.options.length) q.options.forEach(opt => lines.push(opt));
          lines.push('');
        });
      }
    });
    return lines.join('\n');
  },

  // Collect from document recursively
  async collectTitlesFromDocument(doc) {
    const sections = [];
    const header = this.findHeaderTitle(doc) || doc.title || '';
    const questions = this.extractQuestionsFromDocument(doc);
    if (questions.length) sections.push({ header, questions });

    for (const frame of Array.from(doc.querySelectorAll('iframe'))) {
      try {
        const fdoc = frame.contentDocument;
        if (fdoc) { sections.push(...await this.collectTitlesFromDocument(fdoc)); }
        else { const res = await this.collectFromFrame(frame); if (res?.questions?.length) sections.push(res); }
      } catch (_) {
        const res = await this.collectFromFrame(frame);
        if (res?.questions?.length) sections.push(res);
      }
    }
    return sections;
  },

  // Collect from cross-origin iframe
  collectFromFrame(frame) {
    try {
      const doc = frame.contentDocument;
      if (doc) return Promise.resolve({ header: this.findHeaderTitle(doc) || doc.title || '', questions: this.extractQuestionsFromDocument(doc) });
    } catch (_) {}

    const id = Math.random().toString(36).slice(2);
    return new Promise(resolve => {
      const onMsg = e => {
        try {
          if (e.data?.type === this.MESSAGE.RESPONSE && e.data.id === id) {
            window.removeEventListener('message', onMsg);
            const questions = Array.isArray(e.data.questions) ? e.data.questions : (e.data.titles || []).map(t => ({ title: t, options: [], type: 'other' }));
            resolve({ header: e.data.header || '', questions });
          }
        } catch (err) {}
      };
      window.addEventListener('message', onMsg);
      setTimeout(() => { window.removeEventListener('message', onMsg); resolve({ header: '', questions: [] }); }, 3000);
      try { frame.contentWindow?.postMessage({ type: this.MESSAGE.REQUEST, id }, '*'); } catch (e) { resolve({ header: '', questions: [] }); }
    });
  },

  findHeaderTitle(doc) {
    const h3 = doc.querySelector('.ceyan_name h3');
    if (h3?.textContent) return h3.textContent.trim();
    const testName = doc.querySelector('.newTestTitle .TestTitle_name');
    if (testName?.textContent) return testName.textContent.trim();
    const h2 = Array.from(doc.querySelectorAll('h2')).find(h => h.textContent?.includes('章节详情'));
    if (h2?.textContent) return h2.textContent.trim();
    return '';
  },

  // Message handler for iframe communication
  setupMessageHandler() {
    try {
      window.addEventListener('message', async e => {
        try {
          if (e.data?.type !== this.MESSAGE.REQUEST || !e.data.id) return;
          if (!/chaoxing\.com$/.test(new URL(e.origin).hostname || '')) return;
          e.source?.postMessage({
            type: this.MESSAGE.RESPONSE, id: e.data.id,
            titles: this.extractTitlesFromDocument(document),
            questions: this.extractQuestionsFromDocument(document),
            header: this.findHeaderTitle(document) || document.title || ''
          }, e.origin);
        } catch (err) {}
      }, false);
    } catch (err) {}
  },

  // Copy to clipboard
  async copyToClipboard(text) {
    try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (_) {}
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;top:-9999px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
    return true;
  },

  toast(msg) {
    try {
      const el = document.createElement('div');
      el.textContent = msg;
      el.style.cssText = 'position:fixed;left:50%;top:24px;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:8px 12px;border-radius:4px;font-size:13px;z-index:10000';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1500);
    } catch (_) {}
  },

  init() {
    try {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { this.injectModal(); this.insertCopyButton(); this.setupMessageHandler(); });
      } else { this.injectModal(); this.insertCopyButton(); this.setupMessageHandler(); }
    } catch (err) {}
  }
};
