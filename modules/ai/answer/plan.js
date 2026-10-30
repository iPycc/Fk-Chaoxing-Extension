const AIAnswerPlan = {
  split(request, batchSize, key = question => question.questionKey || `${question.index}:${question.id}`) {
    const questions = request.mode === 'answer' ? request.target : request.context;
    if (!questions.length) return [{ ...request, context: [], target: [] }];
    const targetKeys = new Set((request.target || []).map(key));
    const extra = (request.context || []).filter(question => !targetKeys.has(key(question)));
    const batches = [];
    for (let offset = 0; offset < questions.length; offset += batchSize) {
      const batch = questions.slice(offset, offset + batchSize);
      const keys = new Set(batch.map(key));
      const targets = request.mode === 'answer' ? (request.target || []).filter(question => keys.has(key(question))) : [];
      const context = request.mode === 'answer'
        ? [...batch, ...extra.slice(0, Math.max(0, batchSize - batch.length))].sort((a, b) => a.index - b.index)
        : batch;
      batches.push({ ...request, context, target: targets, protocolToken: AIAnswerEnvelope.token() });
    }
    return batches;
  },
  questions(request) { return request.mode === 'answer' ? request.target : request.context; }
};
FK.ai.answer.plan = AIAnswerPlan;
