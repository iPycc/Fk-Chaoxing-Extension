// ExamExtractor - 考试题目提取器
const ExamExtractor = {
  
  // 检查是否是考试页面
  isExamPage() {
    return window.location.href.includes('/exam-ans/mooc2/exam/preview');
  },

  // 提取所有考试题目
  extractExamQuestions(doc = document) {
    const questions = [];
    
    // 查找所有题目容器
    const questionContainers = doc.querySelectorAll('.singleQuesId[id^="sigleQuestionDiv_"]');
    
    questionContainers.forEach((container, index) => {
      const questionId = container.getAttribute('data') || container.id.replace('sigleQuestionDiv_', '');
      const question = this.parseQuestionContainer(container, questionId, index + 1);
      
      if (question) {
        questions.push(question);
      }
    });
    
    return questions;
  },

  // 解析单个题目容器
  parseQuestionContainer(container, questionId, index) {
    // 提取题目标题
    const titleElement = container.querySelector('h3.mark_name.colorDeep');
    if (!titleElement) return null;
    
    const title = this.extractTitle(titleElement);
    const typeText = this.extractTypeText(titleElement);
    
    // 提取选项
    const options = this.extractOptions(container, questionId);
    
    // 判断题型
    let type = 'essay'; // 默认简答题
    if (options.length > 0) {
      type = options.length <= 4 ? 'single' : 'multiple';
    }
    
    return {
      id: questionId,
      index: index,
      title: title,
      typeText: typeText,
      type: type,
      options: options,
      element: container
    };
  },

  // 提取题目标题
  extractTitle(titleElement) {
    // 查找题目内容 div
    const contentDiv = titleElement.querySelector('div[style*="overflow"]');
    if (contentDiv) {
      return contentDiv.textContent.replace(/\s+/g, ' ').trim();
    }
    
    // 备用：直接从 h3 提取，排除题号和题型
    const fullText = titleElement.textContent;
    const match = fullText.match(/\d+\.\s*\([^)]+\)\s*(.+)/);
    return match ? match[1].trim() : fullText.replace(/\s+/g, ' ').trim();
  },

  // 提取题型文本
  extractTypeText(titleElement) {
    const typeSpan = titleElement.querySelector('.colorShallow');
    if (typeSpan) {
      const text = typeSpan.textContent.trim();
      const match = text.match(/\(([^,]+),/);
      return match ? match[1] : '未知题型';
    }
    return '未知题型';
  },

  // 提取选项
  extractOptions(container, questionId) {
    const options = [];
    const optionElements = container.querySelectorAll('.stem_answer .answerBg');
    
    optionElements.forEach((optionEl) => {
      const optionSpan = optionEl.querySelector('.num_option');
      const answerDiv = optionEl.querySelector('.answer_p');
      
      if (optionSpan && answerDiv) {
        const letter = optionSpan.textContent.trim();
        const content = answerDiv.textContent.trim();
        options.push(`${letter}. ${content}`);
      }
    });
    
    return options;
  },

  // 格式化题目为文本（用于 AI）
  formatQuestionForAI(question) {
    let text = `【题目${question.index}】(${question.typeText}) ${question.title}\n`;
    
    if (question.options.length > 0) {
      question.options.forEach(opt => {
        text += `${opt}\n`;
      });
    }
    
    return text;
  },

  // 批量格式化题目
  formatQuestionsForAI(questions) {
    return questions.map(q => this.formatQuestionForAI(q)).join('\n');
  }
};
