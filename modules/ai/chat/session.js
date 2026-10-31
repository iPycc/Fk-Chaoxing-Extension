const AIChatSession = {
  migrate(saved) {
    if (saved && !Array.isArray(saved) && saved.version === 2) return saved;
    return { version: 2, history: [], contextQuestions: [], lastReferenceKeys: [], discussionMode: false };
  }
};
FK.ai.chat.session = AIChatSession;
