const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

let chromium;
try { ({ chromium } = require('playwright')); } catch (err) { /* Browser dependency is optional. */ }

test('AI collection counts nested modern questions once and retains legacy questions', { skip: !chromium }, async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const fixtures = [
      {
        html: `<div class="TiMu" id="section">${[1, 2, 3, 4].map(index =>
          `<div class="singleQuesId" id="question${index}" typename="程序题"><h3 class="mark_name">第${index}题</h3></div>`
        ).join('')}</div>`,
        titles: ['第1题', '第2题', '第3题', '第4题']
      },
      {
        html: '<div class="singleQuesId" id="question5"><div class="TiMu"><h3 class="mark_name">第5题</h3></div></div>' +
          '<div class="TiMu" id="legacy"><div class="Zy_TItle"><span class="fontLabel">传统题</span></div></div>',
        titles: ['第5题', '传统题']
      }
    ];

    for (const fixture of fixtures) {
      const page = await browser.newPage();
      try {
        await page.setContent(fixture.html);
        for (const file of ['modules/extractors/DropdownQuestions.js', 'modules/extractors/HomeworkExtractor.js',
          'modules/extractors/ExamExtractor.js', 'modules/services/QuestionCollector.js', 'modules/ai-answer/core.js']) {
          await page.addScriptTag({ path: path.resolve(__dirname, '..', file) });
        }
        const titles = await page.evaluate(async () => (await AIAnswerCore.collectQuestions()).map(question => question.title));
        assert.deepEqual(titles, fixture.titles);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});
