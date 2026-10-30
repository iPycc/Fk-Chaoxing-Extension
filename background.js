importScripts('modules/app/ns.js');
importScripts('modules/ai/config/profile.js');
importScripts('modules/ai/config/batch.js');
importScripts('modules/ai/net/protocol.js');
importScripts('modules/ai/net/image.js');
importScripts('modules/ai/net/model.js');
importScripts('modules/ai/net/stream.js');
importScripts('modules/ai/net/timeout.js');

// Background Service Worker - 处理 API 请求和后台任务

const BACKGROUND_PREFIX = '[Fk-Chaoxing] [Background]';

// 简单的日志封装
const log = {
  info: (msg) => console.log(`${BACKGROUND_PREFIX} ${msg}`),
  error: (msg) => console.error(`${BACKGROUND_PREFIX} ${msg}`)
};

chrome.runtime.onInstalled.addListener(() => {
  log.info('Extension installed/updated');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'AI_API_REQUEST') {
    log.info('Received AI API request');
    callAIAPI(request.data)
      .then(result => {
        log.info('AI API request successful');
        sendResponse({ success: true, data: result.text, details: result });
      })
      .catch(error => {
        log.error(`AI API request failed: ${error.message}`);
        sendResponse({ success: false, error: error.message, retryable: error.retryable === true, contextLimit: error.contextLimit === true });
      });
    return true; // 保持消息通道开放
  } else if (request.action === 'updateBadge') {
    // Only the top frame owns the tab badge. Child-frame partial counts must
    // never overwrite the stable page snapshot.
    try {
      if (sender.tab?.id && (sender.frameId ?? 0) === 0) {
        chrome.action.setBadgeText({
          text: Number.isInteger(request.count) && request.count > 0 ? String(request.count) : '',
          tabId: sender.tab.id
        });
        chrome.action.setBadgeBackgroundColor({
          color: '#f53f3f', // 红色背景比较醒目
          tabId: sender.tab.id
        });
        sendResponse({ success: true });
      } else sendResponse({ success: false, ignored: true });
    } catch (e) {
      log.error('Update badge error: ' + e.message);
    }
  }
});

chrome.runtime.onConnect.addListener(port => {
  if (['AI_MODEL_QUERY', 'AI_MODEL_INFO'].includes(port.name)) {
    let controller, finished = false;
    const complete = message => {
      if (finished) return;
      finished = true;
      try { port.postMessage(message); } catch (_) { /* The editor may have closed. */ }
    };
    port.onMessage.addListener(message => {
      if (message?.type === 'cancel') {
        controller?.abort();
        complete({ type: 'cancelled' });
      }
      if (message?.type !== 'start' || controller || finished) return;
      controller = new AbortController();
      const query = port.name === 'AI_MODEL_QUERY' ? queryModelList(message.config, controller)
        : queryModelInfo(message.config, controller);
      query.then(result => complete({ type: 'done', ...(port.name === 'AI_MODEL_QUERY' ? { models: result } : result) }))
        .catch(error => complete({ type: 'error', message: error.message }));
    });
    port.onDisconnect.addListener(() => { finished = true; controller?.abort(); });
    return;
  }
  if (!['AI_DIALOGUE_STREAM', 'AI_CHAT_STREAM'].includes(port.name)) return;
  let started = false;
  let finished = false;
  let controller;

  const complete = (message) => {
    if (finished) return;
    finished = true;
    try { port.postMessage(message); } catch (err) { /* The page may have closed. */ }
  };

  port.onMessage.addListener(message => {
    if (message?.type === 'ping') return;
    if (message?.type === 'cancel') {
      controller?.abort();
      complete({ type: 'cancelled' });
      return;
    }
    if (message?.type !== 'start' || started || finished) return;
    started = true;
    controller = new AbortController();
    streamDialogueReply(message.messages, message.reasoningEffort, controller, delta => {
      if (!finished) port.postMessage({ type: 'delta', delta });
    }, port.name === 'AI_CHAT_STREAM' ? (delta, metadata) => {
      if (!finished) port.postMessage({ type: 'thought', delta, ...metadata });
    } : undefined, port.name === 'AI_CHAT_STREAM' ? message.profileId : undefined,
      message.timeouts || { timeoutSeconds: message.timeoutSeconds }, message.config)
      .then(result => complete({ type: 'done', ...result }))
      .catch(error => {
        if (!finished) complete({ type: 'error', message: error.message, retryable: error.retryable === true, contextLimit: error.contextLimit === true });
      });
  });

  port.onDisconnect.addListener(() => {
    finished = true;
    controller?.abort();
  });
});

