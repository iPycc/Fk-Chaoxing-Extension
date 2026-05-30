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

  // prompt
  buildPrompt(questions) {
    let prompt = '请根据以下题目给出答案。对于选择题，直接给出正确选项字母；对于其他题型，给出简洁答案。\n\n';
    
    questions.forEach((q, idx) => {
      prompt += `【题目${idx + 1}】${q.title}\n`;
      if (q.options && q.options.length > 0) {
        q.options.forEach(opt => {
          prompt += `${opt}\n`;
        });
      }
      prompt += '\n';
    });
    
    prompt += '\n请按以下格式回答，每题一行：\n';
    prompt += '1. [答案]\n2. [答案]\n...';
    
    return prompt;
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

  // 通过 Background 调用 OpenAI-compatible API
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
              content: '你是一个专业的答题助手。请直接给出答案，选择题只需给出选项字母，简答题给出简洁准确的答案。'
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

  // 解析 AI 返回的答案
  parseAnswers(responseText, questionCount) {
    const answers = [];
    const lines = responseText.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const match = line.match(/^(?:【题目)?(\d+)[.、】\s]*(.+)$/);
      if (match) {
        const idx = parseInt(match[1]) - 1;
        const answer = match[2].trim();
        if (idx >= 0 && idx < questionCount) {
          answers[idx] = answer;
        }
      }
    }
    
    for (let i = 0; i < questionCount; i++) {
      if (!answers[i]) {
        answers[i] = '未能解析答案';
      }
    }
    
    return answers;
  }
};
