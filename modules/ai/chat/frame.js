const AIChatFrame = {
  allowed(origin) { return QuestionFrame.allowed(origin); },
  same(event, target) { return event.source === target && this.allowed(event.origin); }
};
FK.ai.chat.frame = AIChatFrame;
