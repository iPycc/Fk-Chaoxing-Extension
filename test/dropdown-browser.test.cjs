const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (err) { /* Browser dependency is optional. */ }
const optionMenu = (qid, type, labels) => `<ul class="options" style="display:none">${labels.map(label => `<li data="${label}" qid="${qid}" qtype="${type}"><a href="javascript:;">${label}</a></li>`).join('')}</ul>`;
const shell = (qid, type, body) => `<div class="questionLi singleQuesId" typename="${type}" data="${qid}" id="question${qid}"><h3 class="mark_name colorDeep"><span class="colorShallow">(${type})</span>测试题目</h3><input type="hidden" name="answer${qid}" id="answer${qid}" value="">${body}</div>`;
const sorting = (qid, labels) => shell(qid, '排序题', `<div class="stem_answer">${labels.map(label => `<div class="clearfix padbtom10"><span class="fl">${label}.</span><div class="p_wid805"><p>排序选项 ${label}</p></div></div>`).join('')}</div>${labels.map(() => `<strong class="selectBox order_box"><p><span class="sortSelect${qid}" value="-">-</span></p>${optionMenu(qid, 13, labels)}</strong>`).join('')}`);
const matching = (qid, ids) => {
  const labels = ids.map((_, i) => String.fromCharCode(65 + i));
  const group = (side, labels) => `<div class="line_wid_400 ${side}">${labels.map(label => `<div class="lineCt workTextWrap"><span class="fl span30">${label}.</span><div class="wid350"><p>配对选项 ${side}-${label}</p></div></div>`).join('')}</div>`;
  return shell(qid, '连线题', group('fl', ids.map((_, i) => i + 1)) + group('fr', labels) + `<div class="line_answer">${ids.map((id, i) => `<div class="line_answer_ct" index="${id}"><span class="line_option">${i + 1}</span><strong class="selectBox"><p><span class="connlineSelect${qid}" data="${id}" value=""></span></p>${optionMenu(qid, 11, labels)}</strong></div>`).join('')}</div>`);
};
const choice = (qid, multi) => shell(qid, multi ? '多选题' : '单选题', `<div class="stem_answer">${['A','B','C'].map(label => `<div class="answerBg"><span class="num_option" data="${label}">${label}.</span><label><input type="${multi ? 'checkbox' : 'radio'}" name="choice${qid}" value="${label}">选项 ${label}</label></div>`).join('')}</div>`);
const editor = (qid, fill) => shell(qid, fill ? '填空题' : '简答题', fill ? `<div class="stem_answer"><div class="Answer"><textarea id="answerEditor${qid}"></textarea></div></div>` : `<textarea id="answerEditor${qid}"></textarea>`);
test('dropdown answering handles sorting and matching controls', { skip: !chromium }, async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage();
    await page.setContent(sorting(101, ['A','B','C']) + sorting(102, ['A','B','C','D']) + matching(103, [1,3,2]) + matching(104, [4,2,1,3]) + choice(105, false) + choice(106, true) + editor(107, true) + editor(108, false));
    await page.evaluate(() => {
      window.warnings = [];
      window.AINotify = new Proxy({}, { get: (_, name) => (...args) => { if (name === 'warning') warnings.push(...args); } });
      window.GlobalLogger = new Proxy({}, { get: () => () => {} });
      window.choiceClicks = 0;
      // Reproduce the site's observed delegated selection and hidden-field encoding.
      document.addEventListener('click', event => {
        const li = event.target.closest('.selectBox ul li');
        if (!li || window.disableHandler) return;
        window.choiceClicks++;
        const span = li.closest('.selectBox').querySelector('p span');
        span.textContent = li.querySelector('a').textContent;
        span.setAttribute('value', li.getAttribute('data'));
        if (window.disableHiddenSync) return;
        const qid = li.getAttribute('qid');
        if (li.getAttribute('qtype') === '13') {
          document.getElementById('answer' + qid).value = Array.from(document.querySelectorAll('.sortSelect' + qid)).map(s => s.getAttribute('value')).join('');
        } else {
          const arr = Array.from(document.querySelectorAll('.connlineSelect' + qid)).map(s => ({name: s.getAttribute('data'), content: s.getAttribute('value')}));
          arr.sort((a,b) => Number(a.name) - Number(b.name));
          document.getElementById('answer' + qid).value = JSON.stringify(arr);
        }
      });
    });
    for (const file of ['modules/extractors/DropdownQuestions.js','modules/extractors/QuestionContainers.js','modules/extractors/HomeworkExtractor.js','modules/extractors/ExamExtractor.js','modules/services/QuestionCollector.js','modules/ai-answer/config.js','modules/ai-answer/api.js','modules/ai-answer/core.js']) {
      await page.addScriptTag({ path: path.resolve(__dirname, '..', file) });
    }
    const result = await page.evaluate(async () => {
      const q = Array.from(document.querySelectorAll('.singleQuesId')).map(c => AIAnswerCore.parseQuestionContainer(c, document, '测试'));
      window.questions = q;
      const raw = [{answers:['c','b','a']},{answers:['D','B','A','C']},{pairs:[{left:'1',right:'B'},{left:'2',right:'C'},{left:'3',right:'A'}]}, {pairs:[{left:'4',right:'A'},{left:'1',right:'A'},{left:'3',right:'C'},{left:'2',right:'B'}]}, {answer:'B'}, {answers:['A','C']}, {answers:['填空测试']}, {answer:'简答测试'}];
      window.answers = AIApi.parseAnswers(JSON.stringify({answers:raw.map((a,i)=>({...a,questionIndex:i+1}))}), q);
      const stats = await AIAnswerCore.applyAnswers(q, answers);
      const prompt = AIApi.buildPrompt(q);
      const copied = QuestionCollector.formatSections([{header:'测试',questions:HomeworkExtractor.extract(document)}]);
      return { types:q.map(x=>x.type), options:q[0].options, stats,
        sort3:document.getElementById('answer101').value, sort4:document.getElementById('answer102').value,
        match3:JSON.parse(document.getElementById('answer103').value), match4:JSON.parse(document.getElementById('answer104').value),
        single:document.getElementById('answer105').value, multi:document.getElementById('answer106').value,
        fill:document.getElementById('answerEditor107').value, short:document.getElementById('answerEditor108').value,
        promptHasGroups:prompt.includes('matchingGroups') && prompt.includes('配对选项 fl-2'), promptHasInternalId:prompt.includes('connlineSelect'),
        copied, copiedTitle:HomeworkExtractor.extract(document)[0].title, display:AIAnswerCore.formatAnswerForDisplay(answers[2]), exam:ExamExtractor.extract(document).slice(0,4).map(x=>x.type) };
    });
    assert.deepEqual(result.types, ['sorting','sorting','matching','matching','single_choice','multiple_choice','fill_blank','short_answer']);
    assert.deepEqual(result.stats, {appliedCount:8,skippedCount:0});
    assert.deepEqual(result.options, ['A. 排序选项 A','B. 排序选项 B','C. 排序选项 C']);
    assert.equal(result.copiedTitle, '(排序题) 测试题目');
    assert.equal(result.sort3, 'CBA'); assert.equal(result.sort4, 'DBAC');
    assert.deepEqual(result.match3,[{name:'1',content:'B'},{name:'2',content:'A'},{name:'3',content:'C'}]);
    assert.deepEqual(result.match4,[{name:'1',content:'C'},{name:'2',content:'B'},{name:'3',content:'A'},{name:'4',content:'A'}]);
    assert.equal(result.single,'B'); assert.equal(result.multi,'AC');
    assert.equal(result.fill,'<p>填空测试</p>'); assert.equal(result.short,'<p>简答测试</p>');
    assert.equal(result.promptHasGroups,true); assert.equal(result.promptHasInternalId,false);
    assert.match(result.copied,/第1组：[\s\S]*2\. 配对选项 fl-2[\s\S]*第2组：[\s\S]*C\. 配对选项 fr-C/);
    assert.equal(result.display,'1 → B；2 → C；3 → A');
    assert.deepEqual(result.exam, ['sorting','sorting','matching','matching']);
    const invalid = await page.evaluate(async () => {
      const before=document.getElementById('answer101').value, clicks=choiceClicks;
      const badSorting=[{}, {answers:['A']},{answers:['A','A','C']},{answers:['A','B','Z']},{answers:['A','B','C','D']},{answers:['Answer A','B','C']}];
      const badMatching=[{}, {pairs:[{left:'1',right:'A'}]}, {pairs:[{left:'1',right:'A'},{left:'1',right:'B'},{left:'3',right:'C'}]}, {pairs:[{left:'1',right:'Z'},{left:'2',right:'B'},{left:'3',right:'C'}]}];
      const normalized=[...badSorting.map(e=>AIApi.normalizeAnswerEntry(e,questions[0],0)),...badMatching.map(e=>AIApi.normalizeAnswerEntry(e,questions[2],0))];
      for (let i=0;i<normalized.length;i++) await AIAnswerCore.applyAnswers([questions[i<badSorting.length?0:2]],[normalized[i]]);
      return {allRejected:normalized.every(a=>a.error), unchanged:before===document.getElementById('answer101').value, clicks:choiceClicks-clicks};
    });
    assert.deepEqual(invalid,{allRejected:true,unchanged:true,clicks:0});
    const repeated=await page.evaluate(async()=>{
      const answer={type:'sorting',answers:['A','C','B']};
      const first=await AIAnswerCore.applyAnswers([questions[0]],[answer]);
      const second=await AIAnswerCore.applyAnswers([questions[0]],[answer]);
      return {first,second,value:document.getElementById('answer101').value};
    });
    assert.equal(repeated.value,'ACB'); assert.equal(repeated.first.appliedCount,1); assert.equal(repeated.second.appliedCount,1);
    const failures=await page.evaluate(async()=>{
      window.disableHandler=true;
      const noHandler=await AIAnswerCore.applyAnswers([questions[0]],[answers[0]]);
      window.disableHandler=false; window.disableHiddenSync=true;
      const staleField=await AIAnswerCore.applyAnswers([questions[0]],[answers[0]]);
      window.disableHiddenSync=false;
      const missing=document.querySelector('#question101 .order_box:last-child li[data="A"]');missing.remove();
      const clicks=choiceClicks;
      const partial=await AIAnswerCore.applyAnswers([questions[0],questions[2]],[answers[0],answers[2]]);
      return {noHandler,staleField,partial,clicks:choiceClicks-clicks};
    });
    assert.equal(failures.noHandler.skippedCount,1); assert.equal(failures.staleField.skippedCount,1);
    assert.deepEqual(failures.partial,{appliedCount:1,skippedCount:1}); assert.equal(failures.clicks,3);
    const readonly=await page.evaluate(async()=>{
      const clicks=choiceClicks;
      AIAnswerCore.collectQuestions=async()=>questions;
      AIAnswerCore.isAutoApplyEnabled=async()=>false;
      AIApi.getAnswers=async()=>JSON.stringify({answers:answers.map((a,i)=>({...a,questionIndex:i+1}))});
      await AIAnswerCore.processAllQuestions({baseUrl:'https://example.test',apiKey:'fake',model:'fake'});
      return choiceClicks-clicks;
    });
    assert.equal(readonly,0);
    console.log('PASS: 3/4-option sorting, shuffled 3/4-row matching, repeated right choices, both extractors, prompt/copy/display, invalid answers, overwrite/repeat, prevalidation, stale fields, failure isolation, readonly mode, four existing question types.');
  } finally { await browser.close(); }
});
