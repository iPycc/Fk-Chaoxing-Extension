const AIFillEditor = {
  expected(question, answer) {
    return question.type === 'fill_blank' ? answer.answers : answer.answer;
  },
  actual(question) { return AIFillVerify.current(question); },
  text(value) {
    const source = String(value ?? '');
    if (!/<[a-z][\s\S]*>/i.test(source)) return source.replace(/\s+/g, ' ').trim();
    const doc = new DOMParser().parseFromString(source, 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  },
  matches(target, expected) {
    return this.text(AIAnswerCore.readExistingEditor(target)) === this.text(expected);
  }
};
FK.ai.fill.editor = AIFillEditor;
