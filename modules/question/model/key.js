const QuestionKey = {
  text(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); },
  hash(value) {
    let hash = 2166136261;
    for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  },
  framePath(doc = document) {
    const parts = [];
    let view = doc.defaultView;
    while (view && view !== view.top) {
      try {
        const parent = view.parent;
        const frames = Array.from(parent.document.querySelectorAll('iframe'));
        parts.unshift(String(Math.max(0, frames.indexOf(view.frameElement))));
        view = parent;
      } catch (_) { parts.unshift('x'); break; }
    }
    return parts.join('.') || 'top';
  },
  from(question = {}, context = {}) {
    if (question.questionKey) return question.questionKey;
    const container = question.container;
    const platformId = question.subquestionId || question.itemId ||
      container?.getAttribute?.('itemid') || container?.getAttribute?.('data') ||
      container?.getAttribute?.('qid') || container?.id || '';
    const frame = context.framePath || this.framePath(question.docRef || context.doc || document);
    if (platformId) return `${frame}:${platformId}`;
    const source = [frame, context.header || question.sectionHeader || '', question.parentTitle || '',
      question.title || '', JSON.stringify(question.options || []), context.ordinal ?? question.index ?? ''].join('\n');
    return `${frame}:h${this.hash(source)}`;
  }
};
FK.question.model.key = QuestionKey;
