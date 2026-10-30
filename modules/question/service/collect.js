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

  setupListener() { QuestionFrame.install(); },
  init() { this.setupListener(); }
};

FK.question.service.collect = QuestionCollector;
