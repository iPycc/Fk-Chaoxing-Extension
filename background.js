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
    callDeepSeekAPI(request.data)
      .then(result => {
        log.info('AI API request successful');
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        log.error(`AI API request failed: ${error.message}`);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开放
  }
});

async function callDeepSeekAPI(data) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${data.apiKey}`
    },
    body: JSON.stringify({
      model: data.model || 'deepseek-chat',
      messages: data.messages,
      temperature: 0.3,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Request Failed: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return result.choices[0].message.content;
}
