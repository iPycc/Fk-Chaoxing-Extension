// OpenAI-compatible AI API
const AIApi = {
  DEFAULT_CONFIG: {
    profileId: 'default',
    profileName: '默认模型',
    baseUrl: 'https://api.openai.com/v1',
    path: '/chat/completions',
    apiKey: '',
    model: '',
    temperature: 0.3
  },

  buildPrompt(questions) {
    const payload = {
      questions: questions.map((question, index) => ({
        questionIndex: index + 1,
        type: question.type,
        title: question.title,
        blankCount: question.blankCount || 0,
        options: Array.isArray(question.options) ? question.options : []
      }))
    };

    return [
      '你是超星答题助手，请严格按照要求返回 JSON。',
      '只允许输出一个 JSON 对象，不要输出 Markdown 代码块，不要输出解释文字。',
      '返回格式如下：',
      '{',
      '  "answers": [',
      '    { "questionIndex": 1, "type": "fill_blank", "answers": ["答案1", "答案2"] },',
      '    { "questionIndex": 2, "type": "single_choice", "answer": "A" },',
      '    { "questionIndex": 3, "type": "multiple_choice", "answers": ["A", "C"] },',
      '    { "questionIndex": 4, "type": "short_answer", "answer": "简洁答案" }',
      '  ]',
      '}',
      '',
      '答题约束：',
      '- `fill_blank` 必须返回 `answers` 数组，数组长度必须等于 blankCount。',
      '- `single_choice` 必须返回 `answer` 字段，只能是单个大写选项字母，例如 A。',
      '- `multiple_choice` 必须返回 `answers` 数组，数组元素必须是大写选项字母。',
      '- `short_answer` 必须返回 `answer` 字段，内容简洁直接，不要带题号。',
      '- 如果无法确定，请尽量给出最可能答案，但仍然必须遵守 JSON 结构。',
      '',
      '题目数据如下：',
      JSON.stringify(payload, null, 2)
    ].join('\n');
  },

  normalizeConfig(config = {}) {
    const merged = { ...this.DEFAULT_CONFIG, ...config };
    merged.baseUrl = (merged.baseUrl || '').trim().replace(/\/+$/, '');
    merged.path = (merged.path || '/chat/completions').trim();
    if (!merged.path.startsWith('/')) {
      merged.path = `/${merged.path}`;
    }
    merged.apiKey = (merged.apiKey || '').trim();
    merged.model = (merged.model || '').trim();
    merged.temperature = Number.isFinite(Number(merged.temperature)) ? Number(merged.temperature) : this.DEFAULT_CONFIG.temperature;
    return merged;
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

  async getAnswers(questions) {
    const prompt = this.buildPrompt(questions);
    const config = await this.loadConfig();
    this.validateConfig(config);

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'AI_API_REQUEST',
        data: {
          config,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的超星答题助手。你必须严格返回 JSON 对象，禁止输出代码块、解释、前后缀文本。'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response && response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'AI API 请求失败'));
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

      case 'short_answer':
      default:
        return {
          ...base,
          answer: String(entry.answer ?? entry.answers?.[0] ?? '').trim()
        };
    }
  },

  parseAnswers(responseText, questions) {
    const raw = this.stripCodeFence(responseText);
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error('AI 返回内容不是合法 JSON');
    }

    const answerList = Array.isArray(parsed?.answers) ? parsed.answers : [];

    return questions.map((question, index) => {
      const entry = answerList.find(item => Number(item?.questionIndex) === index + 1) || {};
      return this.normalizeAnswerEntry(entry, question, index);
    });
  }
};
