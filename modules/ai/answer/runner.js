const AIAnswerRunner = {
  async retry(work, maxRetries, signal, onRetry = () => {}) {
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      try { return await work(attempt); }
      catch (error) {
        signal?.throwIfAborted();
        if (error.contextLimit || !error.retryable || attempt >= maxRetries) throw error;
        onRetry(error, attempt + 1);
        await new Promise((resolve, reject) => {
          const cancel = () => { clearTimeout(timer); reject(signal.reason); };
          const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); },
            1000 * (2 ** attempt) + Math.floor(Math.random() * 250));
          signal?.addEventListener('abort', cancel, { once: true });
        });
      }
    }
  },
  pool(concurrency, worker) {
    return Promise.all(Array.from({ length: Math.max(0, concurrency) }, () => worker()));
  }
};
FK.ai.answer.runner = AIAnswerRunner;
