const QuestionTree = {
  walk(rootDoc = document, docs = [], frames = [], visited = new Set()) {
    if (!rootDoc || visited.has(rootDoc)) return { docs, frames };
    visited.add(rootDoc); docs.push(rootDoc);
    for (const frame of rootDoc.querySelectorAll('iframe')) {
      try {
        const child = frame.contentDocument;
        if (child?.documentElement) this.walk(child, docs, frames, visited); else frames.push(frame);
      } catch (_) { frames.push(frame); }
    }
    return { docs, frames };
  },
  loading(rootDoc = document) {
    return this.walk(rootDoc).docs.filter(doc => doc.readyState === 'loading').length;
  }
};
FK.question.scan.tree = QuestionTree;
