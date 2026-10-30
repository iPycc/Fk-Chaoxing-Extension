const QuestionFrame = {
  requestType: 'FK_QUESTION_SCAN_REQUEST',
  resultType: 'FK_QUESTION_SCAN_RESULT',
  applyType: 'FK_QUESTION_APPLY_REQUEST',
  appliedType: 'FK_QUESTION_APPLY_RESULT',
  cancelType: 'FK_QUESTION_APPLY_CANCEL',
  installed: false,
  bridgeId: Math.random().toString(36).slice(2),
  localQuestions: new Map(),
  owners: new Map(),
  replies: new Map(),
  inbound: new Map(),

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
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener('message', receive);
        resolve(value);
      };
      const receive = event => {
        const data = event.data;
        if (event.source !== frame.contentWindow || event.origin !== origin || data?.type !== this.resultType ||
            data.requestId !== requestId || data.token !== token) return;
        const sections = (Array.isArray(data.sections) ? data.sections : []).map(section => ({ ...section,
          questions: (section.questions || []).map(question => {
            if (question.remote) this.owners.set(question.remote, { source: event.source, origin: event.origin });
            return { ...question, frameRemote: true };
          }) }));
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

  editorState(question) {
    const current = question && AIAnswerCore.parseQuestionContainer(question.container, question.docRef, question.sectionHeader);
    return JSON.stringify(current?.existingAnswer ?? null);
  },

  async applyLocal(question, data, signal) {
    const snap = data.snap;
    const current = question && AIAnswerCore.parseQuestionContainer(question.container, question.docRef, question.sectionHeader);
    const same = current && current.id === snap.id && current.title === snap.title && current.type === snap.type &&
      QuestionContainers.sameContext(current, snap) &&
      JSON.stringify(current.options) === JSON.stringify(snap.options) &&
      JSON.stringify(current.existingAnswer) === JSON.stringify(snap.existingAnswer) &&
      (snap.type !== 'programming' || current.answerDraft === snap.answerDraft) &&
      JSON.stringify(current.matchingGroups) === JSON.stringify(snap.matchingGroups) &&
      this.editorState(question) === data.editorState;
    if (!same) throw new Error('题目或答题区已变化，请刷新后重新生成');
    signal.throwIfAborted();
    const result = await AIAnswerCore.applyAnswerToQuestion(question, data.answer,
      { signal, timeoutSeconds: data.timeoutSeconds });
    signal.throwIfAborted();
    if (!result?.ok) return result;
    const updated = AIAnswerCore.parseQuestionContainer(question.container, question.docRef, question.sectionHeader);
    if (updated) Object.assign(question, updated);
    return { ...result,
      question: { ...QuestionSnapshot.question(question), index: snap.index, remote: data.remote },
      editorState: this.editorState(question) };
  },

  apply(remote, snap, answer, { signal, timeoutSeconds } = {}) {
    const target = this.owners.get(remote);
    if (!target) return Promise.reject(new Error('题目所在页面已失效，请刷新题目'));
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.replies.delete(requestId);
        signal?.removeEventListener('abort', cancel);
      };
      const cancel = () => {
        cleanup();
        target.source.postMessage({ type: this.cancelType, requestId }, target.origin);
        reject(signal?.reason || new DOMException('已停止填写', 'AbortError'));
      };
      const timer = setTimeout(() => {
        cleanup();
        target.source.postMessage({ type: this.cancelType, requestId }, target.origin);
        reject(Object.assign(new Error('iframe 填写或暂存超时'), { examSaveError: Boolean(snap.exam) }));
      }, AIConfig.normalizeTimeoutSeconds(timeoutSeconds) * 1000);
      signal?.addEventListener('abort', cancel, { once: true });
      this.replies.set(requestId, { target, resolve, reject, cleanup });
      target.source.postMessage({ type: this.applyType, requestId, remote, snap, answer,
        editorState: snap.editorState, timeoutSeconds }, target.origin);
    });
  },

  async handleApply(event, data) {
    const controller = new AbortController();
    this.inbound.set(data.requestId, controller);
    try {
      const local = this.localQuestions.get(data.remote);
      const result = local
        ? await this.applyLocal(local, data, controller.signal)
        : await this.apply(data.remote, data.snap, data.answer,
          { signal: controller.signal, timeoutSeconds: data.timeoutSeconds });
      event.source.postMessage({ type: this.appliedType, requestId: data.requestId,
        ok: Boolean(result?.ok), result }, event.origin);
    } catch (error) {
      event.source.postMessage({ type: this.appliedType, requestId: data.requestId, ok: false,
        error: error.message, examSaveError: error.examSaveError === true }, event.origin);
    } finally { this.inbound.delete(data.requestId); }
  },

  install() {
    if (this.installed) return;
    this.installed = true;
    window.addEventListener('message', async event => {
      const data = event.data;
      if (!data?.type || !this.allowed(event.origin)) return;

      if (data.type === this.appliedType) {
        const pending = this.replies.get(data.requestId);
        if (!pending || event.source !== pending.target.source || event.origin !== pending.target.origin) return;
        pending.cleanup();
        if (data.ok) pending.resolve(data.result);
        else pending.reject(Object.assign(new Error(data.error || 'iframe 写入失败'),
          { examSaveError: data.examSaveError === true }));
        return;
      }

      if (event.source !== window.parent) return;
      if (data.type === this.cancelType) {
        this.inbound.get(data.requestId)?.abort();
        return;
      }
      if (data.type === this.applyType) {
        await this.handleApply(event, data);
        return;
      }
      if (data.type !== this.requestType || !data.requestId || !data.token) return;

      const parser = typeof AIAnswerCore !== 'undefined'
        ? (container, doc, header) => AIAnswerCore.parseQuestionContainer(container, doc, header) : null;
      const result = await QuestionCollector.collectOnce(document, { parser });
      const sections = result.sections.map(section => ({ header: section.header,
        questions: section.questions.map((question, index) => {
          let remote = question.remote;
          if (!remote) {
            remote = `${this.bridgeId}:${question.questionKey || index}`;
            this.localQuestions.set(remote, question);
          }
          return { ...QuestionSnapshot.question(question), remote,
            editorState: question.editorState ?? this.editorState(question) };
        }) }));
      event.source.postMessage({ type: this.resultType, requestId: data.requestId, token: data.token,
        sections, pendingFrames: result.pendingFrames, loadingFrames: result.loadingFrames,
        encryptedNodes: result.encryptedNodes, incompleteQuestions: result.incompleteQuestions }, event.origin);
    });
  }
};

FK.question.scan.frame = QuestionFrame;
