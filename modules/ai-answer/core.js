// AI 答题助手核心逻辑
const AIAnswerCore = {
  isProcessing: false,

  async processAllQuestions() {
    if (this.isProcessing) {
      AINotify.warning('正在处理中，请稍候...');
      return;
    }

    try {
      this.isProcessing = true;
      AINotify.clear();
      AINotify.show();
      AINotify.info('开始扫描题目与可写入编辑器...');
      GlobalLogger.info('AI 开始分析题目...');

      const questions = await this.collectQuestions();
      if (questions.length === 0) {
        throw new Error('未找到任何题目');
      }

      AINotify.success(`找到 ${questions.length} 道题目`);

      const config = await AIApi.loadConfig();
      AIApi.validateConfig(config);
      await AINotify.init();
      AINotify.updateModelSelect();

      AINotify.info('正在发送到 AI 分析...');
      const responseText = await AIApi.getAnswers(questions);
      AINotify.success('AI 返回答案成功');

      const answers = AIApi.parseAnswers(responseText, questions);
      AINotify.info('JSON 答案解析完成');

      const autoApplyEnabled = await this.isAutoApplyEnabled();
      AINotify.info(autoApplyEnabled ? '当前模式：自动作答，开始写入编辑器' : '当前模式：仅展示答案，不写入编辑器');

      const applyResult = autoApplyEnabled
        ? await this.applyAnswers(questions, answers)
        : { appliedCount: 0, skippedCount: questions.length };

      this.displayAnswers(questions, answers);

      if (autoApplyEnabled) {
        AINotify.success(`完成：识别 ${questions.length} 题，写入 ${applyResult.appliedCount} 题`);
      } else {
        AINotify.success(`完成：识别 ${questions.length} 题，仅展示答案`);
      }
      if (autoApplyEnabled && applyResult.skippedCount > 0) {
        AINotify.warning(`有 ${applyResult.skippedCount} 题未写入，可能缺少可用控件或答案为空`);
      }
      GlobalLogger.success(autoApplyEnabled
        ? `AI 答题完成，共写入 ${applyResult.appliedCount} 题`
        : `AI 答题完成，共返回 ${answers.length} 题答案，未自动写入`);
    } catch (err) {
      console.error('[AI] 处理失败:', err);
      AINotify.error(`处理失败: ${err.message}`);
      GlobalLogger.error('AI 处理失败', err.message);
      throw err;
    } finally {
      this.isProcessing = false;
    }
  },

  normalizeText(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim();
  },

  async isAutoApplyEnabled() {
    const data = await chrome.storage.local.get('autoApplyAnswers');
    return data.autoApplyAnswers === true;
  },

  async collectQuestions() {
    const docs = this.collectReachableDocuments(document);
    const questions = [];

    docs.forEach(docRef => {
      const sectionHeader = QuestionCollector.findHeaderTitle(docRef) || docRef.title || '';
      const containers = this.getQuestionContainers(docRef);
      containers.forEach(container => {
        const question = this.parseQuestionContainer(container, docRef, sectionHeader);
        if (question) {
          questions.push(question);
        }
      });
    });

    return questions.map((question, index) => ({
      ...question,
      index: index + 1
    }));
  },

  collectReachableDocuments(rootDoc, docs = [], visited = new Set()) {
    if (!rootDoc || visited.has(rootDoc)) {
      return docs;
    }

    visited.add(rootDoc);
    docs.push(rootDoc);

    const frames = Array.from(rootDoc.querySelectorAll('iframe'));
    frames.forEach(frame => {
      try {
        const childDoc = frame.contentDocument;
        if (childDoc?.body) {
          this.collectReachableDocuments(childDoc, docs, visited);
        }
      } catch (err) {
        // Ignore cross-origin or unloaded iframe.
      }
    });

    return docs;
  },

  getQuestionContainers(doc) {
    const candidates = Array.from(doc.querySelectorAll('.singleQuesId, .TiMu'));
    return candidates.filter(container => {
      if (!container || !container.isConnected) {
        return false;
      }

      if (container.classList.contains('TiMu') && container.closest('.singleQuesId')) {
        return false;
      }

      const parentQuestion = container.parentElement?.closest('.singleQuesId, .TiMu');
      return parentQuestion !== container;
    });
  },

  parseQuestionContainer(container, docRef, sectionHeader) {
    const fillTargets = this.extractFillTargets(container);
    const shortAnswerTargets = fillTargets.length === 0 ? this.extractShortAnswerTargets(container) : [];
    const options = this.extractOptions(container);
    const type = this.detectQuestionType(container, fillTargets, shortAnswerTargets, options);
    const title = this.extractQuestionTitle(container);

    if (!title) {
      return null;
    }

    return {
      title,
      sectionHeader,
      type,
      blankCount: fillTargets.length,
      options,
      fillTargets,
      shortAnswerTargets,
      choiceTargets: this.extractChoiceTargets(container),
      container,
      docRef
    };
  },

  detectQuestionType(container, fillTargets, shortAnswerTargets, options) {
    const typeText = this.normalizeText(
      container.getAttribute('typename') ||
      container.querySelector('.newZy_TItle, .newZy_Title, .colorShallow')?.textContent ||
      ''
    );

    if (fillTargets.length > 0 || typeText.includes('填空')) {
      return 'fill_blank';
    }

    if (typeText.includes('简答')) {
      return 'short_answer';
    }

    if (typeText.includes('多选')) {
      return 'multiple_choice';
    }

    if (typeText.includes('单选') || typeText.includes('判断')) {
      return 'single_choice';
    }

    if (shortAnswerTargets.length > 0) {
      return 'short_answer';
    }

    if (options.length >= 5) {
      return 'multiple_choice';
    }

    if (options.length > 0) {
      return 'single_choice';
    }

    return 'short_answer';
  },

  extractQuestionTitle(container) {
    const titleRoot = container.querySelector('.Zy_TItle .fontLabel, .Zy_Title .fontLabel, .newZy_TItle .fontLabel, .newZy_Title .fontLabel')
      || container.querySelector('.Zy_TItle, .Zy_Title, .newZy_TItle, .newZy_Title, h3.mark_name, h3, .fontLabel');

    const clone = titleRoot ? titleRoot.cloneNode(true) : null;
    if (!clone) {
      return '';
    }

    clone.querySelectorAll('script, style').forEach(node => node.remove());
    const text = this.normalizeText(clone.textContent || '');
    return text.replace(/^\d+\s*/, '').trim();
  },

  extractOptions(container) {
    const optionNodes = Array.from(container.querySelectorAll('.stem_answer .answerBg, ul.Zy_ulTop li, .Zy_ulTop li'));
    const options = [];

    optionNodes.forEach((node, index) => {
      const letter = String.fromCharCode(65 + index);
      const text = this.normalizeText(node.textContent || '');
      if (text) {
        options.push(`${letter}. ${text.replace(/^[A-Z][.、]\s*/, '')}`);
      }
    });

    return options;
  },

  extractFillTargets(container) {
    // 传统填空题结构
    const traditionalTargets = Array.from(container.querySelectorAll('.clearfix .Zy_ulTk .blankItemDiv, .blankItemDiv'))
      .map((blankItem, blankIndex) => this.createEditorTarget(blankItem, blankIndex))
      .filter(Boolean);
    
    if (traditionalTargets.length > 0) {
      return traditionalTargets;
    }
    
    // 作业页面新填空题结构：每个空对应一个 .Answer 容器
    const answerContainers = container.querySelectorAll('.stem_answer .Answer, .Answer');
    if (answerContainers.length > 0) {
      return Array.from(answerContainers).map((answerDiv, index) => {
        // 查找UEditor编辑器
        const textarea = answerDiv.querySelector('textarea[id^="answerEditor"]');
        const editorRoot = answerDiv.querySelector('.edui-editor') || answerDiv;
        const iframe = answerDiv.querySelector('iframe[id^="ueditor_"]');
        
        if (!textarea && !iframe) {
          return null;
        }
        
        return {
          index,
          root: editorRoot,
          textarea,
          iframe,
          inputDiv: null,
          blankItemDiv: answerDiv
        };
      }).filter(Boolean);
    }
    
    return [];
  },

  extractShortAnswerTargets(container) {
    const targets = Array.from(container.querySelectorAll('textarea[id^="answerEditor"], textarea[id^="answer"]:not([id^="answertype"])'))
      .map((textarea, index) => {
        const editorRoot = textarea.closest('.edui-editor') || textarea.parentElement;
        return this.createEditorTarget(editorRoot || textarea.parentElement || container, index, textarea);
      })
      .filter(Boolean);

    return targets.filter(target => !target.blankItemDiv);
  },

  createEditorTarget(root, index, forcedTextarea) {
    if (!root) {
      return null;
    }

    const textarea = forcedTextarea || root.querySelector('textarea[id^="answerEditor"], textarea[id^="answer"]:not([id^="answertype"])');
    const iframe = root.querySelector('[id$="_iframeholder"] iframe, iframe[id^="ueditor_"]');
    const inputDiv = root.querySelector('.InpDIV');

    if (!textarea && !iframe && !inputDiv) {
      return null;
    }

    return {
      index,
      root,
      textarea,
      iframe,
      inputDiv,
      blankItemDiv: root.classList?.contains('blankItemDiv') ? root : root.closest('.blankItemDiv')
    };
  },

  extractChoiceTargets(container) {
    const items = Array.from(container.querySelectorAll('ul.Zy_ulTop li, .stem_answer li, .stem_answer .answerBg'));
    return items.map((item, index) => {
      const fallbackLetter = String.fromCharCode(65 + index);
      const marker = item.querySelector('.num_option, span[data]');
      const markerText = this.normalizeText(marker?.textContent || '');
      // 优先使用 data 属性作为实际值，显示文本作为字母标识
      const dataValue = marker?.getAttribute('data');
      const letter = (markerText.match(/[A-Z]/i)?.[0] || fallbackLetter).toUpperCase();
      const input = item.querySelector('input[type="radio"], input[type="checkbox"]');
      const clickable = item.querySelector('label, a, .num_option, .answer_p') || item;
      const qid = item.getAttribute('qid') || container.getAttribute('data') || '';
      const answerInput = qid
        ? container.querySelector(`#answer${qid}, input[type="hidden"][name="answer${qid}"]`)
        : container.querySelector(
          'input[type="hidden"][name^="answer"]:not([name^="answertype"]), input[type="hidden"][id^="answer"]:not([id^="answertype"])'
        );

      return {
        letter,
        value: dataValue || input?.value || letter,
        item,
        input,
        clickable,
        marker,
        answerInput,
        selectedClass: marker?.classList.contains('num_option_dx') ? 'check_answer_dx' : 'check_answer'
      };
    });
  },

  async applyAnswers(questions, answers) {
    let appliedCount = 0;
    let skippedCount = 0;

    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      const answer = answers[index];
      const applied = await this.applyAnswerToQuestion(question, answer);
      if (applied) {
        appliedCount += 1;
      } else {
        skippedCount += 1;
      }
    }

    return { appliedCount, skippedCount };
  },

  async applyAnswerToQuestion(question, answer) {
    if (!question || !answer) {
      return false;
    }

    switch (question.type) {
      case 'fill_blank':
        return this.applyFillBlankAnswer(question, answer);
      case 'short_answer':
        return this.applyShortAnswer(question, answer);
      case 'single_choice':
      case 'multiple_choice':
        return this.applyChoiceAnswer(question, answer);
      default:
        return false;
    }
  },

  async applyFillBlankAnswer(question, answer) {
    if (!question.fillTargets.length || !Array.isArray(answer.answers)) {
      return false;
    }

    let insertedCount = 0;
    question.fillTargets.forEach((target, index) => {
      const value = answer.answers[index] || '';
      if (value && this.writeEditorContent(target, value)) {
        insertedCount += 1;
      }
    });

    return insertedCount > 0;
  },

  async applyShortAnswer(question, answer) {
    const target = question.shortAnswerTargets[0];
    if (!target || !answer.answer) {
      return false;
    }

    return this.writeEditorContent(target, answer.answer);
  },

  async applyChoiceAnswer(question, answer) {
    if (!question.choiceTargets.length) {
      return false;
    }

    const letters = question.type === 'multiple_choice'
      ? (Array.isArray(answer.answers) ? answer.answers : [])
      : [answer.answer].filter(Boolean);

    const normalizedLetters = [...new Set(
      letters
        .map(letter => String(letter || '').trim().toUpperCase())
        .filter(Boolean)
    )];

    if (normalizedLetters.length === 0) {
      return false;
    }

    const selectedLetters = question.type === 'single_choice'
      ? [normalizedLetters[0]]
      : normalizedLetters;

    let clicked = false;
    selectedLetters.forEach(letter => {
      const target = question.choiceTargets.find(choice => choice.letter === letter || choice.value === letter);
      if (!target || this.isChoiceSelected(target)) {
        return;
      }

      const clickTarget = target.item || target.clickable;
      if (clickTarget && typeof clickTarget.click === 'function') {
        clickTarget.click();
        clicked = true;
      }
    });

    const synced = this.syncChoiceTargets(question, selectedLetters);
    return clicked || synced;
  },

  isChoiceSelected(target) {
    if (target.input) {
      return target.input.checked === true;
    }

    if (target.marker?.classList.contains(target.selectedClass || 'check_answer')) {
      return true;
    }

    return target.item?.getAttribute('aria-checked') === 'true'
      || target.item?.getAttribute('aria-pressed') === 'true';
  },

  syncChoiceTargets(question, selectedLetters) {
    const selectedSet = new Set(selectedLetters);
    let updated = false;

    question.choiceTargets.forEach(target => {
      const shouldSelect = selectedSet.has(target.letter);

      if (target.input && target.input.checked !== shouldSelect) {
        target.input.checked = shouldSelect;
        this.dispatchChoiceEvents(target.input);
        updated = true;
      }

      if (target.marker) {
        target.marker.classList.toggle(target.selectedClass || 'check_answer', shouldSelect);
        updated = true;
      }

      if (target.item) {
        if (shouldSelect) {
          target.item.setAttribute('aria-checked', 'true');
          target.item.setAttribute('aria-pressed', 'true');
        } else {
          target.item.removeAttribute('aria-checked');
          target.item.removeAttribute('aria-pressed');
        }
        updated = true;
      }
    });

    const selectedTargets = question.choiceTargets.filter(target => selectedSet.has(target.letter));
    const answerInput = selectedTargets[0]?.answerInput
      || question.container.querySelector(
        'input[type="hidden"][name^="answer"]:not([name^="answertype"]), input[type="hidden"][id^="answer"]:not([id^="answertype"])'
      );

    if (answerInput) {
      const answerValue = question.type === 'single_choice'
        ? (selectedTargets[0]?.value || '')
        : selectedTargets
          .map(target => String(target.value || '').trim().toUpperCase())
          .filter(Boolean)
          .sort()
          .join('');

      if (answerInput.value !== answerValue) {
        answerInput.value = answerValue;
        this.dispatchChoiceEvents(answerInput);
        updated = true;
      }
    }

    if (updated && question.container) {
      this.dispatchChoiceEvents(question.container);
    }

    return updated;
  },

  dispatchChoiceEvents(target) {
    if (!target) {
      return;
    }

    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  },

  writeEditorContent(target, value) {
    const html = this.buildEditorHtml(value);
    let updated = false;

    const ue = this.getUeEditorInstance(target.textarea?.id);
    if (ue && typeof ue.setContent === 'function') {
      try {
        ue.setContent(html, false);
        updated = true;
      } catch (err) {
        // Fall back to direct DOM sync below.
      }
    }

    if (target.iframe?.contentDocument?.body) {
      target.iframe.contentDocument.body.innerHTML = html;
      updated = true;
    }

    if (target.inputDiv) {
      target.inputDiv.innerHTML = html;
      updated = true;
    }

    if (target.textarea) {
      target.textarea.value = html;
      target.textarea.textContent = html;
      target.textarea.dispatchEvent(new Event('input', { bubbles: true }));
      target.textarea.dispatchEvent(new Event('change', { bubbles: true }));
      updated = true;
    }

    if (target.root) {
      target.root.dispatchEvent(new Event('input', { bubbles: true }));
      target.root.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return updated;
  },

  getUeEditorInstance(textareaId) {
    if (!textareaId || typeof window.UE === 'undefined' || typeof window.UE.getEditor !== 'function') {
      return null;
    }

    try {
      return window.UE.getEditor(textareaId);
    } catch (err) {
      return null;
    }
  },

  buildEditorHtml(value) {
    const lines = String(value || '')
      .split(/\r?\n/)
      .map(line => this.escapeHtml(line.trim()))
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      return '<p><br/></p>';
    }

    return lines.map(line => `<p>${line}</p>`).join('');
  },

  escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  buildRandomAnswer(seed) {
    const pool = ['Fk-Chaoxing', '自动填入', 'UE内容'];
    const suffix = Math.random().toString(36).slice(2, 8);
    return `${pool[seed % pool.length]}-${seed + 1}-${suffix}`;
  },

  async insertRandomFillAnswers() {
    const questions = await this.collectQuestions();
    const fillQuestions = questions.filter(question => question.type === 'fill_blank' && question.fillTargets.length > 0);

    if (fillQuestions.length === 0) {
      throw new Error('当前页面未找到可写入的填空题 UE 编辑器');
    }

    let insertedCount = 0;
    fillQuestions.forEach((question, questionIndex) => {
      question.fillTargets.forEach((target, blankIndex) => {
        const value = this.buildRandomAnswer(questionIndex * 10 + blankIndex);
        if (this.writeEditorContent(target, value)) {
          insertedCount += 1;
        }
      });
    });

    AINotify.show();
    AINotify.success(`测试插入完成，共写入 ${insertedCount} 个填空 UE 编辑器`);
    GlobalLogger.success(`测试插入完成，共写入 ${insertedCount} 个填空编辑器`);
    return insertedCount;
  },

  formatAnswerForDisplay(answer) {
    if (!answer) {
      return '未获取到答案';
    }

    if (Array.isArray(answer.answers)) {
      return answer.answers.join(' | ') || '未获取到答案';
    }

    return answer.answer || '未获取到答案';
  },

  displayAnswers(questions, answers) {
    questions.forEach((question, index) => {
      const shortTitle = question.title.length > 30 ? `${question.title.slice(0, 30)}...` : question.title;
      const displayAnswer = this.formatAnswerForDisplay(answers[index]);
      AINotify.info(`<b>题目${index + 1}:</b> ${shortTitle}<br><b>答案:</b> ${displayAnswer}`);
    });
  }
};
