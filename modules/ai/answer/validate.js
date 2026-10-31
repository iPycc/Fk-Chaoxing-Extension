const AIAnswerValidate = {
  entries(payload, questions, { complete = true } = {}) {
    if (!payload || payload.version !== 1) throw this.error('结构化答案版本无效');
    if (payload.related === false) {
      if (complete) throw this.error('AI 未返回当前题目的答案');
      if (payload.answers !== undefined && (!Array.isArray(payload.answers) || payload.answers.length)) {
        throw this.error('答案与关联标记冲突');
      }
      return [];
    }
    if (!Array.isArray(payload.answers)) throw this.error('结构化答案缺少 answers');
    const indices = payload.answers.map(item => Number(item?.questionIndex));
    if (new Set(indices).size !== indices.length || indices.some(index => !Number.isInteger(index) || index < 1 || index > questions.length)) {
      throw this.error('结构化答案题号越界或重复');
    }
    if (complete && payload.answers.length !== questions.length) throw this.error('结构化答案未覆盖全部题目');
    return payload.answers.map(entry => {
      const index = Number(entry.questionIndex) - 1;
      const question = questions[index];
      if (entry.questionKey !== question.questionKey) throw this.error(`第 ${index + 1} 题的题目键不匹配`);
      if (entry.type !== question.type) throw this.error(`第 ${index + 1} 题的题型不匹配`);
      const answer = AIApi.normalizeAnswerEntry(entry, question, index);
      const invalid = AIApi.validateAnswer(answer, question);
      if (invalid) throw this.error(`第 ${index + 1} 题答案无效：${invalid}`);
      return { index, questionKey: question.questionKey, answer };
    });
  },
  error(message) { return Object.assign(new Error(message), { retryable: true }); }
};
FK.ai.answer.validate = AIAnswerValidate;
