// DeepSeek API 调用模块
const AIApi = {
  API_KEY: 'Your ApiKeys',
  API_URL: 'https://api.deepseek.com/chat/completions',
  MODEL: 'deepseek-chat',

  // 构建提示词
  buildPrompt(questions) {
    let prompt = '请根据以下题目给出答案。对于选择题，直接给出正确选项字母；对于其他题型，给出简洁答案。\n\n';
    
    questions.forEach((q, idx) => {
      prompt += `【题目${idx + 1}】${q.title}\n`;
      if (q.options && q.options.length > 0) {
        q.options.forEach(opt => {
          prompt += `${opt}\n`;
        });
      }
      prompt += '\n';
    });
    
    prompt += '\n请按以下格式回答，每题一行：\n';
    prompt += '1. [答案]\n2. [答案]\n...';
    
    return prompt;
  },

  // 调用 DeepSeek API
  async getAnswers(questions) {
    const prompt = this.buildPrompt(questions);
    
    const response = await fetch(this.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.API_KEY}`
      },
      body: JSON.stringify({
        model: this.MODEL,
        messages: [
          {
            role: 'system',
            content: '你是一个专业的答题助手。请直接给出答案，选择题只需给出选项字母，简答题给出简洁准确的答案。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API请求失败: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  },

  // 解析 AI 返回的答案
  parseAnswers(responseText, questionCount) {
    const answers = [];
    const lines = responseText.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      // 匹配格式: "1. A" 或 "1、答案内容" 或 "【题目1】答案"
      const match = line.match(/^(?:【题目)?(\d+)[.、】\s]*(.+)$/);
      if (match) {
        const idx = parseInt(match[1]) - 1;
        const answer = match[2].trim();
        if (idx >= 0 && idx < questionCount) {
          answers[idx] = answer;
        }
      }
    }
    
    // 填充未匹配的答案
    for (let i = 0; i < questionCount; i++) {
      if (!answers[i]) {
        answers[i] = '未能解析答案';
      }
    }
    
    return answers;
  }
};
