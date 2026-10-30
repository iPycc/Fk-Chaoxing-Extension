const AIAnswerEnvelope = {
  token() {
    const bytes = new Uint8Array(12);
    globalThis.crypto?.getRandomValues?.(bytes);
    return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('') ||
      `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  },
  markers(token) { return { open: `<fk_answers_${token}>`, close: `</fk_answers_${token}>` }; },
  instruction(token, mode = 'answer') {
    const { open, close } = this.markers(token);
    const coverage = mode === 'answer'
      ? 'answers 必须逐题覆盖本批全部题目。'
      : '只列出本次可见回答中明确确定的答案；没有确定答案时返回 related:false 与空 answers。';
    return [
      '在可见回答末尾追加以下机器协议；协议之后禁止输出任何内容。',
      `开始标记：${open}`,
      `结束标记：${close}`,
      '标记之间只输出一行合法 JSON：{"version":1,"related":true,"answers":[{"questionKey":"题目键","questionIndex":1,"type":"multiple_choice","answers":["A","C"]}]}',
      coverage,
      'questionIndex 使用当前批次序号；questionKey 和 type 必须原样复制题目数据。'
    ].join('\n');
  },
  suffix(value, marker) {
    for (let size = Math.min(value.length, marker.length - 1); size > 0; size--) {
      if (value.endsWith(marker.slice(0, size))) return size;
    }
    return 0;
  },
  visible(raw, token) {
    const text = String(raw || '');
    const { open } = this.markers(token);
    const index = text.indexOf(open);
    if (index >= 0) return text.slice(0, index).trimEnd();
    const pending = this.suffix(text, open);
    return text.slice(0, text.length - pending);
  },
  parse(raw, token) {
    const text = String(raw || '');
    const { open, close } = this.markers(token);
    const start = text.indexOf(open);
    if (start < 0) throw this.error('AI 未返回结构化答案标记');
    const end = text.indexOf(close, start + open.length);
    if (end < 0) throw this.error('AI 返回的结构化答案未结束');
    if (text.slice(end + close.length).trim()) throw this.error('结构化答案后存在额外内容');
    let data;
    try { data = JSON.parse(text.slice(start + open.length, end).trim()); }
    catch (_) { throw this.error('结构化答案不是合法 JSON'); }
    return { visible: text.slice(0, start).trim(), data };
  },
  error(message) { return Object.assign(new Error(message), { retryable: true }); }
};
FK.ai.answer.envelope = AIAnswerEnvelope;
