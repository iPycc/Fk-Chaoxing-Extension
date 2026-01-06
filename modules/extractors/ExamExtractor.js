// ExamExtractor - Extracts questions from exam pages
const ExamExtractor = {
  // Check if current page is supported
  canHandle(url) {
    return url.includes('/exam-ans/mooc2/exam/preview');
  },

  // Main extraction method
  extract(doc = document) {
    const questions = [];
    
    // Find all question containers
    const containers = doc.querySelectorAll('.singleQuesId[id^="sigleQuestionDiv_"]');
    
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
    const title = this.extractTitle(titleEl);
    
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
      return contentDiv.textContent.replace(/\s+/g, ' ').trim();
    }
    return '';
  },
  
  // Extract exam question options
  extractOptions(container) {
    const options = [];
    const optionEls = container.querySelectorAll('.stem_answer .answerBg');
    
    optionEls.forEach(el => {
      const letter = el.querySelector('.num_option')?.textContent.trim();
      const content = el.querySelector('.answer_p')?.textContent.trim();
      if (letter && content) {
        options.push(`${letter}. ${content}`);
      }
    });
    
    return options;
  }
};
