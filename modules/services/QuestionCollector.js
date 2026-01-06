// QuestionCollector - Orchestrates question collection
const QuestionCollector = {
  // Collection strategies
  extractors: [ExamExtractor, HomeworkExtractor],

  // Get appropriate extractor for current page
  getExtractor() {
    const url = window.location.href;
    return this.extractors.find(e => e.canHandle(url)) || HomeworkExtractor; // Default to homework
  },

  // Collect all titles (Public API)
  async collectAll() {
    const sections = await this.collectFromDocumentRecursive(document);
    return this.formatSections(sections);
  },

  // Recursive collection
  async collectFromDocumentRecursive(doc) {
    const sections = [];
    const header = this.findHeaderTitle(doc) || doc.title || '';
    
    // Extract from current document
    const extractor = this.getExtractor();
    const questions = extractor.extract(doc);
    
    if (questions.length) {
      sections.push({ header, questions });
    }

    // Process iframes
    const iframes = Array.from(doc.querySelectorAll('iframe'));
    for (const frame of iframes) {
      try {
        // Try accessing contentDocument (same-origin)
        const fdoc = frame.contentDocument;
        if (fdoc) {
          sections.push(...await this.collectFromDocumentRecursive(fdoc));
        } else {
          // Cross-origin fallback
          const res = await this.collectFromFrame(frame);
          if (res?.questions?.length) sections.push(res);
        }
      } catch (_) {
        // Access denied, use postMessage
        const res = await this.collectFromFrame(frame);
        if (res?.questions?.length) sections.push(res);
      }
    }
    
    return sections;
  },

  // Collect from cross-origin iframe using postMessage
  collectFromFrame(frame) {
    const id = Math.random().toString(36).slice(2);
    
    return new Promise(resolve => {
      const onMsg = e => {
        try {
          if (e.data?.type === 'CX_TITLES_RESPONSE' && e.data.id === id) {
            window.removeEventListener('message', onMsg);
            const questions = e.data.questions || [];
            resolve({ header: e.data.header || '', questions });
          }
        } catch (err) {}
      };
      
      window.addEventListener('message', onMsg);
      setTimeout(() => { 
        window.removeEventListener('message', onMsg); 
        resolve({ header: '', questions: [] }); 
      }, 3000);
      
      try { 
        frame.contentWindow?.postMessage({ type: 'CX_GET_TITLES', id }, '*'); 
      } catch (e) { 
        resolve({ header: '', questions: [] }); 
      }
    });
  },

  // Helper: Find header title
  findHeaderTitle(doc) {
    const h3 = doc.querySelector('.ceyan_name h3');
    if (h3?.textContent) return h3.textContent.trim();
    const testName = doc.querySelector('.newTestTitle .TestTitle_name');
    if (testName?.textContent) return testName.textContent.trim();
    const h2 = Array.from(doc.querySelectorAll('h2')).find(h => h.textContent?.includes('章节详情'));
    if (h2?.textContent) return h2.textContent.trim();
    return '';
  },

  // Format sections into text
  formatSections(sections) {
    const lines = [];
    sections.forEach(({ header, questions }) => {
      if (questions?.length) {
        if (header) { lines.push(`# ${header}`); lines.push(''); }
        questions.forEach((q, idx) => {
          lines.push(`${idx + 1}. ${q.title}`);
          if (Array.isArray(q.options) && q.options.length) {
            q.options.forEach(opt => lines.push(opt));
          }
          lines.push('');
        });
      }
    });
    return lines.join('\n');
  },

  // Setup message listener for iframes (to respond to requests)
  setupListener() {
    window.addEventListener('message', async e => {
      if (e.data?.type !== 'CX_GET_TITLES' || !e.data.id) return;
      
      // Security check
      // if (!/chaoxing\.com$/.test(new URL(e.origin).hostname || '')) return;

      const extractor = this.getExtractor();
      const questions = extractor.extract(document);
      
      e.source?.postMessage({
        type: 'CX_TITLES_RESPONSE',
        id: e.data.id,
        questions: questions,
        header: this.findHeaderTitle(document) || document.title || ''
      }, e.origin);
    });
  },

  init() {
    this.setupListener();
    // GlobalLogger.info('QuestionCollector initialized');
  }
};
