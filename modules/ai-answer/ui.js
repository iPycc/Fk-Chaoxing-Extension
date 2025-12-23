// AI 答题助手 UI 模块
const AIAnswerUI = {
  // 检查是否是主页面
  isMainPage() {
    return window.location.href.includes('mooc1.chaoxing.com/mycourse/studentstudy') ||
           window.location.href.includes('mooc2-ans.chaoxing.com/mycourse/studentstudy');
  },

  // 注入 CSS 样式
  injectStyles() {
    if (document.getElementById('ai-answer-styles')) return;
    
    const link = document.createElement('link');
    link.id = 'ai-answer-styles';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('modules/ai-answer/notify.css');
    document.head.appendChild(link);
  },

  // 插入按钮
  insertButtons() {
    if (document.getElementById('ai-get-answers-btn')) return;
    
    // 找到复制按钮，插入到它后面
    const copyBtn = document.getElementById('__cx_copy_all_btn');
    if (!copyBtn) return;

    const aiBtn = document.createElement('button');
    aiBtn.id = 'ai-get-answers-btn';
    aiBtn.textContent = '🤖 AI答题';
    aiBtn.type = 'button';
    aiBtn.style.cssText = 'position:sticky;top:8px;margin:8px 0 8px 4px;padding:6px 12px;background:#fff;color:#333;border:1px solid #d9d9d9;border-radius:4px;font-size:13px;cursor:pointer;z-index:9999;transition:all 0.2s';
    aiBtn.addEventListener('mouseenter', () => {
      aiBtn.style.borderColor = '#722ed1';
      aiBtn.style.color = '#722ed1';
    });
    aiBtn.addEventListener('mouseleave', () => {
      aiBtn.style.borderColor = '#d9d9d9';
      aiBtn.style.color = '#333';
    });
    aiBtn.addEventListener('click', () => AIAnswerCore.processAllQuestions());

    copyBtn.insertAdjacentElement('afterend', aiBtn);
  }
};
