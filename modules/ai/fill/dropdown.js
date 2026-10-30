const AIFillDropdown = {
  validate(question, answer) { return DropdownQuestions.validateAnswer(question, answer); },
  actual(question) { return AIFillVerify.current(question); }
};
FK.ai.fill.dropdown = AIFillDropdown;
