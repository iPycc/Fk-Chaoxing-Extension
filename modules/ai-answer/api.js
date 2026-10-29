// OpenAI-compatible AI API
const AIApi = {
  DEFAULT_CONFIG: {
    profileId: 'default',
    profileName: '默认模型',
    baseUrl: 'https://api.openai.com/v1',
    path: '/chat/completions',
    apiKey: '',
    model: ''
  },

  buildPrompt(questions) {
    const payload = {
      questions: questions.map((question, index) => ({
        questionIndex: index + 1,
        pageIndex: question.index || index + 1,
        type: question.type,
        title: question.title,
        parentTitle: question.parentTitle || '',
        subquestionId: question.subquestionId || '',
        subquestionNumber: question.subquestionNumber || '',
        images: [...(question.parentImages || []), ...(question.images || [])],
        blankCount: question.blankCount || 0,
        options: Array.isArray(question.options) ? question.options : [],
        existingAnswer: question.existingAnswer ?? null,
        ...(question.type === 'programming' ? { answerDraft: question.answerDraft || '', codeStatus: question.codeStatus || 'unavailable' } : {}),
        ...(question.type === 'matching' ? { matchingGroups: question.matchingGroups } : {})
      }))
    };

    return `题目数据如下：\n${JSON.stringify(payload, null, 2)}`;
  },

  requestText(request) {
    if (request.mode !== 'chat') {
      const keys = new Set(request.target.map(q => `${q.index}:${q.id}`));
      const extra = request.context.filter(q => !keys.has(`${q.index}:${q.id}`));
      return `${this.buildPrompt(request.target)}\n\n辅助题目上下文：\n${JSON.stringify(extra, null, 2)}\n\n` +
        (request.mode === 'extract' ? '请整理讨论中已确定的答案。' : '请解答作答目标。');
    }
    const indices = keys => keys.map(key => key.split(':')[0]).join('、');
    const referenceKeys = request.referenceKeys || request.context.map(q => `${q.index}:${q.id}`);
    return [
      ...(referenceKeys.length ? [`本轮引用：第 ${indices(referenceKeys)} 题。`] : []),
      ...(request.addedKeys?.length ? [`本轮加入资料：第 ${indices(request.addedKeys)} 题。`] : []),
      ...(request.updatedKeys?.length ? [`本轮更新资料：第 ${indices(request.updatedKeys)} 题，以最新题目资料为准。`] : []),
      ...(request.focusKeys?.length ? [`最近引用范围：第 ${indices(request.focusKeys)} 题；具体讨论对象以用户输入为准。`] : []),
      `本轮输入：\n${request.input || '仅加入题目资料，暂不解答。'}`
    ].join('\n');
  },

  buildMessages(config, request, history = []) {
    const system = { role: 'system', content: AIConfig.buildSystemPrompt(config, request.mode) };
    if (request.mode === 'chat') {
      return [system,
        ...(request.context.length ? [{ role: 'user', content: this.withImages(
          `当前对话已加入的题目资料（每题仅列一次；历史引用按页面题号对应）：\n${JSON.stringify(request.context, null, 2)}`, request.context) }] : []),
        ...history, { role: 'user', content: this.requestText(request) }];
    }
    return [system, ...history, { role: 'user', content: this.withImages(this.requestText(request), request.context) }];
  },

  withImages(text, questions = []) {
    const content = [{ type: 'text', text }];
    const seen = new Set();
    questions.forEach((question, index) => {
      [...(question.parentImages || []), ...(question.images || [])].forEach(image => {
        if (!image?.url || seen.has(image.url)) return;
        if (!/^https?:\/\//i.test(image.url) && !/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(image.url)) return;
        seen.add(image.url);
        content.push({ type: 'text', text: `第 ${question.index || index + 1} 题引用图片：${image.alt || '题目图片'}（相同 URL 的图片可供其他子题共同引用）` });
        content.push({ type: 'image_url', image_url: { url: image.url } });
      });
    });
    return content.length > 1 ? content : text;
  },

  normalizeConfig(config = {}) {
    return AIConfig.normalize({ ...this.DEFAULT_CONFIG, ...config, path: config.path || AIConfig.defaultPath(config.apiType) });
  },

  async loadConfig() {
    const data = await chrome.storage.local.get(['aiProfiles', 'activeAiProfileId', 'aiConfig']);
    const profiles = Array.isArray(data.aiProfiles) ? data.aiProfiles : [];
    const activeProfile = profiles.find(profile => profile.id === data.activeAiProfileId) || profiles[0] || data.aiConfig || {};
    return this.normalizeConfig(activeProfile);
  },

  validateConfig(config) {
    if (!config.baseUrl) {
      throw new Error('请先配置 AI API 地址');
    }
    if (!config.apiKey) {
      throw new Error('请先配置 AI API 密钥');
    }
    if (!config.model) {
      throw new Error('请先配置模型 ID');
    }
  },

  async getAnswers(questions, requestConfig, conversationReply = '', relatedOnly = false) {
    const config = requestConfig ? this.normalizeConfig(requestConfig) : await this.loadConfig();
    const request = { mode: relatedOnly ? 'extract' : 'answer', context: questions, target: questions };
    const history = conversationReply ? [{ role: 'user', content: `讨论记录：\n${conversationReply}` }] : [];
    this.validateConfig(config);
    const timeoutSeconds = config.timeoutSeconds ?? (await AIConfig.loadBatchSettings()).timeoutSeconds;

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'AI_API_REQUEST',
        data: {
          config,
          timeoutSeconds,
          messages: this.buildMessages(config, request, history)
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          const error = new Error(chrome.runtime.lastError.message);
          error.retryable = true;
          reject(error);
          return;
        }
        if (response && response.success) {
          resolve(response.data);
        } else {
          const error = new Error(response?.error || 'AI API 请求失败');
          error.retryable = response?.retryable === true || !response;
          error.contextLimit = response?.contextLimit === true;
          reject(error);
        }
      });
    });
  },

  stripCodeFence(text = '') {
    const trimmed = String(text || '').trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : trimmed;
  },

  normalizeChoiceLetter(value = '') {
    const text = String(value || '').trim().toUpperCase();
    const match = text.match(/[A-Z]/);
    return match ? match[0] : '';
  },

  normalizeChoiceLetters(value) {
    if (Array.isArray(value)) {
      return Array.from(new Set(value.map(item => this.normalizeChoiceLetter(item)).filter(Boolean)));
    }

    const text = String(value || '').toUpperCase();
    const letters = text.match(/[A-Z]/g) || [];
    return Array.from(new Set(letters));
  },

  normalizeAnswerEntry(entry = {}, question, index) {
    const base = {
      questionIndex: index + 1,
      type: question.type
    };

    switch (question.type) {
      case 'sorting':
      case 'matching': {
        const normalized = question.type === 'sorting'
          ? { ...base, answers: Array.isArray(entry.answers) ? entry.answers.map(value => String(value ?? '').trim().toUpperCase()) : [] }
          : { ...base, pairs: Array.isArray(entry.pairs) ? entry.pairs.map(pair => ({
              left: String(pair?.left ?? '').trim(),
              right: String(pair?.right ?? '').trim().toUpperCase()
            })) : [] };
        const error = DropdownQuestions.validateAnswer(question, normalized);
        return error ? { ...normalized, error } : normalized;
      }
      case 'fill_blank': {
        const answers = Array.isArray(entry.answers)
          ? entry.answers.map(item => String(item ?? '').trim())
          : [String(entry.answer ?? '').trim()].filter(Boolean);
        const normalized = answers.slice(0, question.blankCount || answers.length);
        while (normalized.length < (question.blankCount || 0)) {
          normalized.push('');
        }
        return { ...base, answers: normalized };
      }

      case 'multiple_choice': {
        const answers = this.normalizeChoiceLetters(entry.answers || entry.answer);
        return { ...base, answers };
      }

      case 'single_choice': {
        const answer = this.normalizeChoiceLetter(entry.answer || entry.answers?.[0]);
        return { ...base, answer };
      }

      case 'programming':
        return { ...base, answer: String(entry.answer ?? entry.answers?.[0] ?? '') };
      case 'short_answer':
      default:
        return {
          ...base,
          answer: String(entry.answer ?? entry.answers?.[0] ?? '').trim()
        };
    }
  },

  choiceLabels(question) {
    return (question.options || []).map((option, index) =>
      String(option).match(/^\s*([A-Z])[.、．]/i)?.[1]?.toUpperCase() || String.fromCharCode(65 + index));
  },

  validateAnswer(answer, question) {
    if (answer.error) return answer.error;
    const labels = this.choiceLabels(question);
    if (question.type === 'single_choice') {
      return labels.includes(answer.answer) ? '' : '单选答案不在题目选项中';
    }
    if (question.type === 'multiple_choice') {
      if (!Array.isArray(answer.answers) || !answer.answers.length) return '多选答案为空';
      if (new Set(answer.answers).size !== answer.answers.length) return '多选答案包含重复选项';
      return answer.answers.every(value => labels.includes(value)) ? '' : '多选答案包含题目中不存在的选项';
    }
    if (question.type === 'fill_blank') {
      return Array.isArray(answer.answers) && answer.answers.length === question.blankCount && answer.answers.every(Boolean)
        ? '' : '填空答案数量不完整';
    }
    if (question.type === 'sorting' || question.type === 'matching') {
      return DropdownQuestions.validateAnswer(question, answer) || '';
    }
    return typeof answer.answer === 'string' && answer.answer.trim() ? '' : '答案为空';
  },

  parseAnswers(responseText, questions) {
    const raw = this.stripCodeFence(responseText);
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const error = new Error('AI 返回内容不是合法 JSON');
      error.retryable = true;
      throw error;
    }

    const answerList = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const indices = answerList.map(item => Number(item?.questionIndex));
    if (indices.length !== questions.length || new Set(indices).size !== questions.length ||
        indices.some(index => !Number.isInteger(index) || index < 1 || index > questions.length)) {
      const error = new Error('AI 返回的题号不完整或重复');
      error.retryable = true;
      throw error;
    }

    const answers = questions.map((question, index) => {
      const entry = answerList.find(item => Number(item?.questionIndex) === index + 1) || {};
      return this.normalizeAnswerEntry(entry, question, index);
    });
    const invalid = answers.map((answer, index) => this.validateAnswer(answer, questions[index])).find(Boolean);
    if (invalid) {
      const error = new Error(`AI 返回的答案不完整或无效：${invalid}`);
      error.retryable = true;
      throw error;
    }
    return answers;
  }
};
