const AIFillExam = {
  status(question) { return question?.exam ? 'saved' : 'written'; }
};
FK.ai.fill.exam = AIFillExam;
