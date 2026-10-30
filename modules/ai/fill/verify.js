const AIFillVerify = {
  result(ok, status, expected, actual, rolledBack = false) {
    return { ok: Boolean(ok), status: status || (ok ? 'written' : 'verification_failed'), expected, actual, rolledBack };
  },
  current(question) {
    return question?.type === 'programming' ? AIAnswerCore.readProgramContent(question.programTarget)
      : AIAnswerCore.parseQuestionContainer(question.container, question.docRef, question.sectionHeader)?.existingAnswer;
  },
  async restore(question, previous) {
    try {
      if (question.type === 'single_choice' || question.type === 'multiple_choice') {
        AIAnswerCore.syncChoiceTargets(question, Array.isArray(previous) ? previous : []);
        return true;
      }
      if (question.type === 'fill_blank' && Array.isArray(previous) && previous.length === question.fillTargets.length) {
        return question.fillTargets.every((target, index) => AIAnswerCore.writeEditorContent(target, previous[index] || ''));
      }
      if (question.type === 'short_answer') return AIAnswerCore.writeEditorContent(question.shortAnswerTargets[0], previous?.[0] || '');
      if (question.type === 'programming') return AIAnswerCore.writeProgramContent(question.programTarget, previous || '');
    } catch (_) { /* Best-effort rollback. */ }
    return false;
  }
};
FK.ai.fill.verify = AIFillVerify;
