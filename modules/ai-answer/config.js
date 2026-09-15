// Shared configuration for the popup, content scripts and background worker.
const AIConfig = {
  efforts: ['', 'none', 'low', 'medium', 'high', 'xhigh', 'max'],

  defaultPath(apiType) {
    return apiType === 'responses' ? '/responses' : '/chat/completions';
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
    const rawTemperature = config.temperature === undefined ? 0.3 : config.temperature;
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
    return ['/', '/chat/completions', '/responses'].includes(trimmed)
      ? this.defaultPath(apiType) : path;
  }
};
