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
  extract(doc = document, withContainers = false) {
    const questions = [];

    // Find all question containers
    const containers = doc.querySelectorAll(
      '.singleQuesId[id^="sigleQuestionDiv_"], .singleQuesId[id^="question"], .singleQuesId[typename]'
    );

    containers.forEach(container => {
      // Reading comprehension packs several .reading_answer children into one
      // question; treating it as one 20-option multiple choice makes it
      // impossible for the model to answer, so nothing gets written.
      const subItems = Array.from(container.querySelectorAll('.reading_answer'));
      if (subItems.length) {
        subItems.forEach(sub => {
          const question = this.parseExamQuestion(sub, container);
          if (question) questions.push(withContainers ? { ...question, container: sub, docRef: doc } : question);
        });
        return;
      }
      const question = this.parseExamQuestion(container);
      if (question) questions.push(withContainers ? { ...question, container, docRef: doc } : question);
    });

    return questions;
  },

  // Parse a single exam question
  parseExamQuestion(container, parent) {
    // Extract title
    const titleEl = container.querySelector('h3.mark_name.colorDeep');
    const stem = this.extractTitle(titleEl || container.querySelector('.reader_answer_tit'), container);
    const typeLabel = this.getTypeLabel(container);
    const title = QuestionContainers.withImageLinks(this.normalizeText(`${typeLabel} ${stem}`), QuestionContainers.stemRoot(container));

    const dropdown = DropdownQuestions.extract(container);
    if (dropdown) return { title, ...dropdown };

    // Extract options
    const options = this.extractOptions(container);

    // Determine question type based on number of options
    const type = options.length === 0 ? 'other' :
                 options.length <= 4 ? 'single' : 'multi';

    return { title, options, type };
  },

  // Extract exam question title
  extractTitle(titleEl, container) {
    // Extract content from div with overflow style
    const contentDiv = titleEl?.querySelector('div[style*="overflow"]');
    if (contentDiv) {
      return this.normalizeText(contentDiv.textContent);
    }
    let text = this.normalizeText(titleEl?.textContent || '');
    if (!text && container) text = this.normalizeText(QuestionContainers.text(QuestionContainers.stemRoot(container)));
    return text
      .trim()
      .replace(/^\d+\.\s*/, '')
      .replace(/^\(\d+\)\s*/, '')
      .replace(/^\((?:单选题|多选题|判断题|填空题|简答题|排序题|连线题|翻译题（单选）)\)\s*/, '');
  },

  // Extract exam question options
  extractOptions(container) {
    const options = [];
    const optionEls = container.querySelectorAll('.stem_answer .answerBg');

    optionEls.forEach((el, idx) => {
      const letter = this.getOptionLetter(idx);
      const content = QuestionContainers.withImageLinks(this.normalizeText(el.querySelector('.answer_p')?.textContent || el.textContent || ''), el);
      if (letter && content) {
        options.push(`${letter}. ${content}`);
      }
    });

    // Reading sub-question options are .stem_answer .hoverDiv, not .answerBg
    if (!options.length) return this.sortOptions(QuestionContainers.options(container));
    return this.sortOptions(options);
  }
};
