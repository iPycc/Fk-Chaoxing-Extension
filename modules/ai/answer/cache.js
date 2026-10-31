const AIAnswerCache = {
  snapshots: new Map(),
  put(snapshotId, question, answer) {
    if (!snapshotId || !question?.questionKey) return;
    if (!this.snapshots.has(snapshotId)) this.snapshots.set(snapshotId, new Map());
    this.snapshots.get(snapshotId).set(question.questionKey, { questionKey: question.questionKey, answer,
      type: question.type, title: question.title, savedAt: Date.now() });
    while (this.snapshots.size > 3) this.snapshots.delete(this.snapshots.keys().next().value);
  },
  get(snapshotId, questions = []) {
    const cache = this.snapshots.get(snapshotId);
    if (!cache) return [];
    return questions.flatMap((question, index) => {
      const item = cache.get(question.questionKey);
      return item && item.type === question.type && item.title === question.title ? [{ index, answer: item.answer }] : [];
    });
  },
  count(snapshotId) { return this.snapshots.get(snapshotId)?.size || 0; },
  clear(snapshotId) { if (snapshotId) this.snapshots.delete(snapshotId); else this.snapshots.clear(); }
};
FK.ai.answer.cache = AIAnswerCache;
