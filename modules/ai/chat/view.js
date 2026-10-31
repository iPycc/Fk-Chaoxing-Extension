const AIChatView = {
  type(type) { return ({ single_choice: '单选题', multiple_choice: '多选题', fill_blank: '填空题',
    short_answer: '简答题', programming: '程序题', sorting: '排序题', matching: '连线题' })[type] || type; }
};
FK.ai.chat.view = AIChatView;
