// Shared configuration for the popup, content scripts and background worker.
const AIConfig = {
  efforts: ['', 'none', 'low', 'medium', 'high', 'xhigh', 'max'],
  batchDefaults: { batchSize: 50, concurrency: 4, maxRetries: 2 },
  batchLimits: { batchSize: [1, 100], concurrency: [1, 8], maxRetries: [0, 5] },

  normalizeBatchSettings(settings = {}) {
    const result = {};
    const labels = { batchSize: '每片题目数', concurrency: '最大并发数', maxRetries: '失败重试次数' };
    for (const [key, [min, max]] of Object.entries(this.batchLimits)) {
      const value = settings?.[key] === undefined ? this.batchDefaults[key] : Number(settings[key]);
      if (!Number.isInteger(value) || value < min || value > max || settings[key] === '') {
        throw new Error(`${labels[key]}必须为 ${min} 到 ${max} 之间的整数`);
      }
      result[key] = value;
    }
    return result;
  },

  async loadBatchSettings() {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return { ...this.batchDefaults };
    }
    const data = await chrome.storage.local.get('aiBatchSettings');
    try {
      return this.normalizeBatchSettings(data.aiBatchSettings);
    } catch (err) {
      return { ...this.batchDefaults };
    }
  },

  defaultPath(apiType) {
    return apiType === 'responses' ? '/responses' : '/chat/completions';
  },

  defaultTemperature(apiType) {
    return apiType === 'responses' ? null : 0.3;
  },

  normalize(config = {}) {
    const apiType = config.apiType || 'chat_completions';
    if (!['chat_completions', 'responses'].includes(apiType)) {
      throw new Error('不支持的 AI API 类型');
    }
    const reasoningEffort = config.reasoningEffort ?? '';
    if (!this.efforts.includes(reasoningEffort)) {
      throw new Error('不支持的思考等级');
    }
    let path = (config.path || '').trim() || this.defaultPath(apiType);
    if (!path.startsWith('/')) path = `/${path}`;
    const rawTemperature = config.temperature === undefined
      ? this.defaultTemperature(apiType) : config.temperature;
    const temperature = rawTemperature === null || String(rawTemperature).trim() === ''
      ? null : Number(rawTemperature);
    if (temperature !== null && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
      throw new Error('温度必须为 0 到 2 之间的数字，或留空');
    }
    return {
      ...config,
      apiType,
      reasoningEffort,
      baseUrl: (config.baseUrl || '').trim().replace(/\/+$/, ''),
      path,
      apiKey: (config.apiKey || '').trim(),
      model: (config.model || '').trim(),
      temperature
    };
  },

  switchPath(path, apiType) {
    const trimmed = (path || '').trim().replace(/^\/?/, '/');
    if (['/', '/chat/completions', '/responses'].includes(trimmed)) {
      return this.defaultPath(apiType);
    }
    if (['/v1/chat/completions', '/v1/responses'].includes(trimmed)) {
      return `/v1${this.defaultPath(apiType)}`;
    }
    return path;
  }
};
