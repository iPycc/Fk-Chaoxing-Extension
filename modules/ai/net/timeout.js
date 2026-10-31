const AIRequestTimeout = {
  start(controller, settings) {
    const config = AIBatchConfig.normalize(settings || {});
    let firstTimer, idleTimer, hardTimer, kind = '';
    const abort = value => { kind ||= value; controller.abort(Object.assign(new DOMException(value, 'TimeoutError'), { timeoutKind: value })); };
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => abort('idle'), config.idleTimeoutSeconds * 1000);
    };
    firstTimer = setTimeout(() => abort('first-byte'), config.firstByteTimeoutSeconds * 1000);
    hardTimer = setTimeout(() => abort('hard-limit'), config.maxRequestSeconds * 1000);
    return {
      config,
      activity() { clearTimeout(firstTimer); firstTimer = null; resetIdle(); },
      stop() { clearTimeout(firstTimer); clearTimeout(idleTimer); clearTimeout(hardTimer); },
      get kind() { return kind; },
      error() {
        const messages = {
          'first-byte': `等待模型首次响应超过 ${config.firstByteTimeoutSeconds} 秒`,
          idle: `模型连续 ${config.idleTimeoutSeconds} 秒未返回数据`,
          'hard-limit': `请求总时长超过 ${config.maxRequestSeconds} 秒`
        };
        const error = new Error(messages[kind] || 'AI API 请求超时');
        error.retryable = true;
        error.timeoutKind = kind;
        return error;
      }
    };
  }
};

if (globalThis.FK) FK.ai.net.timeout = AIRequestTimeout;
