const AIChatPrompt = {
  messages(config, request, history) { return AIApi.buildMessages(config, request, history); }
};
FK.ai.chat.prompt = AIChatPrompt;
