// Background Service Worker - 处理 API 请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'AI_API_REQUEST') {
    callDeepSeekAPI(request.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
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
    throw new Error(`API请求失败: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return result.choices[0].message.content;
}
