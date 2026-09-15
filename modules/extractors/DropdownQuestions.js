// Shared extraction and validation for the homework page's custom dropdowns.
const DropdownQuestions = {
  text(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  },

  detectType(container) {
    const label = container.getAttribute('typename') || container.querySelector('h3 .colorShallow')?.textContent || '';
    if (label.includes('排序') || container.querySelector('.selectBox li[qtype="13"]')) return 'sorting';
    if (label.includes('连线') || container.querySelector('.selectBox li[qtype="11"]')) return 'matching';
    return null;
  },

  readItems(nodes) {
    return Array.from(nodes).map(node => {
      const label = node.querySelector(':scope > span');
      const id = this.text(label?.textContent).replace(/[.、．。]$/, '').trim();
      const clone = node.cloneNode(true);
      clone.querySelector(':scope > span')?.remove();
      return { id, text: this.text(clone.textContent) };
    }).filter(item => item.id && item.text);
  },

  extract(container) {
    const type = this.detectType(container);
    if (type === 'sorting') {
      const items = this.readItems(container.querySelectorAll('.stem_answer > .clearfix'));
      return { type, options: items.map(item => `${item.id}. ${item.text}`), sortingLabels: items.map(item => item.id) };
    }
    if (type === 'matching') {
      const left = this.readItems(container.querySelectorAll('.line_wid_400.fl .lineCt'));
      const right = this.readItems(container.querySelectorAll('.line_wid_400.fr .lineCt'));
      return { type, options: [], matchingGroups: { left, right } };
    }
    return null;
  },

  getTargets(container, type) {
    const selector = type === 'sorting' ? '.selectBox.order_box' : '.line_answer_ct .selectBox';
    return Array.from(container.querySelectorAll(selector)).map(box => ({
      box,
      span: box.querySelector(':scope > p > span'),
      left: this.text(box.closest('.line_answer_ct')?.querySelector('.line_option')?.textContent)
    }));
  },

  validateAnswer(question, answer) {
    if (question.type === 'sorting') {
      const labels = question.sortingLabels || [];
      if (!labels.length || new Set(labels).size !== labels.length) return '无法完整识别排序选项';
      if (!Array.isArray(answer.answers) || answer.answers.length !== labels.length) return '排序答案数量与选项数量不一致';
      if (new Set(answer.answers).size !== labels.length) return '排序答案包含重复选项';
      if (answer.answers.some(label => !labels.includes(label))) return '排序答案包含无效选项';
    }
    if (question.type === 'matching') {
      const { left = [], right = [] } = question.matchingGroups || {};
      if (!left.length || !right.length || new Set(left.map(item => item.id)).size !== left.length || new Set(right.map(item => item.id)).size !== right.length) return '无法完整识别连线题两组内容';
      if (!Array.isArray(answer.pairs) || answer.pairs.length !== left.length) return '连线答案未覆盖全部左侧项目';
      if (new Set(answer.pairs.map(pair => pair?.left)).size !== left.length) return '连线答案包含重复的左侧项目';
      if (answer.pairs.some(pair => !left.some(item => item.id === pair?.left) || !right.some(item => item.id === pair?.right))) return '连线答案包含无效配对';
    }
    return '';
  }
};
