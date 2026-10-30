const QuestionStable = {
  intervalMs: 250, quietMs: 750, maxMs: 12000, samples: 3,
  signature(result) {
    return JSON.stringify((result.sections || []).map(section => [section.header,
      (section.questions || []).map(question => [question.questionKey, question.type, question.title,
        question.options, question.blankCount])]).concat([[result.pendingFrames, result.encryptedNodes,
          result.loadingFrames, result.incompleteQuestions]]));
  },
  async wait(sample, rootDoc = document, options = {}) {
    const started = performance.now();
    let lastMutation = performance.now(), signature = '', identical = 0, latest, samples = 0;
    const observer = new MutationObserver(() => { lastMutation = performance.now(); });
    if (rootDoc.documentElement) observer.observe(rootDoc.documentElement, { subtree: true, childList: true,
      characterData: true, attributes: true });
    try {
      while (performance.now() - started < (options.maxMs || this.maxMs)) {
        latest = await sample(); samples++;
        const next = this.signature(latest);
        identical = next === signature ? identical + 1 : 1; signature = next;
        const count = latest.sections.reduce((sum, section) => sum + (section.questions?.length || 0), 0);
        const ready = count > 0 && !latest.pendingFrames && !latest.encryptedNodes && !latest.loadingFrames &&
          !latest.incompleteQuestions && identical >= this.samples && performance.now() - lastMutation >= this.quietMs;
        if (ready) return { ...latest, samples, status: 'stable', elapsedMs: Math.round(performance.now() - started) };
        await new Promise(resolve => setTimeout(resolve, this.intervalMs));
      }
      return { ...(latest || {}), samples, status: latest?.sections?.some(section => section.questions?.length) ? 'partial' : 'empty',
        elapsedMs: Math.round(performance.now() - started) };
    } finally { observer.disconnect(); }
  }
};
FK.question.scan.stable = QuestionStable;
