// Select actual questions before any extractor reads titles or answer controls.
const QuestionContainers = {
  find(doc = document) {
    const candidates = Array.from(doc.querySelectorAll('.singleQuesId, .TiMu'));
    return candidates.filter(container => {
      if (!container.isConnected || container.querySelector('.singleQuesId')) return false;

      if (container.classList.contains('TiMu')) {
        if (container.parentElement?.closest('.singleQuesId')) return false;
        if (Array.from(container.querySelectorAll('.TiMu')).some(child => this.hasTitle(child))) return false;
      }

      return this.hasTitle(container);
    });
  },

  hasTitle(container) {
    const title = container.querySelector(
      '.Zy_TItle, .Zy_Title, .newZy_TItle, .newZy_Title, h3.mark_name, h3'
    );
    return Boolean(title?.textContent?.trim());
  }
};
