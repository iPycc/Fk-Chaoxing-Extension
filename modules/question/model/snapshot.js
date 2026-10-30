const QuestionSnapshot = {
  version: 1,
  transient: new Set(['container', 'docRef', 'fillTargets', 'shortAnswerTargets', 'programTarget', 'choiceTargets']),
  question(question, context = {}) {
    const plain = {};
    for (const [key, value] of Object.entries(question || {})) {
      if (this.transient.has(key) || typeof value === 'function') continue;
      try { plain[key] = structuredClone(value); }
      catch (_) { try { plain[key] = JSON.parse(JSON.stringify(value)); } catch (_) { /* DOM value. */ } }
    }
    plain.questionKey = QuestionKey.from(question, context);
    return plain;
  },
  create(questions, meta = {}) {
    const createdAt = Date.now();
    const items = questions.map((question, index) => ({ ...this.question(question, { ...meta, ordinal: index }), index: index + 1 }));
    const digest = QuestionKey.hash(JSON.stringify(items.map(item => [item.questionKey, item.type, item.title,
      item.options, item.blankCount, item.existingAnswer])));
    return Object.freeze({ version: this.version, id: `${createdAt.toString(36)}-${digest}`,
      revision: digest, createdAt, items: Object.freeze(items), ...meta });
  },
  same(left, right) {
    return Boolean(left && right && left.questionKey === right.questionKey && left.type === right.type &&
      left.title === right.title && JSON.stringify(left.options || []) === JSON.stringify(right.options || []) &&
      JSON.stringify(left.matchingGroups || null) === JSON.stringify(right.matchingGroups || null) &&
      JSON.stringify(left.existingAnswer ?? null) === JSON.stringify(right.existingAnswer ?? null));
  }
};
FK.question.model.snapshot = QuestionSnapshot;
