const QuestionFrame = {
  requestType: 'FK_QUESTION_SCAN_REQUEST', resultType: 'FK_QUESTION_SCAN_RESULT', installed: false,
  allowed(origin) {
    try { const host = new URL(origin).hostname.toLowerCase(); return host === 'chaoxing.com' || host.endsWith('.chaoxing.com'); }
    catch (_) { return false; }
  },
  origin(frame) {
    try {
      const origin = new URL(frame.getAttribute('src') || frame.src, frame.ownerDocument.baseURI).origin;
      return this.allowed(origin) ? origin : '';
    } catch (_) { return ''; }
  },
  scan(frame, token, timeoutMs = 2000) {
    const origin = this.origin(frame);
    if (!origin) return Promise.resolve({ sections: [], pending: 0 });
    if (!frame.contentWindow) return Promise.resolve({ sections: [], pending: 1 });
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return new Promise(resolve => {
      let done = false;
      const finish = value => {
        if (done) return; done = true; clearTimeout(timer); window.removeEventListener('message', receive); resolve(value);
      };
      const receive = event => {
        const data = event.data;
        if (event.source !== frame.contentWindow || event.origin !== origin || data?.type !== this.resultType ||
            data.requestId !== requestId || data.token !== token) return;
        const sections = (Array.isArray(data.sections) ? data.sections : []).map(section => ({ ...section,
          questions: (section.questions || []).map(question => ({ ...question, frameRemote: true })) }));
        finish({ sections, pending: data.pendingFrames || 0,
          loadingFrames: data.loadingFrames || 0, encryptedNodes: data.encryptedNodes || 0,
          incompleteQuestions: data.incompleteQuestions || 0 });
      };
      window.addEventListener('message', receive);
      const timer = setTimeout(() => finish({ sections: [], pending: 1 }), timeoutMs);
      try { frame.contentWindow.postMessage({ type: this.requestType, requestId, token }, origin); }
      catch (_) { finish({ sections: [], pending: 1 }); }
    });
  },
  install() {
    if (this.installed) return; this.installed = true;
    window.addEventListener('message', async event => {
      const data = event.data;
      if (data?.type !== this.requestType || !data.requestId || !data.token || !this.allowed(event.origin) || event.source !== window.parent) return;
      const parser = typeof AIAnswerCore !== 'undefined'
        ? (container, doc, header) => AIAnswerCore.parseQuestionContainer(container, doc, header) : null;
      const result = await QuestionCollector.collectOnce(document, { parser });
      const sections = result.sections.map(section => ({ header: section.header,
        questions: section.questions.map(question => QuestionSnapshot.question(question)) }));
      event.source.postMessage({ type: this.resultType, requestId: data.requestId, token: data.token,
        sections, pendingFrames: result.pendingFrames, loadingFrames: result.loadingFrames,
        encryptedNodes: result.encryptedNodes, incompleteQuestions: result.incompleteQuestions }, event.origin);
    });
  }
};
FK.question.scan.frame = QuestionFrame;
