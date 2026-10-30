// Answer collection and page writing facade.
const AIAnswerCore = {
  isProcessing: false,
  questionIds: new WeakMap(),
  nextQuestionId: 1,
  examSaveQueue: Promise.resolve(),

  isExamQuestion(question) {
    return /^sigleQuestionDiv_\d+$/.test(question?.container?.id || '') &&
      question.container.ownerDocument.getElementById('answerMode')?.value === '1';
  },

  async saveExamAnswer(question, { signal, timeoutSeconds } = {}) {
    signal?.throwIfAborted();
    const container = question.container;
    const id = `${Date.now()}-${Math.random()}`;
    const fields = Array.from(container.querySelectorAll('input, textarea')).filter(field =>
      /^answers?\d+$/.test(field.name) || /^answerEditor\d+$/.test(field.name)
    ).map(field => ({ id: field.id, name: field.name, value: field.value }));
    const frames = Array.from(container.querySelectorAll('iframe')).map(frame => ({ id: frame.id, html: frame.contentDocument?.body?.innerHTML }));
    if (!fields.length) throw new Error('未找到原生答案字段');
    timeoutSeconds ??= (await AIConfig.loadBatchSettings()).timeoutSeconds;
    signal?.throwIfAborted();
    const timeoutMs = AIConfig.normalizeTimeoutSeconds(timeoutSeconds) * 1000;
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        container.removeEventListener('CX_EXAM_TEMP_SAVE_RESULT', receive);
        delete container.dataset.cxExamSaveRequest;
        delete container.dataset.cxExamSaveAccepted;
        delete container.dataset.cxExamSaveResult;
      };
      const cancel = () => {
        cleanup();
        container.dispatchEvent(new Event('CX_EXAM_TEMP_SAVE_CANCEL', { bubbles: true }));
        delete container.dataset.cxExamSaveResult;
        reject(signal.reason);
      };
      const receive = () => {
        let result;
        try { result = JSON.parse(container.dataset.cxExamSaveResult); } catch (_) { return; }
        if (result.id !== id) return;
        cleanup();
        if (signal?.aborted) reject(signal.reason);
        else if (!result.ok) reject(new Error(result.error));
        else resolve(true);
      };
      container.addEventListener('CX_EXAM_TEMP_SAVE_RESULT', receive);
      signal?.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => {
        cleanup();
        container.dispatchEvent(new Event('CX_EXAM_TEMP_SAVE_CANCEL', { bubbles: true }));
        delete container.dataset.cxExamSaveResult;
        reject(new Error('等待单题暂存超时'));
      }, timeoutMs);
      container.dataset.cxExamSaveRequest = JSON.stringify({ id, timeoutMs, fields, frames });
      container.dispatchEvent(new Event('CX_EXAM_TEMP_SAVE', { bubbles: true }));
      if (container.dataset.cxExamSaveAccepted !== id && container.dataset.cxExamSaveRequest) {
        cleanup(); reject(new Error('页面暂存桥接未准备好，请刷新页面后重试'));
      }
    });
  },

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

      const collection = await QuestionCollector.collectLive();
      if (collection.status !== 'stable') throw new Error(QuestionReport.message(collection.diagnostics));
      const questions = collection.sections.flatMap(section => section.questions)
        .map((question, index) => ({ ...question, index: index + 1 }));
      if (questions.length === 0) {
        throw new Error('未找到任何题目');
      }

      AINotify.success(`找到 ${questions.length} 道题目`);

      const config = requestConfig ? AIApi.normalizeConfig(requestConfig) : await AIApi.loadConfig();
      AIApi.validateConfig(config);
      const settings = await AIConfig.loadBatchSettings();
      config.timeouts = settings;
      const autoApplyEnabled = await this.isAutoApplyEnabled();
      await AINotify.init();
      AINotify.updateModelSelect();

      const batches = AIAnswerPlan.split({ mode: 'answer', context: questions, target: questions }, settings.batchSize)
        .map(batch => batch.target);
      AINotify.info(`开始处理 ${batches.length} 片，每片最多 ${settings.batchSize} 题，同时最多 ${settings.concurrency} 片`);
      const result = { answeredCount: 0, appliedCount: 0, skippedCount: 0, savedCount: 0, failures: [] };
      let nextBatch = 0;
      let displayQueue = Promise.resolve();
      let writingError;

      const worker = async () => {
        while (nextBatch < batches.length && !writingError) {
          const batch = batches[nextBatch++];
          const start = batch[0].index;
          const end = batch[batch.length - 1].index;
          try {
            const answers = await this.answerBatch(batch, config, settings.maxRetries);
            const display = displayQueue.then(async () => {
              if (writingError) throw writingError;
              this.displayAnswers(batch, answers);
              result.answeredCount += batch.length;
              if (autoApplyEnabled) {
                let applied;
                try { applied = await this.applyAnswers(batch, answers, { timeoutSeconds: settings.idleTimeoutSeconds }); }
                catch (error) {
                  if (error.examSaveError) {
                    writingError = error;
                    result.appliedCount += error.appliedCount || 0;
                    result.skippedCount += error.skippedCount || 0;
                    result.savedCount += error.savedCount || 0;
                  }
                  throw error;
                }
                result.appliedCount += applied.appliedCount;
                result.skippedCount += applied.skippedCount;
                result.savedCount += applied.savedCount || 0;
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
      await AIAnswerRunner.pool(Math.min(settings.concurrency, batches.length), worker);

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
      if (result.savedCount) AINotify.info(`其中 ${result.savedCount} 题已填写并暂存；最终交卷请手动操作`);
      if (writingError) AINotify.error(`已暂停后续填写：${this.escapeHtml(writingError.message)}`);
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
    return AIAnswerRunner.retry(async () => {
        const text = await AIApi.getAnswers(questions, config);
        return AIApi.parseAnswers(text, questions);
      }, maxRetries, null, (err, attempt) => {
        const start = questions[0].index;
        const end = questions[questions.length - 1].index;
        AINotify.warning(`第 ${start}–${end} 题请求失败，准备第 ${attempt} 次重试：${this.escapeHtml(err.message)}`);
      });
  },

  normalizeText(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim();
  },

  async isAutoApplyEnabled() {
    const data = await chrome.storage.local.get('autoApplyAnswers');
    return data.autoApplyAnswers === true;
  },

  async collectQuestions() {
    const result = await QuestionCollector.collectLive();
    if (result.status !== 'stable') throw new Error(QuestionReport.message(result.diagnostics));
    return result.sections.flatMap(section => section.questions).map((question, index) => ({ ...question, index: index + 1 }));
  },

  parseQuestionContainer(container, docRef, sectionHeader) {
    if (!this.questionIds.has(container)) this.questionIds.set(container, `q${this.nextQuestionId++}`);
    const fillTargets = this.extractFillTargets(container);
    const shortAnswerTargets = fillTargets.length === 0 ? this.extractShortAnswerTargets(container) : [];
    const dropdown = DropdownQuestions.extract(container);
    const options = dropdown?.options || this.extractOptions(container);
    const type = this.detectQuestionType(container, fillTargets, shortAnswerTargets, options);
    const title = this.extractQuestionTitle(container);

    if (!title) {
      return null;
    }

    const programTarget = type === 'programming' ? this.findProgramTarget(container, [...shortAnswerTargets, ...fillTargets]) : null;
    const readContent = programTarget ? this.readProgramContent(programTarget) : null;
    const answerDraft = readContent ?? '';
    const choiceTargets = this.extractChoiceTargets(container);
    const existingAnswer = type === 'programming' ? answerDraft :
      type === 'fill_blank' ? fillTargets.map(target => this.readExistingEditor(target)) :
      type === 'short_answer' ? shortAnswerTargets.map(target => this.readExistingEditor(target)) :
      type === 'sorting' || type === 'matching' ? DropdownQuestions.getTargets(container, type)
        .map(target => target.select?.value ?? this.normalizeText(target.span?.textContent || '')) :
      choiceTargets.filter(target => target.input?.checked || target.marker?.classList.contains(target.selectedClass))
        .map(target => target.letter);
    return {
      id: this.questionIds.get(container),
      exam: this.isExamQuestion({ container }),
      title,
      sectionHeader,
      ...QuestionContainers.describe(container),
      type,
      blankCount: fillTargets.length,
      options,
      fillTargets,
      shortAnswerTargets,
      programTarget,
      answerDraft,
      existingAnswer,
      codeStatus: type === 'programming' ? (readContent !== null ? 'read' : 'unavailable') : undefined,
      choiceTargets,
      ...(dropdown || {}),
      container,
      docRef
    };
  },

  detectQuestionType(container, fillTargets, shortAnswerTargets, options) {
    const dropdownType = DropdownQuestions.detectType(container);
    if (dropdownType) return dropdownType;
    const typeText = this.normalizeText(
      QuestionContainers.typeLabel(container)
    );

    const answerCode = container.querySelector('.stem_answer pre, .Answer pre, .stem_answer code, .Answer code, .stem_answer textarea, .Answer textarea');
    const source = answerCode?.value || answerCode?.textContent || '';
    if (/程序|编程|代码/.test(typeText) || container.querySelector('.CodeMirror, .cm-editor, .monaco-editor') ||
        /#\s*include\s*<|\bint\s+main\s*\(|\bpublic\s+static\s+void\s+main\s*\(|\bdef\s+\w+\s*\(/.test(source)) {
      return 'programming';
    }

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
    return QuestionContainers.describe(container).title;
  },

  findProgramTarget(container, shortAnswerTargets = []) {
    const editor = container.querySelector('.CodeMirror, .cm-editor, .monaco-editor');
    if (editor) return { kind: 'code', element: editor, container };
    const target = shortAnswerTargets[0];
    if (target) return { kind: 'rich', ...target, container };
    const textarea = container.querySelector('.stem_answer textarea, .Answer textarea');
    if (textarea) return { kind: 'text', textarea, container };
    const pre = container.querySelector('.stem_answer pre, .Answer pre, .stem_answer code, .Answer code');
    if (pre) return { kind: 'pre', element: pre, container };
    return null;
  },

  readProgramContent(target) {
    if (!target) return null;
    if (target.kind === 'code') {
      const element = target.element;
      delete element.dataset.cxCodeValue;
      element.dispatchEvent(new Event('CX_CODE_EDITOR_READ', { bubbles: true }));
      const value = element.dataset.cxCodeValue;
      delete element.dataset.cxCodeValue;
      return value ?? null;
    }
    if (target.kind === 'pre') return target.element.textContent || '';
    if (target.kind === 'text') return target.textarea.value || '';
    let body;
    try { body = target.iframe?.contentDocument?.body; } catch (_) { body = null; }
    if (body) return this.readCodeText(body);
    const value = target.textarea?.value || '';
    if (/<(?:p|div|br|pre)\b/i.test(value)) {
      const parsed = new DOMParser().parseFromString(value, 'text/html');
      return this.readCodeText(parsed.body);
    }
    return value;
  },

  readCodeText(root) {
    if (root.children.length === 1 && root.firstElementChild.tagName === 'PRE') {
      return root.firstElementChild.textContent || '';
    }
    const clone = root.cloneNode(true);
    clone.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
    clone.querySelectorAll('p, div').forEach(node => node.append('\n'));
    return clone.textContent.replace(/\n$/, '');
  },

  readExistingEditor(target) {
    let body;
    try { body = target.iframe?.contentDocument?.body; } catch (_) { body = null; }
    if (body) return this.readCodeText(body);
    return target.textarea?.value || target.inputDiv?.textContent || '';
  },

  writeProgramContent(target, value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    if (target.kind === 'code') {
      const element = target.element;
      element.dataset.cxCodeWrite = value;
      delete element.dataset.cxCodeWritten;
      element.dispatchEvent(new Event('CX_CODE_EDITOR_WRITE', { bubbles: true }));
      const written = element.dataset.cxCodeWritten === 'true';
      delete element.dataset.cxCodeWrite;
      delete element.dataset.cxCodeWritten;
      if (!written) throw new Error('此代码编辑器暂不支持安全写入，请手动复制答案');
      return true;
    }
    if (target.kind === 'pre') throw new Error('答题区代码不可编辑，请手动复制答案');
    if (target.kind === 'text') {
      target.textarea.value = value;
      this.dispatchChoiceEvents(target.textarea);
      return true;
    }
    const html = `<pre style="white-space:pre-wrap">${this.escapeHtml(value)}</pre>`;
    const ue = this.getUeEditorInstance(target.textarea?.id);
    if (ue?.setContent) ue.setContent(html, false);
    if (target.iframe?.contentDocument?.body) target.iframe.contentDocument.body.innerHTML = html;
    if (target.textarea) {
      target.textarea.value = html;
      this.dispatchChoiceEvents(target.textarea);
    }
    return Boolean(ue || target.iframe || target.textarea);
  },

  extractOptions(container) {
    return QuestionContainers.options(container);
  },

  extractFillTargets(container) {
    if (/简答|程序|编程|代码/.test(QuestionContainers.typeLabel(container))) return [];
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
        const textarea = answerDiv.querySelector('textarea[id^="answerEditor"], textarea');
        const editorRoot = answerDiv.querySelector('.edui-editor') || answerDiv;
        const iframe = answerDiv.querySelector('iframe[id^="ueditor"]');
        
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
    const nodes = Array.from(container.querySelectorAll('textarea[id^="answerEditor"], textarea[id^="answer"]:not([id^="answertype"]), .stem_answer textarea, .stem_answer2 textarea, iframe[id^="ueditor"], .InpDIV'));
    const roots = [...new Set(nodes.map(node => node.closest('.Answer, .textDIV, .eidtDiv, .blankItemDiv') || node.closest('.edui-editor') || node.parentElement))];
    return roots.map((root, index) => this.createEditorTarget(root, index, root.querySelector('textarea')))
      .filter(target => target && !target.blankItemDiv);
  },

  createEditorTarget(root, index, forcedTextarea) {
    if (!root) {
      return null;
    }

    const textarea = forcedTextarea || root.querySelector('textarea[id^="answerEditor"], textarea[id^="answer"]:not([id^="answertype"])');
    const iframe = root.querySelector('[id$="_iframeholder"] iframe, iframe[id^="ueditor"]');
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
    const items = QuestionContainers.optionNodes(container);
    return items.map((item, index) => {
      const fallbackLetter = String.fromCharCode(65 + index);
      const marker = item.querySelector('.num_option, .num_option_dx, span[data]');
      const markerText = this.normalizeText(marker?.textContent || '');
      // 优先使用 data 属性作为实际值，显示文本作为字母标识
      const dataValue = marker?.getAttribute('data');
      const letter = (markerText.match(/[A-Z]/i)?.[0] || fallbackLetter).toUpperCase();
      const input = item.querySelector('input[type="radio"], input[type="checkbox"]');
      const clickable = item.querySelector('label, a, .num_option, .answer_p') || item;
      const qid = item.getAttribute('qid') || marker?.getAttribute('qid') || container.getAttribute('data')
        || container.id?.match(/(\d+)$/)?.[1] || '';
      const answerNames = qid ? new Set([`answer${qid}`, `answers${qid}`]) : null;
      const answerFields = Array.from(container.querySelectorAll('input, textarea')).filter(field =>
        !['radio', 'checkbox'].includes(field.type) && !/^answertype/i.test(field.name || field.id || ''));
      const answerInput = answerNames
        ? answerFields.find(field => answerNames.has(field.name) || answerNames.has(field.id)) || null
        : answerFields.filter(field => /^answers?\d*$/i.test(field.name || field.id || '')).length === 1
          ? answerFields.find(field => /^answers?\d*$/i.test(field.name || field.id || '')) : null;

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

  async applyAnswers(questions, answers, options = {}) {
    let appliedCount = 0;
    let skippedCount = 0;
    let savedCount = 0;

    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      const answer = answers[index];
      try {
        if (answer?.error) throw new Error(answer.error);
        const applied = question.remote
          ? await AIChat.applyRemote(question, AIChat.snapshot(question), answer, options)
          : await this.applyAnswerToQuestion(question, answer, options);
        if (applied.ok) {
          appliedCount += 1;
          if (question.exam) savedCount += 1;
        } else {
          skippedCount += 1;
          AINotify.warning(`题目${question.index || index + 1}未写入：${this.escapeHtml(applied.message || applied.status || '缺少可用控件')}`);
        }
      } catch (err) {
        if (err.examSaveError) throw Object.assign(err, { appliedCount, skippedCount: skippedCount + 1, savedCount });
        skippedCount += 1;
        AINotify.warning(`题目${question.index || index + 1}未完成填写：${this.escapeHtml(err.message)}`);
      }
    }

    return { appliedCount, skippedCount, savedCount };
  },

  async applyAnswerToQuestion(question, answer, options = {}) {
    const expected = question.type === 'single_choice' || question.type === 'multiple_choice'
      ? AIFillChoice.expected(question, answer)
      : question.type === 'fill_blank' || question.type === 'short_answer' || question.type === 'programming'
        ? AIFillEditor.expected(question, answer) : answer.answers || answer.pairs;
    if (!this.isExamQuestion(question)) {
      const previous = AIFillVerify.current(question);
      try {
        const written = await this.writeAnswerToQuestion(question, answer);
        const actual = written ? AIFillVerify.current(question) : null;
        if (written) return AIFillVerify.result(true, 'written', expected, actual);
        return AIFillVerify.result(false, 'unsupported', expected, actual,
          await AIFillVerify.restore(question, previous));
      } catch (error) {
        const rolledBack = await AIFillVerify.restore(question, previous);
        const status = /已变化|失效|拒绝覆盖/.test(error.message) ? 'stale' : 'verification_failed';
        return { ...AIFillVerify.result(false, status, expected, AIFillVerify.current(question), rolledBack),
          message: error.message };
      }
    }
    let written = false;
    const apply = this.examSaveQueue.then(async () => {
      options.signal?.throwIfAborted();
      const applied = await this.writeAnswerToQuestion(question, answer);
      if (!applied) throw new Error('未找到可写入的答案控件');
      written = true;
      await this.saveExamAnswer(question, options);
      return AIFillVerify.result(true, 'saved', expected, AIFillVerify.current(question));
    });
    this.examSaveQueue = apply.catch(() => {});
    try { return await apply; }
    catch (error) {
      throw Object.assign(new Error(`题目 ${question.index || ''} ${written ? '已填写但暂存未确认' : '填写前检查失败'}：${error.message}`), {
        examSaveError: true, name: error.name
      });
    }
  },

  async writeAnswerToQuestion(question, answer) {
    if (!question || !answer) {
      return false;
    }

    if (!question.container?.isConnected) throw new Error('题目已变化，请刷新题目列表');
    if (question.docRef) {
      const current = this.parseQuestionContainer(question.container, question.docRef, question.sectionHeader);
      if (!current || current.id !== question.id || current.title !== question.title || !QuestionContainers.sameContext(current, question) ||
          current.type !== question.type || JSON.stringify(current.options) !== JSON.stringify(question.options) ||
          JSON.stringify(current.existingAnswer) !== JSON.stringify(question.existingAnswer)) {
        throw new Error('题目内容已变化，请刷新题目列表');
      }
    }
    if (question.editorState !== undefined && typeof AIChat !== 'undefined' &&
        AIChat.editorState(question) !== question.editorState) {
      throw new Error('答题区内容已变化，已拒绝覆盖');
    }
    if (question.type === 'programming') {
      const current = this.readProgramContent(question.programTarget);
      if (!question.programTarget || current !== question.answerDraft) {
        throw new Error('答题区代码已变化或无法读取，已拒绝覆盖');
      }
      const written = this.writeProgramContent(question.programTarget, answer.answer);
      if (written && this.readProgramContent(question.programTarget) !== answer.answer) {
        throw new Error('程序题写入内容校验失败');
      }
      return written;
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
    if (!sorting && targets.every(target => target.select)) {
      return this.applyNativeMatchingAnswer(question, answer, targets, hidden, qid);
    }

    // Resolve every choice before clicking anything, including shuffled internal IDs.
    const choices = targets.map((target, index) => {
      const label = sorting ? answer.answers[index] : answer.pairs.find(pair => pair.left === target.left)?.right;
      const prefix = sorting ? 'sortSelect' : 'connlineSelect';
      const homeworkControl = target.span?.classList.contains(`${prefix}${qid}`);
      const examControl = !homeworkControl && target.span?.classList.contains('select') && target.span.getAttribute('dataid') === qid;
      if (!homeworkControl && !examControl) throw new Error('无法识别下拉框答案控件');
      const candidates = Array.from(target.box.querySelectorAll('ul.options > li'))
        .filter(item => DropdownQuestions.text(item.querySelector('a')?.textContent) === label &&
          (item.getAttribute('qid') === qid || (examControl && !item.hasAttribute('qid'))) &&
          (item.getAttribute('qtype') === (sorting ? '13' : '11') || (examControl && !item.hasAttribute('qtype'))));
      if (candidates.length !== 1) throw new Error(`找不到唯一的下拉选项 ${label}`);
      const item = candidates[0];
      const value = item.getAttribute('data');
      if (!value) throw new Error('下拉选项缺少内部值');
      const name = target.span.getAttribute('data');
      if (!sorting && !/^\d+$/.test(name || '')) throw new Error('连线控件缺少有效内部编号');
      return { ...target, item, label, value, name, examControl };
    });
    if (!sorting && new Set(choices.map(choice => choice.name)).size !== expectedCount) {
      throw new Error('连线控件内部编号重复');
    }

    for (const choice of choices) {
      if (!choice.item.isConnected) throw new Error('填写时控件已失效，请重新提取题目');
      if (this.isExamQuestion(question)) {
        choice.span.setAttribute('value', choice.value);
        choice.span.textContent = choice.label;
      } else choice.item.click();
    }
    if (choices.some(choice => choice.span.getAttribute('value') !== choice.value ||
        DropdownQuestions.text(choice.span.textContent) !== choice.label)) {
      throw new Error('下拉框显示或选中值未更新，请检查页面');
    }
    if (choices.every(choice => choice.examControl)) {
      hidden.value = sorting ? choices.map(choice => choice.value).join('') : JSON.stringify(choices
        .map(choice => ({ name: Number(choice.name), content: choice.value })).sort((a, b) => a.name - b.name));
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
      if (!Array.isArray(saved) || saved.length !== expected.length || saved.some(entry => !entry || !/^\d+$/.test(String(entry.name)) || typeof entry.content !== 'string') ||
          canonical(saved.map(entry => ({ ...entry, name: String(entry.name) }))) !== canonical(expected)) {
        throw new Error('连线配对与答案字段不一致，请检查页面');
      }
    }
    return true;
  },

  applyNativeMatchingAnswer(question, answer, targets, hidden, qid) {
    // Legacy chapter homework uses native selects decorated with Chosen.
    // Its submit serializer reads select's value attribute and lineOption's index.
    const choices = targets.map(target => {
      const label = answer.pairs.find(pair => pair.left === target.left)?.right;
      const matches = Array.from(target.select.options).filter(option => DropdownQuestions.text(option.textContent) === label);
      if (matches.length !== 1 || !/^\d+$/.test(target.name || '')) throw new Error('连线下拉选项或内部编号无效');
      const option = matches[0];
      const chosen = target.box.querySelector('.chosen-container');
      if (chosen && !chosen.querySelector('.chosen-single')) throw new Error('连线下拉控件未准备好，请刷新题目');
      if (target.select.disabled || option.disabled) throw new Error('连线选项不可写入');
      return { ...target, option, chosen, label };
    });
    if (new Set(choices.map(choice => choice.name)).size !== choices.length) throw new Error('连线控件内部编号重复');
    for (const choice of choices) {
      if (choice.chosen) {
        // Use Chosen's original handler to keep the native select and visible UI in sync.
        choice.box.querySelector('.chosen-single')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        // Chosen builds its results lazily on opening and selects the highlighted row.
        const item = choice.chosen.querySelector(`.chosen-results li[data-option-array-index="${choice.option.index}"]`);
        if (!item) throw new Error('连线下拉选项未加载，请刷新题目');
        item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      } else {
        choice.select.value = choice.option.value;
      }
      if (choice.select.value !== choice.option.value) throw new Error('连线下拉框未更新，请重新尝试');
      choice.select.setAttribute('value', choice.option.value);
      this.dispatchChoiceEvents(choice.select);
    }
    hidden.value = JSON.stringify(choices.map(choice => ({ name: choice.name, content: choice.option.value }))
      .sort((a, b) => Number(a.name) - Number(b.name)));
    const typeInput = question.container.querySelector(`#answertype${qid}`);
    if (typeInput) typeInput.value = '11';
    this.dispatchChoiceEvents(hidden);
    return true;
  },

  async applyFillBlankAnswer(question, answer) {
    if (!question.fillTargets.length || !Array.isArray(answer.answers) ||
        answer.answers.length !== question.fillTargets.length || answer.answers.some(value => !String(value || '').trim())) {
      return false;
    }

    const written = question.fillTargets.map((target, index) => this.writeEditorContent(target, answer.answers[index]));
    if (written.some(result => !result)) throw new Error('部分填空未能写入，已拒绝标记整题成功');
    if (question.fillTargets.some((target, index) => !AIFillEditor.matches(target, answer.answers[index]))) {
      throw new Error('部分填空写入内容校验失败');
    }
    return true;
  },

  async applyShortAnswer(question, answer) {
    const target = question.shortAnswerTargets[0];
    if (!target || !answer.answer) {
      return false;
    }

    const written = this.writeEditorContent(target, answer.answer);
    if (written && !AIFillEditor.matches(target, answer.answer)) throw new Error('简答题写入内容校验失败');
    return written;
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

    if (selectedLetters.some(letter => !question.choiceTargets.some(target => target.letter === letter))) throw new Error('答案包含无法识别的选项');
    if (!this.isExamQuestion(question)) {
      const selectedSet = new Set(selectedLetters);
      for (const target of question.choiceTargets) {
        if (this.isChoiceSelected(target) === selectedSet.has(target.letter)) continue;
        const clickTarget = target.clickable || target.item;
        if (clickTarget && typeof clickTarget.click === 'function') clickTarget.click();
      }
      if (await this.waitForChoiceState(question, selectedLetters, 2)) return true;
    }

    this.syncChoiceTargets(question, selectedLetters);
    if (!await this.waitForChoiceState(question, selectedLetters, 5)) {
      const actual = this.selectedChoiceLetters(question);
      throw new Error(`选项写入未确认：期望 ${selectedLetters.join('')}，实际 ${actual.join('') || '空'}`);
    }
    return true;
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

  selectedChoiceLetters(question) {
    return question.choiceTargets.filter(target => this.isChoiceSelected(target)).map(target => target.letter).sort();
  },

  choiceAnswerInput(question) {
    const container = question.container;
    const qids = [container.getAttribute('data'), container.id?.match(/(\d+)$/)?.[1],
      ...question.choiceTargets.flatMap(target => [target.item?.getAttribute('qid'), target.marker?.getAttribute('qid')])]
      .filter(Boolean);
    const names = new Set(qids.flatMap(qid => [`answer${qid}`, `answers${qid}`]));
    const fields = Array.from(container.querySelectorAll('input, textarea')).filter(field =>
      !['radio', 'checkbox'].includes(field.type) && !/^answertype/i.test(field.name || field.id || ''));
    const exact = fields.find(field => names.has(field.name) || names.has(field.id));
    if (exact) return exact;
    const candidates = fields.filter(field => /^answers?\d*$/i.test(field.name || field.id || ''));
    return candidates.length === 1 ? candidates[0] : null;
  },

  choiceAnswerValue(question, selectedLetters) {
    const selectedSet = new Set(selectedLetters);
    const selectedTargets = question.choiceTargets.filter(target => selectedSet.has(target.letter));
    return question.type === 'single_choice' ? String(selectedTargets[0]?.value || '') : selectedTargets
      .map(target => String(target.value || '').trim().toUpperCase()).filter(Boolean).sort().join('');
  },

  choiceStateMatches(question, selectedLetters) {
    const expected = [...selectedLetters].sort();
    if (JSON.stringify(this.selectedChoiceLetters(question)) !== JSON.stringify(expected)) return false;
    const answerInput = this.choiceAnswerInput(question);
    if (this.isExamQuestion(question) && !answerInput) return false;
    return !answerInput || String(answerInput.value || '') === this.choiceAnswerValue(question, selectedLetters);
  },

  async waitForChoiceState(question, selectedLetters, attempts) {
    for (let attempt = 0; attempt <= attempts; attempt += 1) {
      if (this.choiceStateMatches(question, selectedLetters)) return true;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
    }
    return false;
  },

  syncChoiceTargets(question, selectedLetters) {
    const selectedSet = new Set(selectedLetters);
    let updated = false;
    const selectedTargets = question.choiceTargets.filter(target => selectedSet.has(target.letter));
    const answerInput = this.choiceAnswerInput(question) || selectedTargets[0]?.answerInput;
    if (this.isExamQuestion(question) && !answerInput) throw new Error('未找到原生选择题答案字段');

    const changedInputs = [];
    question.choiceTargets.forEach(target => {
      const shouldSelect = selectedSet.has(target.letter);

      if (target.input && target.input.checked !== shouldSelect) {
        target.input.checked = shouldSelect;
        changedInputs.push(target.input);
        updated = true;
      }

      if (target.marker) {
        const selectedClass = target.selectedClass || 'check_answer';
        if (target.marker.classList.contains(selectedClass) !== shouldSelect) {
          target.marker.classList.toggle(selectedClass, shouldSelect);
          updated = true;
        }
      }

      if (target.item) {
        if (shouldSelect) {
          if (target.item.getAttribute('aria-checked') !== 'true') target.item.setAttribute('aria-checked', 'true');
          if (target.item.getAttribute('aria-pressed') !== 'true') target.item.setAttribute('aria-pressed', 'true');
        } else {
          target.item.removeAttribute('aria-checked');
          target.item.removeAttribute('aria-pressed');
        }
      }
    });

    // Dispatch after every checkbox/radio has its final state so page handlers never serialize a partial multi-select answer.
    changedInputs.forEach(input => this.dispatchChoiceEvents(input));

    if (answerInput) {
      const answerValue = this.choiceAnswerValue(question, selectedLetters);

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

FK.ai.fill.main = AIAnswerCore;
