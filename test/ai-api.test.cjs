const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function setup(extra = {}) {
  const context = vm.createContext({ URL, console, AbortController, setTimeout, clearTimeout, chrome: {
    runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} } },
    storage: { local: { async get() { return {}; } } }
  }, ...extra });
  context.importScripts = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  context.importScripts('background.js');
  context.importScripts('modules/ai-answer/api.js');
  return { context, run: code => vm.runInContext(code, context) };
}
const profile = { baseUrl: 'https://example.com/v1/', apiKey: 'test-key', model: 'test-model' };
for (const apiType of ['chat_completions', 'responses']) {
  for (const reasoningEffort of ['', 'none', 'low', 'medium', 'high', 'xhigh', 'max']) {
    test(`${apiType}: ${reasoningEffort || 'default'} request and answer parsing`, async () => {
      const { context, run } = setup();
      context.config = { ...profile, apiType, reasoningEffort };
      const answer = '{"answers":[{"questionIndex":1,"answer":"B"}]}';
      context.fetch = async (url, options) => {
        assert.equal(url, `https://example.com/v1/${apiType === 'responses' ? 'responses' : 'chat/completions'}`);
        const body = JSON.parse(options.body);
        assert.equal(body.stream, false);
        assert.equal(body.temperature, apiType === 'responses' || reasoningEffort ? undefined : 0.3);
        assert.equal(options.headers.Authorization, 'Bearer test-key');
        if (apiType === 'responses') {
          assert.equal(body.messages, undefined);
          assert.equal(body.reasoning_effort, undefined);
          assert.equal(body.input[0].content, 'test');
          assert.equal(body.reasoning?.effort, reasoningEffort || undefined);
          assert.equal(body.store, false);
        } else {
          assert.equal(body.input, undefined);
          assert.equal(body.reasoning, undefined);
          assert.equal(body.messages[0].content, 'test');
          assert.equal(body.reasoning_effort, reasoningEffort || undefined);
        }
        return { ok: true, json: async () => apiType === 'responses'
          ? { status: 'completed', output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: answer.slice(0, 12) }, { type: 'output_text', text: answer.slice(12) }] }] }
          : { choices: [{ finish_reason: 'stop', message: { content: answer } }] } };
      };
      context.answer = await run('callOpenAICompatibleAPI({config, messages: [{role:"user",content:"test"}]})');
      assert.equal(context.answer, answer);
      assert.equal(run('AIApi.parseAnswers(answer, [{type:"single_choice"}])[0].answer'), 'B');
    });
  }
}
test('configuration migration, optional temperature and custom paths', () => {
  const { run } = setup();
  assert.equal(run('AIConfig.normalize({}).apiType'), 'chat_completions');
  assert.equal(run('AIConfig.normalize({}).reasoningEffort'), '');
  for (const value of ['null', '""', '"  "']) {
    assert.equal(run(`buildRequestBody(AIConfig.normalize({temperature:${value}}), []).temperature`), undefined);
  }
  assert.equal(run('AIConfig.normalize({temperature:0}).temperature'), 0);
  assert.throws(() => run('AIConfig.normalize({temperature:3})'), /温度/);
  assert.throws(() => run('AIConfig.normalize({reasoningEffort:"bogus"})'), /思考等级/);
  for (const value of ['', '/chat/completions', 'responses']) {
    assert.equal(run(`AIConfig.switchPath(${JSON.stringify(value)}, 'responses')`), '/responses');
  }
  assert.equal(run('AIConfig.switchPath("/custom/generate", "responses")'), '/custom/generate');
  assert.equal(run('AIConfig.normalize({path:"custom/generate"}).path'), '/custom/generate');
});
test('Responses failures, refusals, incomplete and empty output are errors', () => {
  const { context, run } = setup();
  for (const result of [
    { error: { message: 'unsupported effort' } },
    { status: 'failed' }, { status: 'in_progress' },
    { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } },
    { status: 'completed', output: [] },
    { status: 'completed', output: [{ type: 'reasoning' }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }
  ]) {
    context.result = result;
    assert.throws(() => run('extractResponseText(result, "responses")'));
  }
});
test('HTTP errors are preserved without retries or effort fallback', async () => {
  const { context, run } = setup();
  let requests = 0;
  context.config = profile;
  context.fetch = async () => { requests++; return { ok: false, status: 400, text: async () => 'unsupported reasoning effort' }; };
  await assert.rejects(run('callOpenAICompatibleAPI({config,messages:[]})'), /400.*unsupported reasoning effort/);
  assert.equal(requests, 1);
});
test('active and legacy profiles retain reasoning configuration', async () => {
  const { context, run } = setup();
  context.chrome.storage.local.get = async () => ({ aiConfig: profile });
  assert.equal((await run('AIApi.loadConfig()')).reasoningEffort, '');
  context.chrome.storage.local.get = async () => ({ activeAiProfileId: 'b', aiProfiles: [
    { ...profile, id: 'a' }, { ...profile, id: 'b', apiType: 'responses', path: '/responses', reasoningEffort: 'max' }
  ] });
  assert.equal((await run('AIApi.loadConfig()')).reasoningEffort, 'max');
});
for (const autoApply of [false, true]) {
  test(`core forwards the fixed config and ${autoApply ? 'applies' : 'displays'} parsed answers`, async () => {
    const { context, run } = setup();
    context.importScripts('modules/ai-answer/core.js');
    const calls = [];
    context.AINotify = new Proxy({}, { get: () => () => {} });
    context.GlobalLogger = { info() {}, success() {}, error() {} };
    context.chrome.runtime.sendMessage = (request, callback) => {
      calls.push(request);
      callback({ success: true, data: '{"answers":[{"questionIndex":1,"answer":"B"}]}' });
    };
    context.config = { ...profile, apiType: 'responses', reasoningEffort: 'max' };
    context.autoApply = autoApply;
    run(`
      AIAnswerCore.collectQuestions = async () => [{type:'single_choice',title:'Test',options:['A','B']}];
      AIAnswerCore.isAutoApplyEnabled = async () => autoApply;
      AIAnswerCore.applyAnswers = async (questions, answers) => { globalThis.applied = answers; return {appliedCount:1,skippedCount:0}; };
      AIAnswerCore.displayAnswers = (questions, answers) => { globalThis.displayed = answers; };
      AIApi.loadConfig = async () => { throw new Error('must use captured config'); };
    `);
    await run('AIAnswerCore.processAllQuestions(config)');
    assert.equal(calls[0].data.config.reasoningEffort, 'max');
    assert.equal(calls[0].data.config.path, '/responses');
    assert.equal(context.displayed[0].answer, 'B');
    assert.equal(context.applied?.[0].answer, autoApply ? 'B' : undefined);
    assert.equal(run('AIAnswerCore.isProcessing'), false);
  });
}
test('content handler forwards the popup config to the core', async () => {
  const { context, run } = setup();
  context.window = { self: 1, top: 1 };
  context.document = { readyState: 'loading', addEventListener() {} };
  context.config = { ...profile, reasoningEffort: 'none' };
  context.AIAnswerCore = { async processAllQuestions(config) { assert.equal(config, context.config); }, async collectQuestions() { return [{}]; } };
  context.callback = result => { assert.equal(result.success, true); };
  context.importScripts('content-message-handler.js');
  await run('ContentMessageHandler.handleMessage({action:"aiAnswer",config}, {}, callback)');
});
