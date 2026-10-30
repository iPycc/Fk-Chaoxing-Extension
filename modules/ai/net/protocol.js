// Provider protocol adapters.
const AIProtocol = {
  url(config, stream = false) {
    let path = config.path;
    if (config.apiType === 'gemini_generate_content') {
      path = path.replace('{model}', encodeURIComponent(config.model.replace(/^models\//, '')))
        .replace('{method}', stream ? 'streamGenerateContent' : 'generateContent');
    }
    const url = new URL(`${config.baseUrl.replace(/\/+$/, '')}${path}`);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('AI API 地址必须使用 HTTP 或 HTTPS');
    if (stream && config.apiType === 'gemini_generate_content') url.searchParams.set('alt', 'sse');
    return url.toString();
  },

  headers(config) {
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiType === 'anthropic_messages') {
      headers['x-api-key'] = config.apiKey;
      headers['anthropic-version'] = config.apiVersion;
      if (config.workspaceId) headers['anthropic-workspace-id'] = config.workspaceId;
    } else if (config.apiType === 'gemini_generate_content') headers['x-goog-api-key'] = config.apiKey;
    else headers.Authorization = `Bearer ${config.apiKey}`;
    return headers;
  },

  savedState(message, config) {
    const state = message.protocolState;
    if (!state) return null;
    const expected = AIConfig.protocolIdentity(config);
    let identity = state.identity;
    if (identity !== expected) {
      // Legacy histories appended a provider name to the same five identity fields.
      try {
        const legacy = JSON.parse(identity);
        if (!Array.isArray(legacy) || legacy.length !== 6) return null;
        identity = JSON.stringify(legacy.slice(0, 5));
      } catch (_) { return null; }
    }
    return identity === expected && state.text === message.content &&
      !(Array.isArray(state.data) && !state.data.length) ? state.data : null;
  },

  parts(content, apiType) {
    if (typeof content === 'string') return [{ type: 'text', text: content }];
    return content.map(part => {
      if (part.type === 'text') return { type: 'text', text: part.text };
      const url = part.image_url.url;
      const data = /^data:(image\/(?:png|jpe?g|gif|webp));base64,(.+)$/i.exec(url);
      if (apiType === 'anthropic_messages') return { type: 'image', source: data
        ? { type: 'base64', media_type: data[1], data: data[2] } : { type: 'url', url } };
      return data ? { inlineData: { mimeType: data[1], data: data[2] } } : { fileData: { fileUri: url } };
    });
  },

  body(config, messages, stream = false, maxOutputTokens) {
    const apiType = config.apiType;
    const body = { model: config.model, stream };
    if (apiType === 'anthropic_messages') {
      const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
      if (system) body.system = system;
      body.messages = messages.filter(message => message.role !== 'system').map(message => ({
        role: message.role, content: this.savedState(message, config) || this.parts(message.content, apiType)
      }));
      if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0) throw new Error('Claude 尚未确定有效的最大输出 tokens');
      body.max_tokens = maxOutputTokens;
      if (config.reasoningEffort === 'none') body.thinking = { type: 'disabled' };
      else if (config.reasoningEffort) {
        body.thinking = { type: 'adaptive' };
        body.output_config = { effort: config.reasoningEffort };
      }
      return body;
    }
    if (apiType === 'gemini_generate_content') {
      const thinkingConfig = { includeThoughts: true };
      if (config.reasoningEffort) {
        if (config.reasoningEffort === 'none') thinkingConfig.thinkingBudget = 0;
        else thinkingConfig.thinkingLevel = config.reasoningEffort;
      }
      const generationConfig = { thinkingConfig };
      if (!config.reasoningEffort && config.temperature !== null) generationConfig.temperature = config.temperature;
      const systemParts = messages.filter(message => message.role === 'system' && message.content).map(message => ({ text: message.content }));
      return {
        ...(systemParts.length ? { systemInstruction: { parts: systemParts } } : {}),
        contents: messages.filter(message => message.role !== 'system').map(message => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: this.savedState(message, config) || this.parts(message.content, apiType).map(part => part.type === 'text' ? { text: part.text } : part)
        })), generationConfig
      };
    }
    if (apiType === 'responses') {
      body.input = messages.flatMap(message => {
        const saved = this.savedState(message, config);
        const replay = saved ? saved.filter(item => item.type !== 'reasoning' ||
          (typeof item.encrypted_content === 'string' && item.encrypted_content.trim())) : [];
        if (replay.some(item => item.type === 'message')) return replay;
        return [...replay, { role: message.role, content: Array.isArray(message.content)
          ? message.content.map(part => part.type === 'image_url'
            ? { type: 'input_image', image_url: part.image_url.url } : { type: 'input_text', text: part.text }) : message.content }];
      });
      body.store = false;
      body.include = ['reasoning.encrypted_content'];
      body.reasoning = { summary: 'auto', ...(config.reasoningEffort ? { effort: config.reasoningEffort } : {}) };
    } else {
      if (stream) body.stream_options = { include_usage: true };
      body.messages = messages.map(message => ({ ...(this.savedState(message, config) || {}), role: message.role, content: message.content }));
      if (config.reasoningEffort) body.reasoning_effort = config.reasoningEffort;
    }
    if (!config.reasoningEffort && config.temperature !== null) body.temperature = config.temperature;
    return body;
  },

  state(config, result) {
    return { identity: AIConfig.protocolIdentity(config), text: result.text, data: result.protocolData };
  }
};
