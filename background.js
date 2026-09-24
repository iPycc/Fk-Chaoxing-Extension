importScripts('modules/ai-answer/config.js');

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
    callOpenAICompatibleAPI(request.data)
      .then(result => {
        log.info('AI API request successful');
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        log.error(`AI API request failed: ${error.message}`);
        sendResponse({ success: false, error: error.message, retryable: error.retryable === true });
      });
    return true; // 保持消息通道开放
  } else if (request.action === 'updateBadge') {
    // 允许 content script 触发徽章更新
    try {
      if (sender.tab && sender.tab.id) {
        chrome.action.setBadgeText({
          text: request.count.toString(),
          tabId: sender.tab.id
        });
        chrome.action.setBadgeBackgroundColor({
          color: '#f53f3f', // 红色背景比较醒目
          tabId: sender.tab.id
        });
        sendResponse({ success: true });
      }
    } catch (e) {
      log.error('Update badge error: ' + e.message);
    }
  }
});

function normalizeApiConfig(config = {}) {
  return AIConfig.normalize(config);
}

function buildApiUrl(config) {
  try {
    const baseUrl = new URL(config.baseUrl);
    return `${baseUrl.toString().replace(/\/+$/, '')}${config.path}`;
  } catch (err) {
    throw new Error('AI API 地址格式不正确，请检查配置');
  }
}

async function callOpenAICompatibleAPI(data) {
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);
  let response;
  try {
    response = await fetch(buildApiUrl(config), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(buildRequestBody(config, data.messages)),
      signal: controller.signal
    });

    if (!response.ok) {
      const error = new Error(`API Request Failed: ${response.status} - ${await response.text()}`);
      error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw error;
    }

    let result;
    try {
      result = await response.json();
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      const error = new Error('API 返回内容不是合法 JSON');
      error.retryable = true;
      throw error;
    }
    return extractResponseText(result, config.apiType);
  } catch (err) {
    if (err.name === 'AbortError') {
      const error = new Error('AI API 请求超时（180 秒）');
      error.retryable = true;
      throw error;
    }
    if (err instanceof TypeError) err.retryable = true;
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function retryableError(message) {
  const error = new Error(message);
  error.retryable = true;
  return error;
}

function buildRequestBody(config, messages) {
  const body = { model: config.model, stream: false };
  if (config.apiType === 'responses') {
    body.input = messages;
    body.store = false;
    if (config.reasoningEffort) body.reasoning = { effort: config.reasoningEffort };
  } else {
    body.messages = messages;
    if (config.reasoningEffort) body.reasoning_effort = config.reasoningEffort;
  }
  if (!config.reasoningEffort && config.temperature !== null) {
    body.temperature = config.temperature;
  }
  return body;
}

function extractResponseText(result, apiType) {
  if (result?.error) {
    throw new Error(result.error.message || 'AI API 返回错误');
  }
  if (apiType === 'responses') {
    if (result?.status !== 'completed') {
      const message = `Responses 请求未完成：${result?.status || '未知状态'}（${result?.incomplete_details?.reason || '未返回完整答案'}）`;
      throw result?.status === 'failed' ? new Error(message) : retryableError(message);
    }
    const parts = [];
    for (const item of result.output || []) {
      if (item.type !== 'message') continue;
      for (const content of item.content || []) {
        if (content.type === 'refusal') throw new Error(`AI 拒绝回答：${content.refusal || '未提供原因'}`);
        if (content.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
      }
    }
    const text = parts.join('');
    if (!text.trim()) throw retryableError('Responses API 未返回答案文本');
    return text;
  }
  const choice = result?.choices?.[0];
  if (choice?.message?.refusal) throw new Error(`AI 拒绝回答：${choice.message.refusal}`);
  if (choice?.finish_reason && choice.finish_reason !== 'stop') {
    throw retryableError(`Chat Completions 请求未完成：${choice.finish_reason}`);
  }
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw retryableError('API 返回格式不符合 OpenAI Chat Completions 规范，或未返回答案文本');
  }
  return content;
}
