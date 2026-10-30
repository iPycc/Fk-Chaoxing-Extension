const AIChatSession = {
  migrate(saved) {
    if (!saved) return { version: 2, history: [] };
    if (!Array.isArray(saved) && saved.version === 2) return saved;
    const history = (Array.isArray(saved) ? saved : saved.history || [])
      .filter(item => item?.mode !== 'extract' && item?.request?.mode !== 'extract')
      .map(item => {
        const { request, protocolState, questionKeys, answerKeys, ...visible } = item;
        return visible;
      });
    return { version: 2, history, contextQuestions: [], lastReferenceKeys: [], discussionMode: false };
  }
};
FK.ai.chat.session = AIChatSession;
