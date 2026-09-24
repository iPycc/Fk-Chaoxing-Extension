const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let chromium;
try { ({ chromium } = require('playwright')); } catch (err) { /* Browser dependency is optional. */ }

test('popup settings navigation, storage, model migration and model save', { skip: !chromium }, async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 380, height: 600 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https?:/, route => route.abort());
    await page.addInitScript(() => {
      const profile = { id: 'old', name: '旧模型', baseUrl: 'https://example.com/v1',
        apiKey: 'fake', model: 'demo', path: '/chat/completions' };
      window.storageData = JSON.parse(sessionStorage.getItem('stored') || 'null') || { aiConfig: profile };
      window.requests = [];
      const listeners = [];
      window.chrome = {
        runtime: { onMessage: { addListener() {} }, sendMessage: async request => {
          requests.push(request);
          return { success: true, data: 'OK' };
        }, reload() {} },
        storage: {
          onChanged: { addListener(fn) { listeners.push(fn); } },
          local: {
            async get() { return structuredClone(storageData); },
            async set(values) {
              const changes = {};
              for (const [key, value] of Object.entries(values)) changes[key] = { newValue: structuredClone(value) };
              Object.assign(storageData, structuredClone(values));
              sessionStorage.setItem('stored', JSON.stringify(storageData));
              listeners.forEach(fn => fn(changes, 'local'));
            },
            async remove(key) { delete storageData[key]; sessionStorage.setItem('stored', JSON.stringify(storageData)); }
          }
        },
        permissions: { contains: async () => true, request: async () => true },
        action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
        tabs: {
          query: async () => [{ id: 1, url: 'https://mooc1.chaoxing.com/work/dowork', title: '试卷' }],
          sendMessage: async (_, request) => {
            requests.push(request);
            return { success: true, count: 200, message: '答题任务已启动', logs: [] };
          }
        }
      };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../popup.html')).href);
    await page.waitForFunction(() => document.querySelector('#btn-ai-text').textContent.includes('旧模型'));
    assert.equal(await page.evaluate(() => storageData.aiProfiles.length), 1);

    await page.click('#btn-ai-config-open');
    assert.equal(await page.locator('#view-settings').isVisible(), true);
    assert.equal(await page.locator('label[for="ai-batch-size"]').textContent(), '每次请求题目数');
    assert.equal(await page.locator('label[for="ai-concurrency"]').textContent(), '同时并发数');
    assert.equal(await page.locator('#ai-concurrency + p').textContent(), '更高的值会同时发出更多请求。');
    assert.equal(await page.locator('#ai-max-retries + p').textContent(), '0 表示不重试。');
    assert.equal(await page.inputValue('#ai-batch-size'), '50');
    await page.fill('#ai-batch-size', '30');
    await page.fill('#ai-concurrency', '1');
    await page.fill('#ai-max-retries', '3');
    await page.click('#btn-batch-save');
    assert.deepEqual(await page.evaluate(() => storageData.aiBatchSettings),
      { batchSize: 30, concurrency: 1, maxRetries: 3 });
    await page.fill('#ai-batch-size', '0');
    await page.click('#btn-batch-save');
    assert.equal(await page.locator('#batch-settings-error').isVisible(), true);
    assert.equal(await page.evaluate(() => storageData.aiBatchSettings.batchSize), 30);
    await page.fill('#ai-batch-size', '30');
    assert.equal(await page.locator('#batch-settings-error').isVisible(), false);
    await page.click('#btn-models-open');
    assert.equal(await page.locator('#view-models').isVisible(), true);
    await page.locator('.profile-edit').click();
    assert.equal(await page.locator('#view-model-editor').isVisible(), true);
    await page.screenshot({ path: '/tmp/fk-chaoxing-model-editor.png' });
    const actions = await page.locator('.editor-actions').boundingBox();
    assert.ok(actions.y + actions.height <= 600, 'editor actions remain visible');
    for (const id of ['view-home', 'view-settings', 'view-models', 'view-model-editor']) {
      assert.ok(await page.locator(`#${id}`).evaluate(element => element.scrollWidth <= element.clientWidth),
        `${id} has no horizontal overflow`);
    }
    await page.fill('#ai-profile-name', '新名称');
    await page.click('#btn-ai-config-save');
    assert.equal(await page.locator('#view-models').isVisible(), true);
    assert.equal(await page.evaluate(() => storageData.aiProfiles[0].name), '新名称');
    assert.equal(await page.evaluate(() => requests.filter(request => request.type === 'AI_API_REQUEST').length), 0);

    await page.locator('.profile-edit').click();
    await page.click('#btn-ai-config-test');
    await page.waitForFunction(() => !document.querySelector('#model-editor-status').hidden);
    assert.equal(await page.evaluate(() => requests.filter(request => request.type === 'AI_API_REQUEST').length), 1);
    await page.selectOption('#ai-api-type', 'responses');
    assert.equal(await page.inputValue('#ai-api-path'), '/responses');
    await page.selectOption('#ai-reasoning-effort', 'high');
    assert.equal(await page.isDisabled('#ai-temperature'), true);
    page.on('dialog', dialog => dialog.dismiss());
    await page.click('#btn-model-editor-back');
    assert.equal(await page.locator('#view-model-editor').isVisible(), true);
    page.removeAllListeners('dialog');
    page.on('dialog', dialog => dialog.accept());
    await page.click('#btn-model-editor-back');
    await page.click('#btn-ai-profile-new');
    await page.fill('#ai-profile-name', '另一个模型');
    await page.fill('#ai-base-url', 'https://api.example.org/v1');
    await page.fill('#ai-api-key', 'second-key');
    await page.fill('#ai-model-id', 'second-model');
    await page.click('#btn-ai-config-save');
    assert.equal(await page.evaluate(() => storageData.aiProfiles.length), 2);
    assert.equal(await page.evaluate(() => requests.filter(request => request.type === 'AI_API_REQUEST').length), 1);
    const inactiveRow = page.locator('.profile-row').first();
    const useButton = inactiveRow.locator('.profile-activate');
    assert.ok((await useButton.boundingBox()).width < 80, 'use button stays compact');
    assert.equal(await inactiveRow.locator('.profile-meta strong').isVisible(), true);
    assert.ok(await page.locator('#view-models').evaluate(view => view.scrollWidth <= view.clientWidth),
      'model list has no horizontal overflow with inactive models');
    await page.screenshot({ path: '/tmp/fk-chaoxing-model-list.png' });
    await page.locator('.profile-activate').click();
    assert.equal(await page.evaluate(() => storageData.activeAiProfileId), 'old');
    await page.click('#btn-models-back');
    await page.click('#btn-settings-back');
    await page.click('#btn-ai-answer');
    await page.waitForFunction(() => document.querySelector('#log-content').textContent.includes('答题任务已启动'));
    assert.equal(await page.evaluate(() => requests.some(request => request.action === 'aiAnswer')), true);
    await page.click('#btn-ai-config-open');
    assert.equal(await page.inputValue('#ai-batch-size'), '30');
    await page.screenshot({ path: '/tmp/fk-chaoxing-settings.png' });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#btn-ai-text').textContent.includes('新名称'));
    await page.click('#btn-ai-config-open');
    assert.equal(await page.inputValue('#ai-concurrency'), '1');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
