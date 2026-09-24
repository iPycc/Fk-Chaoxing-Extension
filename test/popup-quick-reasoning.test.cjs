const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let chromium;
try { ({ chromium } = require('playwright')); } catch (err) { /* Browser dependency is optional. */ }

test('popup quick reasoning retains the launch profile and restores drafts', { skip: !chromium }, async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 380, height: 600 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https?:/, route => route.abort());
    await page.addInitScript(() => {
      const profile = { id: 'one', name: 'Test', baseUrl: 'https://example.com/v1', path: '/responses',
        apiType: 'responses', reasoningEffort: 'high', model: 'test', apiKey: 'fake' };
      window.testState = JSON.parse(sessionStorage.getItem('mockStorage') || 'null') || { aiProfiles: [profile], activeAiProfileId: 'one' };
      window.requests = [];
      const listeners = [];
      window.chrome = {
        runtime: { onMessage: { addListener() {} }, async sendMessage(request) { window.requests.push(request); return { success: true, data: 'OK' }; } },
        storage: {
          onChanged: { addListener(fn) { listeners.push(fn); } },
          local: {
            async get() { return structuredClone(window.testState); },
            async set(values) {
              const changes = {};
              for (const [key, value] of Object.entries(values)) changes[key] = { oldValue: window.testState[key], newValue: structuredClone(value) };
              Object.assign(window.testState, structuredClone(values));
              sessionStorage.setItem('mockStorage', JSON.stringify(window.testState));
              listeners.forEach(fn => fn(changes, 'local'));
            },
            async remove(key) { delete window.testState[key]; sessionStorage.setItem('mockStorage', JSON.stringify(window.testState)); }
          }
        },
        permissions: { async contains() { return true; }, async request() { return true; } },
        action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
        tabs: {
          async query() { return [{ id: 1, url: 'https://mooc1.chaoxing.com/work/dowork', title: 'Test' }]; },
          async sendMessage(id, request, callback) {
            window.requests.push(request);
            if (request.action === 'aiAnswer' && window.delayAnswer) await new Promise(resolve => { window.releaseAnswer = resolve; });
            if (request.action === 'aiAnswer' && window.failAnswer) throw new Error('mock network failure');
            const result = { success: true, count: 1, content: '', logs: [] };
            if (callback) callback(result);
            return result;
          }
        }
      };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../popup.html')).href);
    await page.waitForFunction(() => document.querySelector('#btn-ai-text').textContent.includes('Test'));
    assert.equal(await page.inputValue('#ai-quick-reasoning'), 'high');
    await page.selectOption('#ai-quick-reasoning', 'max');
    await page.evaluate(() => { window.delayAnswer = true; });
    await page.click('#btn-ai-answer');
    await page.waitForFunction(() => !!window.releaseAnswer);
    await page.evaluate(async () => {
      const second = { ...testState.aiProfiles[0], id: 'two', name: 'Second', reasoningEffort: 'low' };
      await chrome.storage.local.set({ aiProfiles: [...testState.aiProfiles, second], activeAiProfileId: 'two' });
      releaseAnswer();
    });
    await page.waitForFunction(() => !document.querySelector('#ai-quick-reasoning').disabled);
    const request = await page.evaluate(() => requests.find(r => r.action === 'aiAnswer'));
    assert.equal(request.config.id, 'one');
    assert.equal(request.config.reasoningEffort, 'max');
    assert.equal(await page.inputValue('#ai-quick-reasoning'), 'low');
    assert.equal(await page.evaluate(() => testState.aiProfiles[0].reasoningEffort), 'high');
    await page.evaluate(() => { window.delayAnswer = false; window.failAnswer = true; });
    await page.selectOption('#ai-quick-reasoning', 'none');
    await page.click('#btn-ai-answer');
    await page.waitForFunction(() => !document.querySelector('#ai-quick-reasoning').disabled);
    assert.equal(await page.inputValue('#ai-quick-reasoning'), 'low');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#btn-ai-text').textContent.includes('Second'));
    assert.equal(await page.inputValue('#ai-quick-reasoning'), 'low');
    await page.evaluate(async () => {
      await chrome.storage.local.set({ aiProfiles: [], activeAiProfileId: null, aiConfig: null,
        aiConfigDraft: { name: 'Draft', model: 'draft-model', apiType: 'responses', reasoningEffort: 'xhigh', temperature: null } });
    });
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#view-model-editor').hidden);
    assert.equal(await page.inputValue('#ai-api-type'), 'responses');
    assert.equal(await page.inputValue('#ai-api-path'), '/responses');
    assert.equal(await page.inputValue('#ai-reasoning-effort'), 'xhigh');
    assert.equal(await page.inputValue('#ai-temperature'), '');
    assert.equal(await page.isDisabled('#ai-temperature'), true);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