async function streamDialogueReply(messages, reasoningEffort, controller, onDelta, onThought, profileId, timeoutSettings, requestConfig) {
  if (!Array.isArray(messages) || !messages.length ||
      messages.some(item => !['system', 'user', 'assistant'].includes(item?.role) || !validMessageContent(item))) {
    throw new Error('对话内容无效');
  }
  if (!AIConfig.efforts.includes(reasoningEffort)) throw new Error('不支持的思考等级');

  const data = await chrome.storage.local.get(['aiProfiles', 'activeAiProfileId', 'aiConfig']);
  const profiles = Array.isArray(data.aiProfiles) ? data.aiProfiles : [];
  const active = requestConfig || (profileId
    ? profiles.find(item => item.id === profileId)
    : profiles.find(item => item.id === data.activeAiProfileId) || profiles[0] || data.aiConfig);
  if (profileId && !active) throw new Error('所选模型配置已删除，请重新选择');
  if (!active) throw new Error('请先在插件弹窗配置 AI 模型');
  const config = normalizeApiConfig({ ...active, reasoningEffort });
  if (!config.baseUrl || !config.apiKey || !config.model) throw new Error('当前 AI 模型配置不完整');
  const apiUrl = new URL(buildApiUrl(config, true));
  if (!['https:', 'http:'].includes(apiUrl.protocol)) throw new Error('AI API 地址必须使用 HTTP 或 HTTPS');
  if (!await chrome.permissions.contains({ origins: [`${apiUrl.origin}/*`] })) {
    throw new Error('尚未授权模型 API 域名，请在插件弹窗重新保存或切换模型以授权');
  }

  const settings = AIBatchConfig.normalize({ ...(await AIConfig.loadBatchSettings()), ...(timeoutSettings || {}) });
  controller.signal.throwIfAborted();
  const timeout = AIRequestTimeout.start(controller, settings);
  let preparedMessages;
  try {
    const maxOutputTokens = await AIModelQuery.prepare(config, controller.signal);
    preparedMessages = await AIImages.prepareMessages(config, messages, controller.signal);
    controller.signal.throwIfAborted();
    const response = await fetch(apiUrl.toString(), {
      method: 'POST',
      headers: AIProtocol.headers(config),
      body: JSON.stringify(buildRequestBody(config, preparedMessages, true, maxOutputTokens)),
      signal: controller.signal
    });
    if (!response.ok) {
      throw await apiResponseError(response);
    }
    timeout.activity();
    const result = response.headers?.get('content-type')?.includes('application/json')
      ? AIStream.parseResponse(await readJsonResponse(response), config.apiType, onDelta, onThought)
      : await AIStream.consumeResult(response.body, config.apiType, onDelta, onThought, () => timeout.activity());
    return responseDetails(config, result);
  } catch (err) {
    if (timeout.kind) throw timeout.error();
    if (err instanceof TypeError) err.retryable = true;
    throw err;
  } finally {
    preparedMessages = null;
    timeout.stop();
  }
}

function normalizeApiConfig(config = {}) {
  return AIConfig.normalize(config);
}

function buildApiUrl(config, stream = false) {
  try {
    return AIProtocol.url(config, stream);
  } catch (err) {
    throw new Error('AI API 地址格式不正确，请检查配置');
  }
}

