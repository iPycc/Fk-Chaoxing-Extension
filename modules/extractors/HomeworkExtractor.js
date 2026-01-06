// HomeworkExtractor - Extracts questions from homework pages
const HomeworkExtractor = {
  // Check if current page is supported
  canHandle(url) {
    return url.includes('/mycourse/studentstudy') || 
           url.includes('chaoxing.com') && !url.includes('/exam/');
  },

  // Main extraction method
  extract(doc = document) {
    const questions = [];
    
    // Helper to find title
    const getTitleFrom = (root) => {
      const node = root.querySelector('.Zy_TItle .fontLabel, .Zy_Title .fontLabel, .newZy_TItle .fontLabel, .newZy_Title .fontLabel')
        || root.querySelector('.Zy_TItle, .Zy_Title, .newZy_TItle, .newZy_Title');
      return (node?.textContent || '').replace(/\s+/g, ' ').trim();
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
          const text = (p?.textContent || '').replace(/\s+/g, ' ').trim();
          return `${String.fromCharCode(65 + idx)}. ${text}`;
        }).filter(Boolean);
        
        let type = options.length === 4 ? 'single' : options.length >= 5 ? 'multi' : 'other';
        questions.push({ title, options, type });
      });
    }
    
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
      const text = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) set.add(text);
    }));
    
    if (set.size === 0) {
      fallback.forEach(sel => doc.querySelectorAll(sel).forEach(n => {
        const text = (n.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) set.add(text);
      }));
    }
    
    return Array.from(set);
  }
};
