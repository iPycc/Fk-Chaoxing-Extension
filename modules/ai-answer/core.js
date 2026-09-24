// AI 答题助手核心逻辑
const AIAnswerCore = {
  isProcessing: false,

  async processAllQuestions(requestConfig) {
    if (this.isProcessing) {
      throw new Error('正在处理中，请稍候...');
    }

    this.isProcessing = true;
    try {
      AINotify.clear();
      AINotify.show();
      AINotify.info('开始扫描题目与可写入编辑器...');
      GlobalLogger.info('AI 开始分析题目...');

      const questions = await this.collectQuestions();
      if (questions.length === 0) {
        throw new Error('未找到任何题目');
      }

      AINotify.success(`找到 ${questions.length} 道题目`);

      const config = requestConfig ? AIApi.normalizeConfig(requestConfig) : await AIApi.loadConfig();
      AIApi.validateConfig(config);
      const settings = await AIConfig.loadBatchSettings();
      const autoApplyEnabled = await this.isAutoApplyEnabled();
      await AINotify.init();
      AINotify.updateModelSelect();

      const batches = [];
      for (let offset = 0; offset < questions.length; offset += settings.batchSize) {
        batches.push(questions.slice(offset, offset + settings.batchSize));
      }
      AINotify.info(`开始处理 ${batches.length} 片，每片最多 ${settings.batchSize} 题，同时最多 ${settings.concurrency} 片`);
      const result = { answeredCount: 0, appliedCount: 0, skippedCount: 0, failures: [] };
      let nextBatch = 0;
      let displayQueue = Promise.resolve();

      const worker = async () => {
        while (nextBatch < batches.length) {
          const batch = batches[nextBatch++];
          const start = batch[0].index;
          const end = batch[batch.length - 1].index;
          try {
            const answers = await this.answerBatch(batch, config, settings.maxRetries);
            const display = displayQueue.then(async () => {
              this.displayAnswers(batch, answers);
              result.answeredCount += batch.length;
              if (autoApplyEnabled) {
                const applied = await this.applyAnswers(batch, answers);
                result.appliedCount += applied.appliedCount;
                result.skippedCount += applied.skippedCount;
              }
              AINotify.success(`第 ${start}–${end} 题完成（${result.answeredCount}/${questions.length}）`);
              GlobalLogger.info(`第 ${start}–${end} 题完成（${result.answeredCount}/${questions.length}）`);
            });
            displayQueue = display.catch(() => {});
            await display;
          } catch (err) {
            result.failures.push({ start, end, message: err.message });
            const message = `第 ${start}–${end} 题失败：${err.message}`;
            AINotify.error(this.escapeHtml(message));
            GlobalLogger.error(message);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(settings.concurrency, batches.length) }, () => worker()));

      if (result.failures.length) {
        const summary = `部分完成：成功 ${result.answeredCount}/${questions.length} 题，失败 ${result.failures.length} 片${autoApplyEnabled ? `，写入 ${result.appliedCount} 题` : ''}`;
        AINotify.warning(summary);
        GlobalLogger.warning(summary);
      } else {
        const summary = autoApplyEnabled
          ? `完成：识别 ${questions.length} 题，写入 ${result.appliedCount} 题`
          : `完成：识别 ${questions.length} 题，仅展示答案`;
        AINotify.success(summary);
        GlobalLogger.success(summary);
      }
      if (autoApplyEnabled && result.skippedCount > 0) {
        AINotify.warning(`有 ${result.skippedCount} 题未写入，请查看逐题日志中的具体原因`);
      }
      return result;
    } catch (err) {
      console.error('[AI] 处理失败:', err);
      AINotify.error(`处理失败: ${err.message}`);
      GlobalLogger.error('AI 处理失败', err.message);
      throw err;
    } finally {
      this.isProcessing = false;
    }
  },

  async answerBatch(questions, config, maxRetries) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const text = await AIApi.getAnswers(questions, config);
        return AIApi.parseAnswers(text, questions);
      } catch (err) {
        if (!err.retryable || attempt >= maxRetries) throw err;
        const start = questions[0].index;
        const end = questions[questions.length - 1].index;
        AINotify.warning(`第 ${start}–${end} 题请求失败，准备第 ${attempt + 1} 次重试：${this.escapeHtml(err.message)}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (2 ** attempt) + Math.floor(Math.random() * 250)));
      }
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
      const containers = QuestionContainers.find(docRef);
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

  parseQuestionContainer(container, docRef, sectionHeader) {
    const fillTargets = this.extractFillTargets(container);
    const shortAnswerTargets = fillTargets.length === 0 ? this.extractShortAnswerTargets(container) : [];
    const dropdown = DropdownQuestions.extract(container);
    const options = dropdown?.options || this.extractOptions(container);
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
      ...(dropdown || {}),
      container,
      docRef
    };
  },

  detectQuestionType(container, fillTargets, shortAnswerTargets, options) {
    const dropdownType = DropdownQuestions.detectType(container);
    if (dropdownType) return dropdownType;
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
      try {
        if (answer?.error) throw new Error(answer.error);
        const applied = await this.applyAnswerToQuestion(question, answer);
        if (applied) {
          appliedCount += 1;
        } else {
          skippedCount += 1;
          AINotify.warning(`题目${question.index || index + 1}未写入：答案为空或缺少可用控件`);
        }
      } catch (err) {
        skippedCount += 1;
        AINotify.warning(`题目${question.index || index + 1}未完成填写：${this.escapeHtml(err.message)}`);
      }
    }

    return { appliedCount, skippedCount };
  },

  async applyAnswerToQuestion(question, answer) {
    if (!question || !answer) {
      return false;
    }

    switch (question.type) {
      case 'sorting':
      case 'matching':
        return this.applyDropdownAnswer(question, answer);
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

  async applyDropdownAnswer(question, answer) {
    const error = DropdownQuestions.validateAnswer(question, answer);
    if (error) throw new Error(error);
    const container = question.container;
    const qid = container?.getAttribute('data') || container?.id?.match(/(\d+)$/)?.[1];
    if (!container?.isConnected || !qid) throw new Error('题目控件已失效，请重新提取题目');
    const hidden = Array.from(container.querySelectorAll('input[type="hidden"]'))
      .find(input => input.id === `answer${qid}` || input.name === `answer${qid}`);
    if (!hidden) throw new Error('未找到题目的隐藏答案字段');

    const targets = DropdownQuestions.getTargets(container, question.type);
    const sorting = question.type === 'sorting';
    const expectedCount = sorting ? question.sortingLabels.length : question.matchingGroups.left.length;
    if (targets.length !== expectedCount) throw new Error('答题控件数量与题目不一致');
    if (!sorting && (new Set(targets.map(target => target.left)).size !== expectedCount ||
        targets.some(target => !question.matchingGroups.left.some(item => item.id === target.left)))) {
      throw new Error('连线题显示编号与答题控件无法对应');
    }

    // Resolve every choice before clicking anything, including shuffled internal IDs.
    const choices = targets.map((target, index) => {
      const label = sorting ? answer.answers[index] : answer.pairs.find(pair => pair.left === target.left)?.right;
      const prefix = sorting ? 'sortSelect' : 'connlineSelect';
      if (!target.span?.classList.contains(`${prefix}${qid}`)) throw new Error('无法识别下拉框答案控件');
      const candidates = Array.from(target.box.querySelectorAll('ul.options > li'))
        .filter(item => DropdownQuestions.text(item.querySelector('a')?.textContent) === label &&
          item.getAttribute('qid') === qid && item.getAttribute('qtype') === (sorting ? '13' : '11'));
      if (candidates.length !== 1) throw new Error(`找不到唯一的下拉选项 ${label}`);
      const item = candidates[0];
      const value = item.getAttribute('data');
      if (!value) throw new Error('下拉选项缺少内部值');
      const name = target.span.getAttribute('data');
      if (!sorting && !/^\d+$/.test(name || '')) throw new Error('连线控件缺少有效内部编号');
      return { ...target, item, label, value, name };
    });
    if (!sorting && new Set(choices.map(choice => choice.name)).size !== expectedCount) {
      throw new Error('连线控件内部编号重复');
    }

    for (const choice of choices) {
      if (!choice.item.isConnected) throw new Error('填写时控件已失效，请重新提取题目');
      choice.item.click();
    }
    if (choices.some(choice => choice.span.getAttribute('value') !== choice.value ||
        DropdownQuestions.text(choice.span.textContent) !== choice.label)) {
      throw new Error('下拉框显示或选中值未更新，请检查页面');
    }
    if (sorting) {
      if (hidden.value !== choices.map(choice => choice.value).join('')) {
        throw new Error('排序答案字段未同步，请检查页面');
      }
    } else {
      let saved;
      try { saved = JSON.parse(hidden.value); } catch (_) { throw new Error('连线答案字段未同步，请检查页面'); }
      const expected = choices.map(choice => ({ name: choice.name, content: choice.value }));
      const canonical = entries => JSON.stringify(entries.map(entry => ({ name: entry.name, content: entry.content }))
        .sort((a, b) => Number(a.name) - Number(b.name)));
      if (!Array.isArray(saved) || saved.length !== expected.length || saved.some(entry => !entry || typeof entry.name !== 'string' || typeof entry.content !== 'string') ||
          canonical(saved) !== canonical(expected)) {
        throw new Error('连线配对与答案字段不一致，请检查页面');
      }
    }
    return true;
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

    if (answer.error) return `答案无效：${answer.error}`;
    if (answer.type === 'sorting') return answer.answers.join(' → ');
    if (answer.type === 'matching') return answer.pairs.map(pair => `${pair.left} → ${pair.right}`).join('；');

    if (Array.isArray(answer.answers)) {
      return answer.answers.join(' | ') || '未获取到答案';
    }

    return answer.answer || '未获取到答案';
  },

  displayAnswers(questions, answers) {
    questions.forEach((question, index) => {
      const shortTitle = question.title.length > 30 ? `${question.title.slice(0, 30)}...` : question.title;
      const displayAnswer = this.formatAnswerForDisplay(answers[index]);
      AINotify.info(`<b>题目${question.index || index + 1}:</b> ${this.escapeHtml(shortTitle)}<br><b>答案:</b> ${this.escapeHtml(displayAnswer)}`);
    });
  }
};
