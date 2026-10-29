// Select actual questions before any extractor reads titles or answer controls.
const QuestionContainers = {
  find(doc = document) {
    const candidates = Array.from(doc.querySelectorAll('.singleQuesId, .TiMu, .questionLi, .reading_answer'));
    return candidates.filter(container => {
      if (!container.isConnected) return false;
      // A combined question contributes context; only its leaf questions own answers.
      if (Array.from(container.querySelectorAll('.singleQuesId, .TiMu, .questionLi, .reading_answer'))
        .some(child => this.hasTitle(child))) return false;
      return this.hasTitle(container);
    });
  },

  titleRoot(container) {
    const selectors = '.reader_answer_tit, .Zy_TItle, .Zy_Title, .newZy_TItle, .newZy_Title, h3.mark_name, h3';
    const roots = Array.from(container.querySelectorAll(selectors));
    return roots.find(node => node.closest('.reading_answer, .singleQuesId, .questionLi, .TiMu') === container)
      || roots.find(node => !node.closest('.reading_answer') || node.closest('.reading_answer') === container) || null;
  },

  typeLabel(container) {
    return container.getAttribute('typename') || container.querySelector('.read_type, h3 .colorShallow, .newZy_TItle, .newZy_Title')?.textContent || '';
  },

  stemRoot(container) {
    // Saved and live homework pages place rich question content beside the h3.
    // Keep the entire question region, excluding child questions and answer UI.
    const clone = container.cloneNode(true);
    clone.querySelectorAll('.readComprehensionQues, .reading_answer, .stem_answer, .stem_answer2, .Answer, .Zy_ulTop, .Zy_ulTk, .blankItemDiv, .matching, .selectBox, .edui-editor, .InpDIV, input, textarea, iframe, button, script, style')
      .forEach(node => node.remove());
    this.optionNodes(clone).forEach(node => node.remove());
    return clone;
  },

  optionNodes(container) {
    // Single-choice rows can omit answerBg/hoverDiv or sit outside stem_answer.
    // Use the actual choice marker to find its row before falling back to layout.
    const markers = Array.from(container.querySelectorAll('.num_option, .num_option_dx'));
    const rows = markers.map(marker => {
      // The marker itself can carry qid; start from its parent to keep the answer text.
      const row = marker.parentElement?.closest('.answerBg, .hoverDiv, [qid], li, .clearfix') || marker.parentElement;
      return row !== container && container.contains(row) &&
        row.closest('.reading_answer, .singleQuesId, .questionLi, .TiMu') === container ? row : null;
    }).filter(Boolean);
    if (rows.length) return [...new Set(rows)];
    return Array.from(container.querySelectorAll('.stem_answer .answerBg, .stem_answer2 .answerBg, .stem_answer .hoverDiv, .stem_answer2 .hoverDiv, ul.Zy_ulTop li, .stem_answer li'))
      .filter(node => !node.parentElement?.closest('.answerBg, .hoverDiv, ul.Zy_ulTop li, .stem_answer li'));
  },

  imageUrl(image) {
    const source = image.getAttribute('data-original') || image.getAttribute('data-src') || image.getAttribute('src');
    if (!source) return '';
    try {
      const url = new URL(source, image.ownerDocument.baseURI);
      return ['http:', 'https:'].includes(url.protocol) || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(source) ? url.href : '';
    } catch (_) { return ''; }
  },

  images(root) {
    return root ? Array.from(root.querySelectorAll('img')).map(image => ({
      url: this.imageUrl(image), alt: image.getAttribute('alt') || '题目图片'
    })).filter(image => image.url) : [];
  },

  text(root) {
    if (!root) return '';
    const clone = root.cloneNode(true);
    clone.querySelectorAll('script, style, .read_type').forEach(node => node.remove());
    clone.querySelectorAll('.colorShallow').forEach(node => {
      if (/^[（(]?(?:单选题|多选题|判断题|填空题|简答题|排序题|连线题)[）)]?$/.test(node.textContent.trim())) node.remove();
    });
    const originalImages = Array.from(root.querySelectorAll('img'));
    clone.querySelectorAll('img').forEach((image, index) => {
      const url = this.imageUrl(originalImages[index]);
      image.replaceWith(clone.ownerDocument.createTextNode(url ? `\n![题目图片](<${url}>)\n` : '\n[题目图片地址不可用]\n'));
    });
    clone.querySelectorAll('br').forEach(node => node.replaceWith(clone.ownerDocument.createTextNode('\n')));
    clone.querySelectorAll('td, th').forEach(node => node.append(clone.ownerDocument.createTextNode(' | ')));
    clone.querySelectorAll('p, div, li, pre, tr').forEach(node => node.append(clone.ownerDocument.createTextNode('\n')));
    return (clone.textContent || '').replace(/[\t\r ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n')
      .trim().replace(/^(?:\d+[.、．]|[（(]\d+[）)])\s*/, '');
  },

  describe(container) {
    const root = this.stemRoot(container);
    const parent = container.classList.contains('reading_answer')
      ? container.parentElement?.closest('.singleQuesId, .questionLi, .TiMu') : null;
    const parentRoot = parent ? this.stemRoot(parent) : null;
    const optionRoots = [...this.optionNodes(container), ...container.querySelectorAll('.lineCt, .firstUlList > li:not(.groupTitile), .secondUlList > li:not(.groupTitile), .stem_answer > .clearfix')];
    return {
      title: this.text(root),
      parentTitle: parentRoot ? this.text(parentRoot) : '',
      parentId: parent?.getAttribute('data') || parent?.id || '',
      subquestionId: container.getAttribute('itemid') || '',
      subquestionNumber: container.classList.contains('reading_answer') ? this.titleRoot(container)?.textContent?.trim().match(/^[（(](\d+)[）)]/)?.[1] || '' : '',
      images: [...this.images(root), ...optionRoots.flatMap(node => this.images(node))],
      parentImages: this.images(parentRoot)
    };
  },

  sameContext(left, right) {
    return ['parentTitle', 'parentId', 'subquestionId', 'images', 'parentImages']
      .every(key => JSON.stringify(left[key]) === JSON.stringify(right[key]));
  },

  options(container) {
    return this.optionNodes(container)
      .map((node, index) => {
        const marker = node.querySelector('.num_option, .num_option_dx, :scope > span[data]')?.textContent || '';
        const letter = marker.match(/[A-Z]/i)?.[0]?.toUpperCase() || String.fromCharCode(65 + index);
        const text = this.text(node.querySelector('.answer_p') || node).replace(/^[A-Z][.、．]\s*/i, '');
        return text ? `${letter}. ${text}` : '';
      }).filter(Boolean);
  },

  hasTitle(container) {
    const title = this.titleRoot(container);
    return Boolean(title && (title.textContent?.trim() || title.querySelector('img')));
  }
};
