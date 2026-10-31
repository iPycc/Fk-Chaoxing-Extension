const QuestionReport = {
  create(overrides = {}) {
    return { status: overrides.status || 'empty', pendingFrames: overrides.pendingFrames || 0,
      encryptedNodes: overrides.encryptedNodes || 0, loadingFrames: overrides.loadingFrames || 0,
      incompleteQuestions: overrides.incompleteQuestions || 0, samples: overrides.samples || 0,
      elapsedMs: overrides.elapsedMs || 0, messages: Array.isArray(overrides.messages) ? overrides.messages : [] };
  },
  message(report) {
    if (report.status === 'stable') return '';
    const details = [];
    if (report.pendingFrames) details.push(`${report.pendingFrames} 个框架尚未响应`);
    if (report.loadingFrames) details.push(`${report.loadingFrames} 个框架仍在加载`);
    if (report.encryptedNodes) details.push(`${report.encryptedNodes} 处加密文本尚未解密`);
    if (report.incompleteQuestions) details.push(`${report.incompleteQuestions} 道题信息不完整`);
    return details.length ? `页面题目尚未稳定：${details.join('，')}` : '未找到完整题目';
  }
};
FK.question.service.report = QuestionReport;
