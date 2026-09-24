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
        titles: ['第1题', '第2题', '第3题', '第4题'],
        examCount: 4
      },
      {
        html: '<div class="singleQuesId" id="question5"><div class="TiMu"><h3 class="mark_name">第5题</h3></div></div>' +
          '<div class="TiMu" id="legacy"><div class="Zy_TItle"><span class="fontLabel">传统题</span></div></div>' +
          '<div class="TiMu" id="legacyOuter"><div class="TiMu" id="legacyInner"><div class="Zy_Title">嵌套传统题</div></div></div>',
        titles: ['第5题', '传统题', '嵌套传统题'],
        examCount: 1
      },
      {
        html: `<div class="fanyaMarking TiMu" id="fanyaMarking">${Array.from({ length: 178 }, (_, i) =>
          `<div class="questionLi singleQuesId" id="question${i + 1}" typename="单选题"><h3 class="mark_name colorDeep">${i + 1}. (单选题) 第${i + 1}题</h3></div>`
        ).join('')}<div class="questionLi singleQuesId" id="question179" typename="连线题">
          <h3 class="mark_name colorDeep">179. (连线题) 最后一题</h3>
          <div class="line_wid_400 fl"><div class="lineCt"><span>1.</span>左侧</div></div>
          <div class="line_wid_400 fr"><div class="lineCt"><span>A.</span>右侧</div></div>
          <div class="line_answer_ct"><strong class="selectBox"><ul><li qtype="11">A</li></ul></strong></div>
        </div></div>`,
        titles: Array.from({ length: 178 }, (_, i) => `. (单选题) 第${i + 1}题`).concat('. (连线题) 最后一题'),
        examCount: 179
      }
    ];

    for (const fixture of fixtures) {
      const page = await browser.newPage();
      try {
        await page.setContent(fixture.html);
        for (const file of ['modules/extractors/DropdownQuestions.js', 'modules/extractors/QuestionContainers.js', 'modules/extractors/HomeworkExtractor.js',
          'modules/extractors/ExamExtractor.js', 'modules/services/QuestionCollector.js', 'modules/ai-answer/core.js']) {
          await page.addScriptTag({ path: path.resolve(__dirname, '..', file) });
        }
        const result = await page.evaluate(async () => ({
          ai: (await AIAnswerCore.collectQuestions()).map(question => question.title),
          homework: HomeworkExtractor.extract(document),
          exam: ExamExtractor.extract(document),
          copied: (await QuestionCollector.collectFromDocumentRecursive(document))
            .flatMap(section => section.questions).map(question => question.title),
          ids: QuestionContainers.find(document).map(container => container.id)
        }));
        assert.deepEqual(result.ai, fixture.titles);
        assert.equal(result.homework.length, fixture.titles.length);
        assert.equal(result.exam.length, fixture.examCount);
        assert.deepEqual(result.copied, result.homework.map(question => question.title));
        assert.equal(result.ids.length, fixture.titles.length);
        assert.equal(result.ids.includes('fanyaMarking'), false);
        assert.equal(result.ids.includes('legacyOuter'), false);
        if (fixture.examCount === 179) {
          assert.deepEqual(result.ids, Array.from({ length: 179 }, (_, i) => `question${i + 1}`));
          assert.deepEqual(result.homework.map(question => question.title), result.exam.map(question => question.title));
          assert.deepEqual(result.ai.map(title => title.replace(/^\. /, '')),
            result.homework.map(question => question.title));
          assert.equal(result.homework[0].title, '(单选题) 第1题');
          assert.equal(result.homework[178].type, 'matching');
          assert.equal(result.exam[178].type, 'matching');
          assert.equal(result.ids[178], 'question179');
        }
      } finally {
        await page.close();
      }
    }

    const page = await browser.newPage();
    try {
      await page.setContent('<div class="TiMu" id="outer"><div class="singleQuesId" id="question1"><h3 class="mark_name">主页面题</h3></div></div>' +
        '<iframe srcdoc="<div class=\'TiMu\' id=\'frameOuter\'><div class=\'singleQuesId\' id=\'question2\'><h3 class=\'mark_name\'>框架题</h3></div></div>"></iframe>');
      await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.querySelector('#question2'));
      for (const file of ['modules/extractors/DropdownQuestions.js', 'modules/extractors/QuestionContainers.js',
        'modules/extractors/HomeworkExtractor.js', 'modules/extractors/ExamExtractor.js',
        'modules/services/QuestionCollector.js', 'modules/ai-answer/core.js']) {
        await page.addScriptTag({ path: path.resolve(__dirname, '..', file) });
      }
      const result = await page.evaluate(async () => ({
        ai: (await AIAnswerCore.collectQuestions()).map(question => question.title),
        copied: (await QuestionCollector.collectFromDocumentRecursive(document))
          .flatMap(section => section.questions).map(question => question.title)
      }));
      assert.deepEqual(result.ai, ['主页面题', '框架题']);
      assert.deepEqual(result.copied, ['主页面题', '框架题']);
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
