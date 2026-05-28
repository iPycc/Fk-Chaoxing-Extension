// ExamExtractor - Extracts questions from exam pages
const ExamExtractor = {
  // Check if current page is supported
  canHandle(url) {
    return url.includes('/exam-ans/mooc2/exam/preview');
  },

  normalizeText(value = '') {
    return value.replace(/\s+/g, ' ').trim();
  },

  getTypeLabel(container) {
    const rawType = this.normalizeText(
      container.getAttribute('typename') ||
      container.querySelector('h3 .colorShallow')?.textContent ||
      ''
    ).replace(/[()（）]/g, '');

    return rawType ? `(${rawType})` : '';
  },

  sortOptions(options = []) {
    return [...options].sort((a, b) => {
      const left = a.match(/^([A-Z])/i)?.[1] || '';
      const right = b.match(/^([A-Z])/i)?.[1] || '';
      return left.localeCompare(right);
    });
  },

  getOptionLetter(index) {
    return String.fromCharCode(65 + index);
  },

  // Main extraction method
  extract(doc = document) {
    const questions = [];
    
    // Find all question containers
    const containers = doc.querySelectorAll(
      '.singleQuesId[id^="sigleQuestionDiv_"], .singleQuesId[id^="question"], .singleQuesId[typename]'
    );
    
    containers.forEach(container => {
      const question = this.parseExamQuestion(container);
      if (question) questions.push(question);
    });
    
    return questions;
  },
  
  // Parse a single exam question
  parseExamQuestion(container) {
    // Extract title
    const titleEl = container.querySelector('h3.mark_name.colorDeep');
    const stem = this.extractTitle(titleEl);
    const typeLabel = this.getTypeLabel(container);
    const title = this.normalizeText(`${typeLabel} ${stem}`);
    
    // Extract options
    const options = this.extractOptions(container);
    
    // Determine question type based on number of options
    const type = options.length === 0 ? 'other' : 
                 options.length <= 4 ? 'single' : 'multi';
    
    return { title, options, type };
  },
  
  // Extract exam question title
  extractTitle(titleEl) {
    // Extract content from div with overflow style
    const contentDiv = titleEl?.querySelector('div[style*="overflow"]');
    if (contentDiv) {
      return this.normalizeText(contentDiv.textContent);
    }
    return this.normalizeText(titleEl?.textContent || '')
      .trim()
      .replace(/^\d+\.\s*/, '')
      .replace(/^\((?:单选题|多选题|判断题|填空题|简答题)\)\s*/, '');
  },
  
  // Extract exam question options
  extractOptions(container) {
    const options = [];
    const optionEls = container.querySelectorAll('.stem_answer .answerBg');
    
    optionEls.forEach((el, idx) => {
      const letter = this.getOptionLetter(idx);
      const content = this.normalizeText(el.querySelector('.answer_p')?.textContent || el.textContent || '');
      if (letter && content) {
        options.push(`${letter}. ${content}`);
      }
    });
    
    return this.sortOptions(options);
  }
};
