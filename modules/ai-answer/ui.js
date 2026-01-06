// AI 答题助手 UI 模块
const AIAnswerUI = {
  // 检查是否是主页面或考试页面
  isMainPage() {
    return window.location.href.includes('mooc1.chaoxing.com/mycourse/studentstudy') ||
           window.location.href.includes('mooc2-ans.chaoxing.com/mycourse/studentstudy');
  },

  isExamPage() {
    return window.location.href.includes('/exam-ans/mooc2/exam/preview');
  },

  shouldShowUI() {
    return this.isMainPage() || this.isExamPage();
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
    
    if (this.isExamPage()) {
      this.insertExamButtons();
    } else {
      this.insertStudyButtons();
    }
  },

  // 在作业页面插入按钮
  insertStudyButtons() {
    const copyBtn = document.getElementById('__cx_copy_all_btn');
    if (!copyBtn) return;

    const aiBtn = this.createAIButton();
    copyBtn.insertAdjacentElement('afterend', aiBtn);
  },

  // 在考试页面插入按钮
  insertExamButtons() {
    // 查找合适的锚点
    const anchor = document.querySelector('.marking_content') || 
                   document.querySelector('.examPaperTitle') ||
                   document.querySelector('.exam_main') ||
                   document.querySelector('#examPaperDiv') ||
                   document.querySelector('.singleQuesId') ||
                   document.querySelector('body');
    
    if (!anchor) {
      console.log('[AI] 考试页面未找到合适的锚点');
      return;
    }

    const btnContainer = document.createElement('div');
    btnContainer.id = 'exam-ai-btn-container';
    btnContainer.style.cssText = 'position:fixed;top:10px;right:180px;z-index:9999;display:flex;gap:8px;';

    const aiBtn = this.createAIButton();
    btnContainer.appendChild(aiBtn);

    document.body.appendChild(btnContainer);
    console.log('[AI] 考试页面按钮已插入');
  },

  // 创建 AI 按钮
  createAIButton() {
    const aiBtn = document.createElement('button');
    aiBtn.id = 'ai-get-answers-btn';
    aiBtn.textContent = '🤖 AI答题';
    aiBtn.type = 'button';
    aiBtn.style.cssText = 'padding:6px 12px;background:#fff;color:#333;border:1px solid #d9d9d9;border-radius:4px;font-size:13px;cursor:pointer;transition:all 0.2s';
    aiBtn.addEventListener('mouseenter', () => {
      aiBtn.style.borderColor = '#722ed1';
      aiBtn.style.color = '#722ed1';
    });
    aiBtn.addEventListener('mouseleave', () => {
      aiBtn.style.borderColor = '#d9d9d9';
      aiBtn.style.color = '#333';
    });
    aiBtn.addEventListener('click', () => AIAnswerCore.processAllQuestions());
    return aiBtn;
  }
};
