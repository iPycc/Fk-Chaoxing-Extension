const AIBatchConfig = {
  defaults: { batchSize: 50, concurrency: 4, maxRetries: 2,
    firstByteTimeoutSeconds: 600, idleTimeoutSeconds: 300, maxRequestSeconds: 1800 },
  limits: { batchSize: [1, 100], concurrency: [1, 16], maxRetries: [0, 5],
    firstByteTimeoutSeconds: [60, 3600], idleTimeoutSeconds: [30, 1800], maxRequestSeconds: [60, 7200] },
  labels: { batchSize: '每次请求题目数', concurrency: '同时并发数', maxRetries: '失败重试次数',
    firstByteTimeoutSeconds: '首次响应超时', idleTimeoutSeconds: '流空闲超时', maxRequestSeconds: '请求最长时间' },
  normalize(settings = {}) {
    const migrated = { ...settings };
    if (migrated.idleTimeoutSeconds === undefined && migrated.timeoutSeconds !== undefined) {
      migrated.idleTimeoutSeconds = migrated.timeoutSeconds;
    }
    const result = {};
    for (const [key, [min, max]] of Object.entries(this.limits)) {
      const raw = migrated[key] === undefined ? this.defaults[key] : migrated[key];
      const value = Number(raw);
      if (!Number.isInteger(value) || value < min || value > max || raw === '') {
        throw new Error(`${this.labels[key]}必须为 ${min} 到 ${max} 之间的整数`);
      }
      result[key] = value;
    }
    if (result.maxRequestSeconds < Math.max(result.firstByteTimeoutSeconds, result.idleTimeoutSeconds)) {
      throw new Error('请求最长时间不能小于首次响应或流空闲超时');
    }
    // Compatibility for page-save bridges while all callers migrate to the three timers.
    result.timeoutSeconds = result.idleTimeoutSeconds;
    return result;
  },
  async load() {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return this.normalize(this.defaults);
    const data = await chrome.storage.local.get('aiBatchSettings');
    try { return this.normalize(data.aiBatchSettings || {}); }
    catch (_) { return this.normalize(this.defaults); }
  }
};

AIConfig.batchDefaults = AIBatchConfig.defaults;
AIConfig.batchLimits = AIBatchConfig.limits;
AIConfig.normalizeBatchSettings = settings => AIBatchConfig.normalize(settings);
AIConfig.normalizeTimeoutSeconds = value => {
  const seconds = Number(value ?? AIBatchConfig.defaults.idleTimeoutSeconds);
  if (!Number.isInteger(seconds) || seconds <= 0) throw new Error('请求超时必须为正整数秒');
  return seconds;
};
AIConfig.loadBatchSettings = () => AIBatchConfig.load();
if (globalThis.FK) FK.ai.config.batch = AIBatchConfig;
