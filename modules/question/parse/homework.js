// Homework-page parser.
const HomeworkExtractor = {
  // Check if current page is supported
  canHandle(url) {
    return url.includes('/mycourse/studentstudy') || 
           url.includes('/mooc-ans/mooc2/work/dowork') ||
           url.includes('/work/dowork') ||
           (url.includes('chaoxing.com') && !url.includes('/exam/'));
  },

  normalizeText(value = '') {
    return value.replace(/\s+/g, ' ').trim();
  },

  getTypeLabel(container) {
    const rawType = this.normalizeText(
      QuestionContainers.typeLabel(container)
    ).replace(/[()（）]/g, '');

    return rawType ? `(${rawType})` : '';
  },

  detectType(container, options = []) {
    const dropdownType = DropdownQuestions.detectType(container);
    if (dropdownType) return dropdownType;
    const rawType = this.getTypeLabel(container);

    if (rawType.includes('填空')) return 'fill_blank';
    if (rawType.includes('简答')) return 'short_answer';
    if (rawType.includes('多选')) return 'multi';
    if (rawType.includes('单选') || rawType.includes('判断')) return 'single';
    if (options.length === 4) return 'single';
    if (options.length >= 5) return 'multi';
    return 'other';
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

  parseModernQuestion(container) {
    const details = QuestionContainers.describe(container);
    if (!details.title) return null;
    const dropdown = DropdownQuestions.extract(container);
    const options = dropdown?.options || QuestionContainers.options(container);
    return { ...details, options, type: this.detectType(container, options), ...(dropdown || {}) };
  },

  extract(doc = document) {
    const questions = QuestionContainers.find(doc).map(box => this.parseModernQuestion(box)).filter(Boolean);
    if (!questions.length) {
      this.extractTitlesFallback(doc).forEach(title => questions.push({ title, options: [], type: 'other' }));
    }
    return questions;
  },

  // Legacy fallback
  extractTitlesFallback(doc) {
    const primary = ['.Zy_TItle .fontLabel', '.Zy_Title .fontLabel', '.newZy_TItle .fontLabel', '.newZy_Title .fontLabel'];
    const fallback = ['.Zy_TItle', '.Zy_Title', '.newZy_TItle', '.newZy_Title'];
    const set = new Set();
    
    primary.forEach(sel => doc.querySelectorAll(sel).forEach(n => {
      const text = this.normalizeText(n.textContent || '');
      if (text) set.add(text);
    }));
    
    if (set.size === 0) {
      fallback.forEach(sel => doc.querySelectorAll(sel).forEach(n => {
        const text = this.normalizeText(n.textContent || '');
        if (text) set.add(text);
      }));
    }
    
    return Array.from(set);
  }
};
