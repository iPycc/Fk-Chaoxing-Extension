const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
function harness(settings = {}, autoApply = false) {
  const notices = [];
  const logs = [];
  const state = { aiBatchSettings: settings, autoApplyAnswers: autoApply };
  const context = vm.createContext({
    console, URL, AbortController, setTimeout, clearTimeout,
    chrome: { storage: { local: { async get() { return state; } } }, runtime: {} },
    AINotify: new Proxy({}, { get: (_, key) => (...args) => notices.push([key, ...args]) }),
    GlobalLogger: new Proxy({}, { get: (_, key) => (...args) => logs.push([key, ...args]) }),
    DropdownQuestions: { validateAnswer() { return ''; } }
  });
  const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  load('modules/ai-answer/config.js');
  load('modules/ai-answer/api.js');
  load('modules/ai-answer/core.js');
  const run = script => vm.runInContext(script, context);
  context.questions = [];
  context.autoApply = autoApply;
  run(`AIAnswerCore.collectQuestions = async () => questions;
    AIAnswerCore.isAutoApplyEnabled = async () => autoApply;
    AIAnswerCore.displayAnswers = (batch, answers) => { globalThis.displayed.push(batch.map(q => q.index)); };
    globalThis.displayed = [];
    globalThis.applied = [];
    AIAnswerCore.applyAnswers = async (batch, answers) => {
      globalThis.applied.push(batch.map(q => q.index));
      return { appliedCount: batch.length, skippedCount: 0 };
    };`);
  context.config = { baseUrl: 'https://example.com/v1', apiKey: 'fake', model: 'model' };
  return { context, run, notices, logs, state };
}

function questions(count) {
  return Array.from({ length: count }, (_, i) => ({ index: i + 1, title: `Q${i + 1}`, type: 'single_choice' }));
}

function answerJson(batch) {
  return JSON.stringify({ answers: batch.map((_, index) => ({ questionIndex: index + 1, answer: 'A' })) });
}

test('200 questions form four simultaneous slices and map late completions to original indices', async () => {
  const { context, run } = harness({ batchSize: 50, concurrency: 4, maxRetries: 0 }, true);
  context.questions = questions(200);
  const requests = [];
  context.request = batch => new Promise(resolve => requests.push({ batch, resolve }));
  run('AIApi.getAnswers = batch => request(batch)');
  const job = run('AIAnswerCore.processAllQuestions(config)');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 4);
  assert.deepEqual(requests.map(item => [item.batch[0].index, item.batch.length]), [[1, 50], [51, 50], [101, 50], [151, 50]]);
  for (const n of [3, 1, 0, 2]) {
    requests[n].resolve(answerJson(requests[n].batch));
    await new Promise(resolve => setImmediate(resolve));
  }
  const result = await job;
  assert.equal(result.answeredCount, 200);
  assert.equal(result.appliedCount, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(context.displayed.map(batch => batch[0]))), [151, 51, 1, 101]);
  assert.equal(run('AIAnswerCore.isProcessing'), false);
});

test('concurrency one processes 300 questions in order and retains the short final slice', async () => {
  const { context, run } = harness({ batchSize: 30, concurrency: 1, maxRetries: 0 });
  context.questions = questions(301);
  const batches = [];
  context.request = async batch => { batches.push(batch); return answerJson(batch); };
  run('AIApi.getAnswers = batch => request(batch)');
  assert.equal((await run('AIAnswerCore.processAllQuestions(config)')).answeredCount, 301);
  assert.deepEqual(batches.map(batch => batch.length), [...Array(10).fill(30), 1]);
  assert.deepEqual(batches.map(batch => batch[0].index), [1, 31, 61, 91, 121, 151, 181, 211, 241, 271, 301]);
});

test('completed slices enter a serialized page-writing queue', async () => {
  const { context, run } = harness({ batchSize: 1, concurrency: 3, maxRetries: 0 }, true);
  context.questions = questions(3);
  let activeWrites = 0;
  let maxActiveWrites = 0;
  const releases = [];
  context.write = () => new Promise(resolve => {
    activeWrites++;
    maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
    releases.push(() => { activeWrites--; resolve(); });
  });
  run(`AIApi.getAnswers = async batch => JSON.stringify({answers:[{questionIndex:1,answer:'A'}]});
    AIAnswerCore.applyAnswers = async (batch, answers) => {
      await write();
      return {appliedCount:batch.length,skippedCount:0};
    };`);
  const job = run('AIAnswerCore.processAllQuestions(config)');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(releases.length, 1);
  for (let index = 0; index < 3; index++) {
    releases[index]();
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal((await job).appliedCount, 3);
  assert.equal(maxActiveWrites, 1);
});

test('retryable errors are retried only for their slice and exhausted slices do not block others', async () => {
  const { context, run, notices } = harness({ batchSize: 2, concurrency: 2, maxRetries: 2 }, true);
  context.questions = questions(6);
  const calls = new Map();
  context.request = async batch => {
    const start = batch[0].index;
    calls.set(start, (calls.get(start) || 0) + 1);
    if (start === 1 && calls.get(start) < 3 || start === 3) {
      const err = new Error('429');
      err.retryable = true;
      throw err;
    }
    return answerJson(batch);
  };
  context.setTimeout = callback => callback();
  run('AIApi.getAnswers = batch => request(batch)');
  const result = await run('AIAnswerCore.processAllQuestions(config)');
  assert.deepEqual([...calls], [[1, 3], [3, 3], [5, 1]]);
  assert.equal(result.answeredCount, 4);
  assert.equal(result.appliedCount, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(result.failures)), [{ start: 3, end: 4, message: '429' }]);
  assert.ok(notices.some(([type, text]) => type === 'warning' && String(text).includes('部分完成')));
});

