// Toast Notification UI
const CXToast = {
  show(msg, type = 'info') {
    const el = document.createElement('div');
    el.textContent = msg;
    
    let bg = 'rgba(0,0,0,0.75)';
    if (type === 'error') bg = 'rgba(255, 77, 79, 0.9)';
    if (type === 'success') bg = 'rgba(82, 196, 26, 0.9)';

    el.style.cssText = `position:fixed;left:50%;top:24px;transform:translateX(-50%);background:${bg};color:#fff;padding:8px 16px;border-radius:4px;font-size:14px;z-index:10001;box-shadow: 0 2px 8px rgba(0,0,0,0.15);transition: all 0.3s;`;
    
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(-10px)';
      setTimeout(() => el.remove(), 300);
    }, 2000);
  },

  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  info(msg) { this.show(msg, 'info'); }
};
