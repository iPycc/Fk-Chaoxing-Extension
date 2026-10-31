// Background-only model discovery.
const AIModelQuery = {
  cacheTtl: 60 * 60 * 1000,
  connections: new Map(),

  modelsUrl(config) {
    const prefix = config.path.match(/^(.*)\/(?:chat\/completions|responses|messages|models\/[^/]+:(?:\{method\}|generateContent|streamGenerateContent))\/?$/)?.[1] || '';
    const url = new URL(`${config.baseUrl}${prefix}/models`);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('AI API 地址必须使用 HTTP 或 HTTPS');
    return url;
  },

  connection(config) {
    const key = JSON.stringify([this.modelsUrl(config).toString(), config.apiType, config.apiKey, config.workspaceId, config.apiVersion]);
    if (!this.connections.has(key)) this.connections.set(key, { cache: new Map(), specs: new Map(), pending: new Map(), revision: 0 });
    return this.connections.get(key);
  },

  outputLimit(model) {
    return [model?.max_tokens, model?.max_output_tokens].find(value => Number.isSafeInteger(value) && value > 0);
  },

  specifications(model, apiType) {
    const input = apiType === 'gemini_generate_content' ? model?.inputTokenLimit : model?.max_input_tokens;
    const output = apiType === 'gemini_generate_content' ? model?.outputTokenLimit : this.outputLimit(model);
    return { maxInputTokens: Number.isSafeInteger(input) && input > 0 ? input : null,
      maxOutputTokens: Number.isSafeInteger(output) && output > 0 ? output : null };
  },

  shared(connection, key, signal, work) {
    signal.throwIfAborted();
    let entry = connection.pending.get(key);
    if (!entry) {
      entry = { controller: new AbortController(), waiters: new Set() };
      connection.pending.set(key, entry);
      entry.promise = Promise.resolve().then(() => work(entry.controller.signal));
      const cleanup = () => { if (connection.pending.get(key) === entry) connection.pending.delete(key); };
      entry.promise.then(cleanup, cleanup);
    }
    return new Promise((resolve, reject) => {
      const waiter = {};
      entry.waiters.add(waiter);
      const release = () => {
        signal.removeEventListener('abort', cancel);
        entry.waiters.delete(waiter);
      };
      const cancel = () => {
        release();
        if (!entry.waiters.size) {
          if (connection.pending.get(key) === entry) connection.pending.delete(key);
          entry.controller.abort();
        }
        reject(signal.reason);
      };
      signal.addEventListener('abort', cancel, { once: true });
      entry.promise.then(value => {
        release();
        if (signal.aborted) reject(signal.reason);
        else resolve(value);
      }, error => { release(); reject(error); });
    });
  },

  async fetchJson(config, url, signal) {
    signal.throwIfAborted();
    if (!await chrome.permissions.contains({ origins: [`${url.origin}/*`] })) {
      throw new Error('尚未授权模型 API 域名，请在插件弹窗授权');
    }
    signal.throwIfAborted();
    const response = await fetch(url.toString(), { headers: AIProtocol.headers(config), signal });
    signal.throwIfAborted();
    if (!response.ok) throw new Error(`模型查询失败（HTTP ${response.status}）`);
    let result;
    try { result = await response.json(); }
    catch (error) { signal.throwIfAborted(); throw new Error('模型查询返回的内容不是合法 JSON'); }
    signal.throwIfAborted();
    // Do not expose remote error bodies, which may echo request credentials.
    if (result?.error) throw new Error('模型查询失败：接口返回错误');
    return result;
  },

  async list(config, signal) {
    signal.throwIfAborted();
    const connection = this.connection(config);
    if (!connection.pending.has('list')) {
      connection.revision++;
      connection.cache.clear();
      connection.specs.clear();
    }
    const revision = connection.revision;
    return this.shared(connection, 'list', signal, async querySignal => {
      const models = new Map(), cursors = new Set();
      const url = this.modelsUrl(config);
      while (true) {
        const result = await this.fetchJson(config, url, querySignal);
        const gemini = config.apiType === 'gemini_generate_content';
        const items = gemini ? result.models : result.data;
        if (!Array.isArray(items) && !(gemini && items === undefined)) throw new Error('模型查询返回的列表格式不正确');
        for (const item of items || []) {
          if (gemini && Array.isArray(item.supportedGenerationMethods) && !item.supportedGenerationMethods.includes('generateContent')) continue;
          const rawId = gemini ? item.name : item.id;
          if (typeof rawId !== 'string' || !rawId.trim()) continue;
          const id = gemini ? rawId.replace(/^models\//, '') : rawId;
          const limit = config.apiType === 'anthropic_messages' ? this.outputLimit(item)
            : gemini && Number.isSafeInteger(item.outputTokenLimit) && item.outputTokenLimit > 0 ? item.outputTokenLimit : undefined;
          const specs = this.specifications(item, config.apiType);
          const model = { id, label: item.display_name || item.displayName || item.name || id,
            ...(specs.maxInputTokens ? { maxInputTokens: specs.maxInputTokens } : {}),
            ...(limit ? { maxOutputTokens: limit } : {}) };
          const previous = models.get(id);
          models.set(id, previous ? { ...model, ...previous, ...(limit ? { maxOutputTokens: limit } : {}) } : model);
        }
        const cursor = gemini ? result.nextPageToken : config.apiType === 'anthropic_messages' && result.has_more ? result.last_id : '';
        if (!cursor) {
          if (config.apiType === 'anthropic_messages' && result.has_more) throw new Error('模型查询分页缺少游标');
          break;
        }
        if (cursors.has(cursor)) throw new Error('模型查询分页游标重复');
        cursors.add(cursor);
        url.searchParams.set(gemini ? 'pageToken' : 'after_id', cursor);
      }
      querySignal.throwIfAborted();
      if (connection.revision === revision) for (const model of models.values()) {
        connection.specs.set(model.id, { value: { maxInputTokens: model.maxInputTokens || null,
          maxOutputTokens: model.maxOutputTokens || null }, expiresAt: Date.now() + this.cacheTtl });
      }
      if (config.apiType === 'anthropic_messages' && connection.revision === revision) {
        for (const model of models.values()) if (model.maxOutputTokens) {
          connection.cache.set(model.id, { value: model.maxOutputTokens, expiresAt: Date.now() + this.cacheTtl });
        }
      }
      return [...models.values()];
    });
  },

  async claudeLimit(config, signal) {
    signal.throwIfAborted();
    const connection = this.connection(config);
    const cached = connection.cache.get(config.model);
    if (cached?.expiresAt > Date.now()) return cached.value;
    connection.cache.delete(config.model);
    const specs = await this.details(config, signal);
    if (!specs.maxOutputTokens) throw new Error('模型详情未返回有效的输出上限（max_tokens / max_output_tokens）');
    return specs.maxOutputTokens;
  },

  async details(config, signal) {
    signal.throwIfAborted();
    const connection = this.connection(config);
    const cached = connection.specs.get(config.model);
    if (cached?.expiresAt > Date.now() && !cached.failed &&
        !(config.apiType === 'anthropic_messages' && !cached.value.maxOutputTokens)) return cached.value;
    connection.specs.delete(config.model);
    const revision = connection.revision;
    return this.shared(connection, `detail:${revision}:${config.model}`, signal, async querySignal => {
      const url = this.modelsUrl(config);
      const model = config.apiType === 'gemini_generate_content' ? config.model.replace(/^models\//, '') : config.model;
      url.pathname += `/${encodeURIComponent(model)}`;
      const result = await this.fetchJson(config, url, querySignal);
      const value = this.specifications(result, config.apiType);
      if (connection.revision === revision) {
        const expiresAt = Date.now() + this.cacheTtl;
        connection.specs.set(config.model, { value, expiresAt });
        if (value.maxOutputTokens && config.apiType === 'anthropic_messages') {
          connection.cache.set(config.model, { value: value.maxOutputTokens, expiresAt });
        }
      }
      return value;
    });
  },

  async inputInfo(config, signal) {
    const connection = this.connection(config), revision = connection.revision;
    const cached = connection.specs.get(config.model);
    if (cached?.expiresAt > Date.now()) {
      signal.throwIfAborted();
      return { maxInputTokens: cached.value.maxInputTokens };
    }
    try { return { maxInputTokens: (await this.details(config, signal)).maxInputTokens }; }
    catch (error) {
      signal.throwIfAborted();
      if (connection.revision === revision) connection.specs.set(config.model, { failed: true,
        value: { maxInputTokens: null, maxOutputTokens: null }, expiresAt: Date.now() + this.cacheTtl });
      return { maxInputTokens: null };
    }
  },

  async prepare(config, signal) {
    signal.throwIfAborted();
    if (config.apiType !== 'anthropic_messages') return undefined;
    try { return await this.claudeLimit(config, signal); }
    catch (error) {
      signal.throwIfAborted();
      if (config.claudeFallbackMaxTokens) return config.claudeFallbackMaxTokens;
      throw new Error(`无法确定 Claude 输出上限：${error.message}。请在模型连接设置填写“查询失败时的最大输出 tokens”后重试`);
    }
  }
};
