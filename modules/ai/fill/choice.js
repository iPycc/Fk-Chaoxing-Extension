const AIFillChoice = {
  expected(question, answer) {
    const values = question.type === 'multiple_choice' ? answer.answers : [answer.answer];
    return [...new Set((values || []).map(value => String(value || '').trim().toUpperCase()).filter(Boolean))].sort();
  },
  actual(question) { return AIAnswerCore.selectedChoiceLetters(question); }
};
FK.ai.fill.choice = AIFillChoice;
