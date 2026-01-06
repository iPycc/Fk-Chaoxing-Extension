// AI 答题助手核心逻辑
const AIAnswerCore = {
  isProcessing: false,

  // 处理所有题目
  async processAllQuestions() {
    if (this.isProcessing) {
      AINotify.warning('正在处理中，请稍候...');
      return;
    }

    const btn = document.getElementById('ai-get-answers-btn');
    
    try {
      this.isProcessing = true;
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ 处理中...';
      }
      
      AINotify.clear();
      AINotify.show();
      AINotify.info('开始获取题目...');
      GlobalLogger.info('AI 开始分析题目...');

      // 获取所有题目
      const questions = await this.collectQuestions();
      
      if (questions.length === 0) {
        AINotify.error('未找到任何题目');
        GlobalLogger.error('AI未找到题目');
        return;
      }
      
      AINotify.success(`找到 ${questions.length} 道题目`);
      // GlobalLogger.success(`AI 找到 ${questions.length} 道题目`);
      AINotify.info('正在发送到 AI 分析...');

      // 调用 AI API
      const responseText = await AIApi.getAnswers(questions);
      AINotify.success('AI 返回答案成功');
      
      // 解析答案
      const answers = AIApi.parseAnswers(responseText, questions.length);
      AINotify.info('答案解析完成');

      // 显示答案到通知面板
      this.displayAnswers(questions, answers);
      
      AINotify.success(`✅ 完成！已获取 ${answers.length} 道题目的答案`);
      GlobalLogger.success(`AI 答题完成，共获取 ${answers.length} 个答案`);

    } catch (err) {
      console.error('[AI] 处理失败:', err);
      AINotify.error(`处理失败: ${err.message}`);
      GlobalLogger.error(`AI 处理失败`, err.message);
    } finally {
      this.isProcessing = false;
      // if (btn) {
      //   btn.disabled = false;
      //   btn.textContent = '🤖 AI答题';
      // }
    }
  },

  // 收集所有题目
  async collectQuestions() {
    // 使用 QuestionCollector 收集题目
    const allQuestions = [];
    const sections = await QuestionCollector.collectFromDocumentRecursive(document);
    
    sections.forEach(section => {
      if (section.questions && section.questions.length > 0) {
        section.questions.forEach(q => {
          allQuestions.push({
            title: q.title,
            options: q.options || [],
            type: q.type || 'other',
            sectionHeader: section.header
          });
        });
      }
    });

    return allQuestions;
  },

  // 显示答案到通知面板
  displayAnswers(questions, answers) {
    questions.forEach((q, idx) => {
      const answer = answers[idx] || '未获取到答案';
      const shortTitle = q.title.length > 30 ? q.title.substring(0, 30) + '...' : q.title;
      AINotify.info(`<b>题目${idx + 1}:</b> ${shortTitle}<br><b>答案:</b> ${answer}`);
    });
  }
};
