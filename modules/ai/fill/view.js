// Batch diagnostics view.
const AINotify = {
  init() {},
  updateModelSelect() {},
  show() { if (AIChat.root) AIChat.root.host.hidden = false; else AIChat.open(); },
  clear() {},
  log(message, type = 'info') {
    const plain = String(message).replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '');
    GlobalLogger[type === 'error' ? 'error' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'info'](plain);
  },
  info(message) { this.log(message, 'info'); },
  success(message) { this.log(message, 'success'); },
  error(message) { this.log(message, 'error'); },
  warning(message) { this.log(message, 'warning'); }
};
