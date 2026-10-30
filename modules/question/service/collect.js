// QuestionCollector - Orchestrates question collection
const LegacyQuestionCollector = {
  // Collection strategies
  extractors: [ExamExtractor, HomeworkExtractor],

  // Get appropriate extractor for current page
  getExtractor(doc = document) {
    const url = doc.location?.href || doc.defaultView?.location?.href || window.location.href;
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
    const extractor = this.getExtractor(doc);
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
    const workTitle = doc.querySelector('h2.mark_title');
    if (workTitle?.textContent) return workTitle.textContent.trim();
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
          if (q.type === 'matching' && q.matchingGroups) {
            lines.push('第1组：');
            q.matchingGroups.left.forEach(item => lines.push(`${item.id}. ${item.text}`));
            lines.push('第2组：');
            q.matchingGroups.right.forEach(item => lines.push(`${item.id}. ${item.text}`));
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

      const extractor = this.getExtractor(document);
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


// Unified question collection service.
const QuestionCollector = {
  extractors: [ExamExtractor, HomeworkExtractor],
  snapshot: null,
  live: [],
  pending: null,
  token: Math.random().toString(36).slice(2),

  getExtractor(doc = document) {
    let url = '';
    try { url = doc.location?.href || doc.defaultView?.location?.href || ''; } catch (_) { /* Cross-origin. */ }
    return this.extractors.find(extractor => extractor.canHandle(url)) || HomeworkExtractor;
  },

  findHeaderTitle(doc) {
    for (const selector of ['h2.mark_title', '.ceyan_name h3', '.newTestTitle .TestTitle_name']) {
      const text = doc.querySelector(selector)?.textContent?.trim();
      if (text) return text;
    }
    const heading = Array.from(doc.querySelectorAll('h1, h2')).find(node =>
      /章节详情|章节测验|作业|考试/.test(node.textContent || ''));
    return heading?.textContent?.trim() || '';
  },

  local(doc, parser) {
    const header = this.findHeaderTitle(doc) || doc.title || '';
    const questions = parser
      ? QuestionContainers.find(doc).map(container => parser(container, doc, header)).filter(Boolean)
      : this.getExtractor(doc).extract(doc);
    return questions.length ? [{ header, questions }] : [];
  },

  async collectOnce(rootDoc = document, { parser, remote = false } = {}) {
    const { docs, frames } = QuestionTree.walk(rootDoc);
    const sections = docs.flatMap(doc => this.local(doc, parser));
    let pendingFrames = remote ? frames.length : 0;
    let remoteLoading = 0, remoteEncrypted = 0, remoteIncomplete = 0;
    if (!remote) {
      const responses = await Promise.all(frames.map(frame => QuestionFrame.scan(frame, this.token)));
      for (const response of responses) {
        sections.push(...response.sections); pendingFrames += response.pending;
        remoteLoading += response.loadingFrames || 0; remoteEncrypted += response.encryptedNodes || 0;
        remoteIncomplete += response.incompleteQuestions || 0;
      }
    }
    const seen = new Set();
    let incompleteQuestions = 0;
    sections.forEach(section => {
      section.questions = (section.questions || []).filter((question, ordinal) => {
        question.questionKey = QuestionKey.from(question, { header: section.header,
          doc: question.docRef || rootDoc, ordinal });
        if (!question.title || !question.type) incompleteQuestions++;
        if (seen.has(question.questionKey)) return false;
        seen.add(question.questionKey);
        return true;
      });
    });
    return {
      sections: sections.filter(section => section.questions.length), pendingFrames,
      loadingFrames: QuestionTree.loading(rootDoc) + remoteLoading,
      encryptedNodes: docs.reduce((sum, doc) => sum + doc.querySelectorAll('.font-cxsecret').length, 0) + remoteEncrypted,
      incompleteQuestions: incompleteQuestions + remoteIncomplete
    };
  },

  async collectForExtraction() {
    const sections = await LegacyQuestionCollector.collectFromDocumentRecursive(document);
    const count = sections.reduce((total, section) => total + (section.questions?.length || 0), 0);
    return { sections, count, content: LegacyQuestionCollector.formatSections(sections) };
  },

  async collectStable({ parser, maxMs } = {}) {
    if (this.pending) return this.pending;
    this.pending = this.runStable({ parser, maxMs }).finally(() => { this.pending = null; });
    return this.pending;
  },

  async runStable({ parser, maxMs } = {}) {
    parser ||= typeof AIAnswerCore !== 'undefined'
      ? (container, doc, header) => AIAnswerCore.parseQuestionContainer(container, doc, header) : null;
    if (typeof CopyEnabler !== 'undefined') await CopyEnabler.ready().catch(() => {});
    const result = await QuestionStable.wait(() => this.collectOnce(document, { parser }), document, { maxMs });
    const live = result.sections.flatMap(section => section.questions);
    const snapshot = QuestionSnapshot.create(live, { status: result.status });
    result.snapshot = snapshot;
    result.diagnostics = QuestionReport.create(result);
    if (result.status === 'stable') { this.snapshot = snapshot; this.live = live; }
    return result;
  },

  async collectLive() {
    return this.collectStable();
  },

  async collectAll() {
    const result = await this.collectStable();
    if (result.status !== 'stable') throw new Error(QuestionReport.message(result.diagnostics));
    return this.formatSections(result.sections);
  },

  async collectFromDocumentRecursive(doc) {
    const result = doc === document ? await this.collectStable() : await this.collectOnce(doc);
    return result.sections;
  },

  formatSections(sections) {
    const lines = [];
    sections.forEach(({ header, questions }) => {
      if (!questions?.length) return;
      if (header) lines.push(`# ${header}`, '');
      let previousParent = null;
      questions.forEach((question, index) => {
        const parent = question.parentId ? `${question.parentId}\n${question.parentTitle}` : null;
        if (question.parentTitle && parent !== previousParent) lines.push(`## 大题：${question.parentTitle}`, '');
        previousParent = parent;
        lines.push(`${index + 1}. ${question.subquestionNumber ? `（子题 ${question.subquestionNumber}）` : ''}${question.title}`);
        (question.options || []).forEach(option => lines.push(option));
        if (question.type === 'matching' && question.matchingGroups) {
          lines.push('第1组：', ...question.matchingGroups.left.map(item => `${item.id}. ${item.text}`),
            '第2组：', ...question.matchingGroups.right.map(item => `${item.id}. ${item.text}`));
        }
        lines.push('');
      });
    });
    return lines.join('\n');
  },

  setupListener() { QuestionFrame.install(); LegacyQuestionCollector.init(); },
  init() { this.setupListener(); }
};

FK.question.service.collect = QuestionCollector;
