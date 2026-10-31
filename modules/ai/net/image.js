// Background-only image reads.
const AIImages = {
  async prepareMessages(config, messages, signal) {
    signal.throwIfAborted();
    if (config.apiType !== 'gemini_generate_content') return messages;
    const images = new Map();
    try {
      const prepared = [];
      for (const message of messages) {
        if (!Array.isArray(message.content)) {
          prepared.push(message);
          continue;
        }
        const content = [];
        for (const part of message.content) {
          const url = part.type === 'image_url' ? part.image_url.url : '';
          if (!/^https?:\/\//i.test(url)) {
            content.push(part);
            continue;
          }
          signal.throwIfAborted();
          if (!images.has(url)) images.set(url, await this.read(url, signal));
          content.push({ ...part, image_url: { ...part.image_url, url: images.get(url) } });
        }
        prepared.push({ ...message, content });
      }
      signal.throwIfAborted();
      return prepared;
    } finally { images.clear(); }
  },

  async read(source, signal) {
    let origin;
    try { origin = new URL(source).origin; }
    catch (_) { throw new Error('图片网站地址无效，请重新读取题目'); }
    if (!await chrome.permissions.contains({ origins: [`${origin}/*`] })) {
      signal.throwIfAborted();
      throw new Error(`图片网站尚未授权：${origin}。请在插件弹窗的“总体设置 → 图片访问权限”中填写该地址并授权后重试`);
    }
    signal.throwIfAborted();
    try {
      const response = await fetch(source, { credentials: 'include', cache: 'no-store', signal });
      signal.throwIfAborted();
      if (!response.ok) {
        await response.body?.cancel();
        throw Object.assign(new Error(`图片读取失败（${origin}，HTTP ${response.status}）`), {
          retryable: response.status === 408 || response.status === 429 || response.status >= 500
        });
      }
      const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!/^image\/(png|jpe?g|gif|webp)$/.test(mimeType)) {
        await response.body?.cancel();
        throw new Error(`图片读取失败（${origin}）：未返回支持的图片类型，请检查登录状态和图片格式（PNG、JPEG、GIF、WebP）`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      signal.throwIfAborted();
      if (!bytes.length) throw new Error(`图片读取失败（${origin}）：图片内容为空`);
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return `data:${mimeType === 'image/jpg' ? 'image/jpeg' : mimeType};base64,${btoa(binary)}`;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof TypeError) throw Object.assign(new Error(`图片读取失败（${origin}）：网络错误，请检查图片访问权限和登录状态`), { retryable: true });
      throw error;
    }
  }
};
