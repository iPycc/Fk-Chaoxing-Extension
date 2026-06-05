// HomeworkExtractor - Extracts questions from homework pages
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
      container.getAttribute('typename') ||
      container.querySelector('h3 .colorShallow')?.textContent ||
      ''
    ).replace(/[()（）]/g, '');

    return rawType ? `(${rawType})` : '';
  },

  detectType(container, options = []) {
    const rawType = this.getTypeLabel(container);

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
    const titleEl = container.querySelector('h3.mark_name, h3');
    const typeLabel = this.getTypeLabel(container);
    const stem = this.normalizeText(titleEl?.textContent || '')
      .replace(/^\d+\.\s*/, '')
      .replace(/^\((?:单选题|多选题|判断题|填空题|简答题)\)\s*/, '');
    const title = this.normalizeText(`${typeLabel} ${stem}`);

    if (!title) return null;

    const options = this.sortOptions(Array.from(container.querySelectorAll('.stem_answer .answerBg')).map((el, idx) => {
      const letter = this.getOptionLetter(idx);
      const content = this.normalizeText(el.querySelector('.answer_p')?.textContent || el.textContent || '');
      return letter && content ? `${letter}. ${content}` : '';
    }).filter(Boolean));

    return {
      title,
      options,
      type: this.detectType(container, options)
    };
  },

  // Main extraction method
  extract(doc = document) {
    const questions = [];
    
    // Helper to find title
    const getTitleFrom = (root) => {
      const node = root.querySelector('.Zy_TItle .fontLabel, .Zy_Title .fontLabel, .newZy_TItle .fontLabel, .newZy_Title .fontLabel')
        || root.querySelector('.Zy_TItle, .Zy_Title, .newZy_TItle, .newZy_Title');
      return this.normalizeText(node?.textContent || '');
    };
    
    const containers = Array.from(doc.querySelectorAll('.TiMu'));
    if (containers.length > 0) {
      containers.forEach(box => {
        const title = getTitleFrom(box);
        if (!title) return;
        
        const ul = box.querySelector('ul.Zy_ulTop.w-top.fl');
        const lis = ul ? Array.from(ul.querySelectorAll(':scope > li')) : [];
        
        const options = lis.map((li, idx) => {
          const p = li.querySelector('p') || li.querySelector('a') || li;
          const text = this.normalizeText(p?.textContent || '');
          return `${String.fromCharCode(65 + idx)}. ${text}`;
        }).filter(Boolean);
        
        questions.push({ title, options: this.sortOptions(options), type: this.detectType(box, options) });
      });
    }

    const modernContainers = Array.from(doc.querySelectorAll(
      '.questionLi.singleQuesId, .singleQuesId[id^="question"], .singleQuesId[typename]'
    ));
    modernContainers.forEach(container => {
      const question = this.parseModernQuestion(container);
      if (question) questions.push(question);
    });
    
    // Fallback if no containers found
    if (questions.length === 0) {
      this.extractTitlesFallback(doc).forEach(t => questions.push({ title: t, options: [], type: 'other' }));
    }
    
    return questions;
  },

  // Legacy fallback
  extractTitlesFallback(doc) {
    const primary = ['.Zy_TItle .fontLabel', '.Zy_Title .fontLabel', '.newZy_TItle .fontLabel', '.newZy_Title .fontLabel',
      '.TiMu .Zy_TItle .fontLabel', '.TiMu .Zy_Title .fontLabel'];
    const fallback = ['.Zy_TItle', '.Zy_Title', '.newZy_TItle', '.newZy_Title', '.TiMu .Zy_TItle', '.TiMu .Zy_Title'];
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
