// Normalize visible thoughts separately from answer text for every supported protocol.
const AIStream = {
  createParser(apiType, onDelta = () => {}, onThought) {
    let buffer = '', contentBuffer = '', inThink = false, thinkIndex = 0;
    let terminal = false, finishReason = '', encrypted = false, hidden = false;
    let usage = {}, chatMessage = { role: 'assistant' };
    const answers = new Map(), thoughts = new Map(), output = new Map(), claudeBlocks = new Map(), geminiParts = [];
    let publishedThoughts = [], publishedThoughtText = '';
    const selectedThoughts = () => {
      const blocks = [...thoughts].map(([id, block]) => ({ id, ...block }));
      if (apiType !== 'chat_completions') return blocks;
      // Aliases are alternative sources, not fragments of one thought. Keep each
      // source intact, including legitimate repeated text within that source.
      for (const prefix of ['detail:', 'chat:reasoning_content', 'chat:reasoning', 'tag:']) {
        const selected = blocks.filter(block => prefix.endsWith(':') ? block.id.startsWith(prefix) : block.id === prefix);
        if (selected.some(block => block.text.trim())) return selected;
      }
      return [];
    };
    const publishChatThoughts = () => {
      if (apiType !== 'chat_completions') return;
      const blocks = selectedThoughts();
      const text = blocks.map(block => block.text).join('\n\n');
      const appendOnly = blocks.length === publishedThoughts.length && blocks.every((block, index) => {
        const previous = publishedThoughts[index];
        return block.id === previous.id && block.kind === previous.kind && block.text.startsWith(previous.text);
      });
      if (appendOnly) blocks.forEach((block, index) => {
        const delta = block.text.slice(publishedThoughts[index].text.length);
        if (delta) onThought?.(delta, { kind: block.kind, blockId: block.id });
      });
      else {
        const delta = text.startsWith(publishedThoughtText) ? text.slice(publishedThoughtText.length) : text;
        onThought?.(delta, { blocks, kind: blocks.every(block => block.kind === 'summary') ? 'summary' : 'content' });
      }
      publishedThoughts = blocks;
      publishedThoughtText = text;
    };
    const retryableError = message => Object.assign(new Error(message), { retryable: true });
    const apiError = error => AIConfig.apiError(error);
    const update = (map, key, value, full, kind) => {
      if (typeof value !== 'string' || !value) return;
      const block = map.get(key) || { text: '', ...(kind ? { kind } : {}) };
      if (kind) block.kind = kind;
      const delta = full ? (value.startsWith(block.text) ? value.slice(block.text.length) : '') : value;
      block.text = full ? value : block.text + value;
      map.set(key, block);
      if (delta) {
        if (kind) {
          if (apiType !== 'chat_completions') onThought?.(delta, { kind, blockId: key });
        } else onDelta(delta);
      }
    };
    const answer = (key, value, full = false) => update(answers, key, value, full);
    const thought = (key, value, kind = 'content', full = false) => update(thoughts, key, value, full, kind);
    const suffixLength = (value, marker) => {
      for (let n = Math.min(value.length, marker.length - 1); n > 0; n--) if (value.endsWith(marker.slice(0, n))) return n;
      return 0;
    };
    const visibleContent = content => {
      if (typeof content !== 'string') return;
      contentBuffer += content;
      while (contentBuffer) {
        const marker = inThink ? '</think>' : '<think>';
        const index = contentBuffer.indexOf(marker);
        if (index >= 0) {
          if (inThink) thought(`tag:${thinkIndex++}`, contentBuffer.slice(0, index));
          else answer('chat', contentBuffer.slice(0, index));
          contentBuffer = contentBuffer.slice(index + marker.length);
          inThink = !inThink;
        } else {
          const keep = suffixLength(contentBuffer, marker);
          const value = contentBuffer.slice(0, contentBuffer.length - keep);
          if (inThink) thought(`tag:${thinkIndex}`, value);
          else answer('chat', value);
          contentBuffer = contentBuffer.slice(contentBuffer.length - keep);
          break;
        }
      }
    };
    const fullContent = content => {
      if (typeof content !== 'string') return;
      let index = 0, text = '', offset = 0;
      for (const match of content.matchAll(/<think>([\s\S]*?)<\/think>/g)) {
        text += content.slice(offset, match.index);
        thought(`tag:${index++}`, match[1], 'content', true);
        offset = match.index + match[0].length;
      }
      text += content.slice(offset);
      if (text.includes('<think>')) throw retryableError('AI 思考内容未正常结束');
      answer('chat', text, true);
      contentBuffer = ''; inThink = false;
    };
    const chatThoughts = (message, full = false) => {
      for (const field of ['reasoning_content', 'reasoning']) {
        if (typeof message[field] !== 'string' || !message[field]) continue;
        thought(`chat:${field}`, message[field], 'content', full);
        chatMessage[field] = full ? message[field] : (chatMessage[field] || '') + message[field];
      }
      for (const [i, detail] of (message.reasoning_details || []).entries()) {
        const key = `${detail.type || 'text'}:${detail.index ?? detail.id ?? i}`;
        if (detail.type === 'reasoning.encrypted' || detail.encrypted_content) encrypted = true;
        const kind = detail.type === 'reasoning.summary' ? 'summary' : 'content';
        thought(`detail:${key}`, detail.summary || detail.text, kind, full);
        chatMessage.reasoning_details ||= [];
        const previous = chatMessage.reasoning_details.find(item => item._key === key);
        if (!previous) chatMessage.reasoning_details.push({ ...detail, _key: key });
        else for (const [name, value] of Object.entries(detail)) {
          previous[name] = !full && ['text', 'summary', 'data'].includes(name) && typeof value === 'string' ? (previous[name] || '') + value : value;
        }
      }
    };
    const responseItem = (item, index) => {
      if (!item) return;
      output.set(index, item);
      if (item.type === 'reasoning') {
        if (item.encrypted_content) encrypted = true;
        (item.summary || []).forEach((part, n) => thought(`rs:${index}:summary:${n}`, part.text, 'summary', true));
        (item.content || []).forEach((part, n) => thought(`rs:${index}:content:${n}`, part.text, 'content', true));
      } else if (item.type === 'message') (item.content || []).forEach((part, n) => {
        if (part.type === 'refusal') throw new Error(`AI 拒绝回答：${part.refusal || '未提供原因'}`);
        if (part.type === 'output_text') answer(`rs:${index}:${n}`, part.text, true);
      });
    };
    const stopReason = (reason, allowed) => {
      if (!reason || allowed.includes(reason)) return;
      if (['refusal', 'SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'RECITATION'].includes(reason)) throw new Error(`AI 拒绝回答：${reason}`);
      throw retryableError(`AI 请求未完成：${reason}`);
    };
    const claudeBlock = (block, index) => {
      claudeBlocks.set(index, { ...block });
      if (block.type === 'thinking') thought(`claude:${index}`, block.thinking, 'content', true);
      if (block.type === 'redacted_thinking') hidden = true;
      if (block.type === 'text') answer(`claude:${index}`, block.text, true);
    };
    const geminiResponse = result => {
      if (result.error) throw apiError(result.error);
      if (result.promptFeedback?.blockReason) throw new Error(`AI 拒绝回答：${result.promptFeedback.blockReason}`);
      const candidate = result.candidates?.[0];
      for (const part of candidate?.content?.parts || []) {
        geminiParts.push(part);
        if (part.thoughtSignature) encrypted = true;
        if (part.thought) thought('gemini:summary', part.text, 'summary');
        else answer('gemini', part.text);
      }
      usage = { ...usage, ...result.usageMetadata };
      stopReason(candidate?.finishReason, ['STOP']);
      if (candidate?.finishReason === 'STOP') terminal = true;
    };
    const acceptResponse = result => {
      if (result?.error) throw apiError(result.error);
      if (apiType === 'responses') {
        if (result.status !== 'completed') {
          if (result.status === 'failed') throw apiError(result.error || {});
          throw retryableError(`Responses 请求未完成：${result.status || '未知状态'}（${result.incomplete_details?.reason || '未返回完整答案'}）`);
        }
        (result.output || []).forEach(responseItem);
      } else if (apiType === 'anthropic_messages') {
        stopReason(result.stop_reason, ['end_turn', 'stop_sequence']);
        (result.content || []).forEach(claudeBlock);
      } else if (apiType === 'gemini_generate_content') {
        for (const chunk of Array.isArray(result) ? result : [result]) geminiResponse(chunk);
        if (!terminal) throw retryableError('Gemini 请求未正常完成');
      } else {
        const choice = result.choices?.[0];
        if (choice?.message?.refusal) throw new Error(`AI 拒绝回答：${choice.message.refusal}`);
        stopReason(choice?.finish_reason, ['stop']);
        chatThoughts(choice?.message || {}, true);
        fullContent(choice?.message?.content);
        finishReason = 'stop';
      }
      usage = { ...usage, ...result.usage };
      terminal = true;
      publishChatThoughts();
    };
    const processEvent = event => {
      if (event.error) throw apiError(event.error);
      if (event.type === 'error') throw apiError(event.error || event);
      if (event.usage) usage = { ...usage, ...event.usage };
      if (apiType === 'responses') {
        const index = event.output_index ?? [...output].find(([, item]) => item.id === event.item_id)?.[0] ?? 0;
        if (event.type === 'response.output_text.delta') answer(`rs:${index}:${event.content_index || 0}`, event.delta);
        if (event.type === 'response.output_text.done') answer(`rs:${index}:${event.content_index || 0}`, event.text, true);
        if (event.type === 'response.reasoning_summary_text.delta' || event.type === 'response.reasoning_summary_text.done') {
          thought(`rs:${index}:summary:${event.summary_index || 0}`, event.delta ?? event.text, 'summary', event.type.endsWith('.done'));
        }
        if (event.type === 'response.reasoning_text.delta' || event.type === 'response.reasoning_text.done') {
          thought(`rs:${index}:content:${event.content_index || 0}`, event.delta ?? event.text, 'content', event.type.endsWith('.done'));
        }
        if (event.type === 'response.reasoning_summary_part.done') thought(`rs:${index}:summary:${event.summary_index || 0}`, event.part?.text, 'summary', true);
        if (event.type === 'response.content_part.done' && event.part?.type === 'output_text') answer(`rs:${index}:${event.content_index || 0}`, event.part.text, true);
        if (event.type === 'response.content_part.done' && event.part?.type === 'reasoning_text') thought(`rs:${index}:content:${event.content_index || 0}`, event.part.text, 'content', true);
        if (['response.output_item.added', 'response.output_item.done'].includes(event.type)) responseItem(event.item, index);
        if (event.type === 'response.refusal.delta' || event.type === 'response.refusal.done') throw new Error('AI 拒绝回答');
        if (event.type === 'response.failed') throw apiError(event.response?.error || {});
        if (event.type === 'response.incomplete') throw retryableError(event.response?.incomplete_details?.reason || 'Responses 请求未完成');
        if (event.type === 'response.completed') {
          if (event.response) acceptResponse(event.response);
          terminal = true;
        }
      } else if (apiType === 'anthropic_messages') {
        if (event.type === 'message_start') {
          usage = { ...usage, ...event.message?.usage };
          (event.message?.content || []).forEach(claudeBlock);
        }
        if (event.type === 'content_block_start') claudeBlock(event.content_block, event.index);
        if (event.type === 'content_block_delta') {
          const block = claudeBlocks.get(event.index);
          const delta = event.delta;
          if (delta.type === 'text_delta') {
            answer(`claude:${event.index}`, delta.text);
            if (block) block.text = (block.text || '') + delta.text;
          }
          if (delta.type === 'thinking_delta') {
            thought(`claude:${event.index}`, delta.thinking, 'content');
            if (block) block.thinking = (block.thinking || '') + delta.thinking;
          }
          if (delta.type === 'signature_delta' && block) block.signature = (block.signature || '') + delta.signature;
        }
        if (event.type === 'message_delta') stopReason(event.delta?.stop_reason, ['end_turn', 'stop_sequence']);
        if (event.type === 'message_stop') terminal = true;
      } else if (apiType === 'gemini_generate_content') geminiResponse(event);
      else {
        const choice = event.choices?.[0];
        if (choice?.delta?.refusal) throw new Error(`AI 拒绝回答：${choice.delta.refusal}`);
        chatThoughts(choice?.delta || {});
        visibleContent(choice?.delta?.content);
        if (choice?.message) {
          chatThoughts(choice.message, true);
          fullContent(choice.message.content);
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        publishChatThoughts();
      }
    };
    const result = () => {
      const text = [...answers].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true })).map(([, block]) => block.text).join('');
      const thoughtBlocks = selectedThoughts();
      let protocolData;
      if (apiType === 'responses') {
        protocolData = [...output].sort((a, b) => a[0] - b[0]).map(([, item]) => item).filter(item => ['reasoning', 'message'].includes(item.type));
        const savedText = protocolData.filter(item => item.type === 'message').flatMap(item => item.content || [])
          .filter(part => part.type === 'output_text').map(part => part.text).join('');
        // Some relays send answer deltas without a completed message item.
        if (protocolData.length && savedText !== text) protocolData = [
          ...protocolData.filter(item => item.type === 'reasoning'),
          { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }
        ];
      }
      else if (apiType === 'anthropic_messages') protocolData = [...claudeBlocks].sort((a, b) => a[0] - b[0]).map(([, block]) => block).filter(block => ['text', 'thinking', 'redacted_thinking'].includes(block.type));
      else if (apiType === 'gemini_generate_content') protocolData = geminiParts;
      else {
        protocolData = { ...chatMessage, content: text };
        if (protocolData.reasoning_details) protocolData.reasoning_details = protocolData.reasoning_details.map(({ _key, ...detail }) => detail);
      }
      return { text, thought: thoughtBlocks.map(block => block.text).join('\n\n'), thoughtBlocks,
        thoughtKind: thoughtBlocks.length && thoughtBlocks.every(block => block.kind === 'summary') ? 'summary' : 'content',
        thoughtStatus: thoughtBlocks.length ? 'visible' : hidden ? 'hidden' : encrypted ? 'encrypted' : 'not_returned',
        usage, protocolData };
    };
    return {
      acceptResponse,
      feed(chunk) {
        buffer += chunk;
        let match;
        while ((match = /\r?\n\r?\n/.exec(buffer))) {
          this.frame(buffer.slice(0, match.index));
          buffer = buffer.slice(match.index + match[0].length);
        }
      },
      frame(frame) {
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data) return;
        if (data === '[DONE]') { if (apiType === 'chat_completions') terminal = true; return; }
        let event;
        try { event = JSON.parse(data); } catch (_) { throw retryableError('AI 流式响应包含无效 JSON'); }
        processEvent(event);
      },
      finish() {
        if (buffer.trim()) { this.frame(buffer); buffer = ''; }
        if (!terminal || (apiType === 'chat_completions' && finishReason !== 'stop')) throw retryableError('AI 流式响应未正常完成');
        if (inThink) throw retryableError('AI 思考内容未正常结束');
        answer('chat', contentBuffer); contentBuffer = '';
        if (!result().text.trim()) throw retryableError('AI API 未返回回复文本');
        return result().text;
      },
      result
    };
  },

  parseResponse(response, apiType, onDelta, onThought) {
    const parser = this.createParser(apiType, onDelta, onThought);
    parser.acceptResponse(response);
    parser.finish();
    return parser.result();
  },

  async consumeResult(body, apiType, onDelta, onThought) {
    if (!body?.getReader) throw Object.assign(new Error('AI API 未返回可读取的数据流'), { retryable: true });
    const reader = body.getReader(), decoder = new TextDecoder();
    const parser = this.createParser(apiType, onDelta, onThought);
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }
      parser.feed(decoder.decode());
      parser.finish();
      return parser.result();
    } finally { reader.releaseLock(); }
  },

  async consume(body, apiType, onDelta, onThought) {
    return (await this.consumeResult(body, apiType, onDelta, onThought)).text;
  }
};