async function callOpenAICompatibleAPI(data) {
  return (await callAIAPI(data)).text;
}

async function callAIAPI(data) {
  const config = normalizeApiConfig(data.config || data);

  if (!config.baseUrl) {
    throw new Error('请先配置 AI API 地址');
  }
  if (!config.apiKey) {
    throw new Error('请先配置 AI API 密钥');
  }
  if (!config.model) {
    throw new Error('请先配置模型 ID');
  }

  const settings = AIBatchConfig.normalize({ ...(await AIConfig.loadBatchSettings()),
    ...(data.timeouts || {}), ...(data.timeoutSeconds === undefined ? {} : { timeoutSeconds: data.timeoutSeconds }) });
  const controller = new AbortController();
  const timeout = AIRequestTimeout.start(controller, settings);
  let response;
  let preparedMessages;
  try {
    const maxOutputTokens = await AIModelQuery.prepare(config, controller.signal);
    preparedMessages = await AIImages.prepareMessages(config, data.messages, controller.signal);
    controller.signal.throwIfAborted();
    response = await fetch(buildApiUrl(config), {
      method: 'POST',
      headers: AIProtocol.headers(config),
      body: JSON.stringify(buildRequestBody(config, preparedMessages, false, maxOutputTokens)),
      signal: controller.signal
    });

    if (!response.ok) {
      throw await apiResponseError(response);
    }
    timeout.activity();
    return responseDetails(config, AIStream.parseResponse(await readJsonResponse(response), config.apiType));
  } catch (err) {
    if (timeout.kind) throw timeout.error();
    if (err instanceof TypeError) err.retryable = true;
    throw err;
  } finally {
    preparedMessages = null;
    timeout.stop();
  }
}

async function apiResponseError(response) {
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch (_) { /* Plain-text relay errors are also supported. */ }
  const error = AIConfig.apiError(payload?.error || text, response.status);
  error.message = `AI API 请求失败（${response.status}）：${error.message.slice(0, 500)}`;
  return error;
}

async function readJsonResponse(response) {
  try { return await response.json(); }
  catch (err) {
    if (err.name === 'AbortError') throw err;
    throw retryableError('API 返回内容不是合法 JSON');
  }
}

function responseDetails(config, result) {
  const { protocolData, ...details } = result;
  return { ...details, protocolState: AIProtocol.state(config, result) };
}

function retryableError(message) {
  const error = new Error(message);
  error.retryable = true;
  return error;
}

function validMessageContent(message) {
  if (typeof message.content === 'string') return true;
  return message.role === 'user' && Array.isArray(message.content) && message.content.length > 0 && message.content.every(part =>
    (part?.type === 'text' && typeof part.text === 'string') ||
    (part?.type === 'image_url' && typeof part.image_url?.url === 'string' &&
      (/^https?:\/\//i.test(part.image_url.url) || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(part.image_url.url))));
}

function buildRequestBody(config, messages, stream = false, maxOutputTokens) {
  return AIProtocol.body(config, messages, stream, maxOutputTokens);
}

async function queryModelList(requestConfig, controller, infoOnly = false) {
  const config = normalizeApiConfig(requestConfig);
  if (!config.baseUrl || !config.apiKey) throw new Error('请填写 API 地址和密钥');
  const settings = await AIConfig.loadBatchSettings();
  controller.signal.throwIfAborted();
  const timeout = AIRequestTimeout.start(controller, settings);
  try { return await (infoOnly ? AIModelQuery.inputInfo(config, controller.signal) : AIModelQuery.list(config, controller.signal)); }
  catch (error) {
    if (timeout.kind) throw timeout.error();
    throw error;
  } finally { timeout.stop(); }
}

async function queryModelInfo(requestConfig, controller) {
  if (!requestConfig?.model) return { maxInputTokens: null };
  return queryModelList(requestConfig, controller, true);
}

function extractResponseText(result, apiType) {
  return AIStream.parseResponse(result, apiType).text;
}