test('authentication errors fail without retry and invalid answers are retriable', async () => {
  const { context, run } = harness({ batchSize: 1, concurrency: 1, maxRetries: 2 });
  context.questions = questions(1);
  let calls = 0;
  context.request = async () => { calls++; const err = new Error('401'); err.retryable = false; throw err; };
  run('AIApi.getAnswers = batch => request(batch)');
  const result = await run('AIAnswerCore.processAllQuestions(config)');
  assert.equal(calls, 1);
  assert.equal(result.failures.length, 1);
  for (const text of ['bad json', '{"answers":[]}', '{"answers":[{"questionIndex":1,"answer":""}]}']) {
    context.text = text;
    assert.throws(() => run('AIApi.parseAnswers(text, questions)'), err => err.retryable === true);
  }
});

test('batch settings validate bounds and fall back on corrupt storage', async () => {
  const { run, state } = harness({ batchSize: 0, concurrency: 9, maxRetries: -1 });
  const defaults = await run('AIConfig.loadBatchSettings()');
  assert.deepEqual(JSON.parse(JSON.stringify(defaults)), { batchSize: 50, concurrency: 4, maxRetries: 2 });
  state.aiBatchSettings = { batchSize: 30, concurrency: 1, maxRetries: 0 };
  const stored = await run('AIConfig.loadBatchSettings()');
  assert.deepEqual(JSON.parse(JSON.stringify(stored)), state.aiBatchSettings);
  assert.throws(() => run('AIConfig.normalizeBatchSettings({batchSize:2.5, concurrency:4, maxRetries:2})'));
});

test('content handler acknowledges the job before it finishes and rejects a second start', async () => {
  const { context, run } = harness();
  context.window = { self: 1, top: 1 };
  context.document = { readyState: 'loading', addEventListener() {} };
  let finish;
  const job = new Promise(resolve => { finish = resolve; });
  context.job = job.then(() => { context.completedAfterAck = true; });
  run('AIAnswerCore.isProcessing = false; AIAnswerCore.processAllQuestions = () => { AIAnswerCore.isProcessing = true; return job; }');
  context.responses = [];
  context.respond = value => context.responses.push(value);
  vm.runInContext(fs.readFileSync(path.join(root, 'content-message-handler.js'), 'utf8'), context);
  await run('ContentMessageHandler.handleMessage({action:"aiAnswer",config:{}}, {}, respond)');
  assert.equal(context.responses[0].message, '答题任务已启动');
  await run('ContentMessageHandler.handleMessage({action:"aiAnswer",config:{}}, {}, respond)');
  assert.equal(context.responses[1].success, false);
  finish();
  await context.job;
  assert.equal(context.completedAfterAck, true);
});

test('both API protocols remain non-streaming; transient HTTP failures are tagged', async () => {
  const context = vm.createContext({ URL, console, AbortController, setTimeout, clearTimeout,
    chrome: { runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} } } } });
  context.importScripts = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  context.importScripts('background.js');
  for (const type of ['chat_completions', 'responses']) {
    context.config = { baseUrl: 'https://example.com/v1', apiKey: 'fake', model: 'model', apiType: type };
    context.fetch = async (_, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.stream, false);
      assert.equal(type === 'responses' ? !!body.input : !!body.messages, true);
      return { ok: true, json: async () => type === 'responses'
        ? { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }] }
        : { choices: [{ finish_reason: 'stop', message: { content: 'OK' } }] } };
    };
    assert.equal(await vm.runInContext('callOpenAICompatibleAPI({config,messages:[]})', context), 'OK');
  }
  for (const [status, retryable] of [[429, true], [503, true], [401, false]]) {
    context.fetch = async () => ({ ok: false, status, text: async () => 'error' });
    await assert.rejects(vm.runInContext('callOpenAICompatibleAPI({config,messages:[]})', context), err => err.retryable === retryable);
  }
});

test('a 180-second request timeout is recoverable', async () => {
  const context = vm.createContext({ URL, console, AbortController, clearTimeout,
    setTimeout(callback, ms) { assert.equal(ms, 180000); queueMicrotask(callback); return 1; },
    chrome: { runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} } } } });
  context.importScripts = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  context.importScripts('background.js');
  context.config = { baseUrl: 'https://example.com/v1', apiKey: 'fake', model: 'model' };
  context.fetch = (_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  await assert.rejects(vm.runInContext('callOpenAICompatibleAPI({config,messages:[]})', context),
    err => err.retryable === true && /180/.test(err.message));
});
