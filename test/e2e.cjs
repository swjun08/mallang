// 확장을 Chromium에 올려 화면을 확인한다. Claude API 응답은 가짜(MOCK)로 바꿔 끼워 키 없이도 AI 경로를 돈다.
//   PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node test/e2e.cjs [출력 폴더]
// mock: 유튜브 댓글 DOM을 흉내 낸 페이지(순화·가림·코치·강도·다크)  real: 진짜 유튜브(첫 댓글 3개를 가짜로 순화)
// playwright-core는 이편한자막 e2e와 같은 npx 캐시 것을 쓴다.
const { chromium } = require('/Users/bagseojun/.npm/_npx/9833c18b2d85bc59/node_modules/playwright-core');
const path = require('path');
const EXT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'mallang-e2e'));
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MOCK = [
  ['뇌가 없나', { severity: 2, type: '조롱', evidence: '뇌가 없나 ㅋㅋ', keep: true, rewrite: '영상 구성이 많이 아쉬웠어요. 다음엔 더 기대할게요.' }],
  ['ㅈ같', { severity: 3, type: '욕설', evidence: 'ㅈ같네', keep: true, rewrite: '자막 폰트가 영상이랑 잘 안 어울리는 것 같아요.' }],
  ['꺼져', { severity: 3, type: '욕설', evidence: '꺼져', keep: false, rewrite: '' }],
  ['접는 게', { severity: 1, type: '비꼼', evidence: '유튜브 접는 게 낫겠다', keep: true, rewrite: '다음 영상은 더 나아졌으면 좋겠어요.' }],
  ['생각이 없는', { severity: 2, type: '조롱', evidence: '생각이 없는 듯', keep: true, rewrite: '이번 영상은 구성이 좀 아쉬웠어요. 다음 편 기대할게요.' }],
];
let realHits = 0;
function fakeJudge(text, real) {
  for (const [k, r] of MOCK) if (text.includes(k)) return r;
  if (real && realHits < 3) { realHits++; return { severity: 2, type: '조롱', evidence: text.slice(0, 6), keep: true, rewrite: '(테스트) 말랑이 바꾼 문장이 이 자리에 보여요.' }; }
  return { severity: 0, type: '없음', evidence: '', keep: true, rewrite: '' };
}

const COMMENTS = [
  ['@haru_film', '3:12 전환 어떻게 하신 건지 알려 주실 수 있나요? 너무 자연스러워요'],
  ['@hwanan123', '뇌가 없나 ㅋㅋ 이걸 영상이라고 올림?'],
  ['@minchoNo', '자막 폰트 진짜 ㅈ같네 영상이랑 하나도 안 어울림'],
  ['@user-k2x9', '꺼져 진짜 다시는 올리지 마'],
  ['@geunyang', '이 정도면 유튜브 접는 게 낫겠다'],
  ['@yuna.log', '편집 따라 하려고 왔다가 영상 자체가 재밌어서 끝까지 봤네요 ㅋㅋ'],
];
const page = (dark, panel) => `<!doctype html><html lang="ko" ${dark ? 'dark' : ''}><head><meta charset="utf-8"><style>
body{margin:0;padding:24px 40px;font:14px Roboto,'Apple SD Gothic Neo',sans-serif;background:${dark ? '#0f0f0f' : '#fff'};color:${dark ? '#f1f1f1' : '#0f0f0f'};width:860px}
#title{display:flex;align-items:center;gap:32px;margin-bottom:24px} h2{font-size:20px;margin:0}
ytd-commentbox,ytd-comment-view-model{display:block;margin-bottom:24px}
#contenteditable-root{border-bottom:1px solid currentColor;padding:6px 0;outline:0}
#footer{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}#footer span{padding:9px 16px;border-radius:18px;font-weight:600}
#header-author{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600}#published-time-text{font-weight:400;color:#888}
#content-text{display:block;line-height:20px;margin-top:2px}
.av{float:left;width:40px;height:40px;border-radius:50%;background:#bbb;margin-right:16px}ytd-comment-view-model #main{overflow:hidden}
</style></head><body>
<ytd-comments-header-renderer><div id="title"><div id="leading-section"><h2 id="count">댓글 ${COMMENTS.length}개</h2></div><div id="additional-section">정렬 기준</div></div></ytd-comments-header-renderer>
<ytd-commentbox><div class="av"></div><div id="main"><div id="creation-box"><div id="contenteditable-root" contenteditable="true"></div></div><div id="footer"><span>취소</span><span style="background:#065fd4;color:#fff">댓글</span></div></div></ytd-commentbox>
${panel ? '<div id="contents" style="height:220px;overflow-y:auto;border:1px solid #ddd">' : ''}${COMMENTS.map(([who, t]) => `<ytd-comment-view-model><div class="av"></div><div id="main"><div id="header"><div id="header-author"><h3 style="margin:0;font-size:13px">${who}</h3><span id="published-time-text">3시간 전</span></div></div><ytd-expander id="expander"><div id="content"><yt-attributed-string id="content-text"><span>${t}</span></yt-attributed-string></div></ytd-expander><div style="font-size:12px;color:#888;margin-top:6px">좋아요 12 · 답글</div></div></ytd-comment-view-model>`).join('')}${panel ? '</div>' : ''}
</body></html>`;

(async () => {
  const ctx = await chromium.launchPersistentContext(require('os').tmpdir() + '/mallang-e2e-' + Date.now(), {
    executablePath: '/Users/bagseojun/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    headless: true, viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 2, locale: 'ko-KR',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const log = [];
  let real = false;
  let calls = 0;
  let failMode = false;
  await ctx.route('https://api.anthropic.com/**', async (route) => {
    calls++;
    if (failMode) return route.fulfill({ status: 400, json: { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } } });
    const body = JSON.parse(route.request().postData());
    const items = JSON.parse(body.messages[0].content);
    const results = items.map(({ i, t }) => ({ i, ...fakeJudge(t, real) }));
    await sleep(1500); // 실제처럼 늦게 — "읽는 중" 표시를 확인하려고
    await route.fulfill({ json: { type: 'message', role: 'assistant', stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 500 }, content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify({ results }) }] } });
  });
  await ctx.route('https://www.youtube.com/mallang-test*', (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: page(route.request().url().includes('dark'), route.request().url().includes('panel')) }));

  let [sw] = ctx.serviceWorkers();
  sw ||= await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const setStorage = (v) => sw.evaluate((v) => chrome.storage.local.set(v), v);
  const step = (name, ok) => { log.push(`${ok ? 'PASS' : 'FAIL'} ${name}`); };

  const p = await ctx.newPage();
  p.on('pageerror', (e) => log.push('[pageerror] ' + e.message));

  // 1) 키 없음 → 사전에 걸린 것만 가림
  await p.goto('https://www.youtube.com/mallang-test');
  await sleep(1500);
  const noKey = await p.evaluate(() => [...document.querySelectorAll('ytd-comment-view-model')].map((el) => el.classList.contains('ml-replaced')));
  step('키 없음: 욕설 2개만 가림 ' + JSON.stringify(noKey), JSON.stringify(noKey) === '[false,false,true,true,false,false]');
  await p.screenshot({ path: `${OUT}/1-no-key.png`, fullPage: true });
  await p.goto('https://www.youtube.com/mallang-test?panel');
  await sleep(1500);
  const pre = await p.evaluate(() => [...document.querySelectorAll('ytd-comment-view-model')].map((el) => !!el.dataset.mlSig));
  step('패널: 상자 아래 댓글도 미리 읽음 ' + JSON.stringify(pre), pre[3] === true);
  await p.goto('https://www.youtube.com/mallang-test');
  await sleep(1500);

  // 2) 키 있음 → AI 순화
  await setStorage({ apiKey: 'test-key', level: 2 });
  await sleep(700);
  step('읽는 중: 댓글 칩', (await p.$$('.ml-chip--busy')).length >= 1);
  step('읽는 중: 머리 줄', (await p.textContent('.ml-status').catch(() => '')).includes('읽고 있어요'));
  await p.screenshot({ path: `${OUT}/1b-reading.png`, clip: { x: 0, y: 0, width: 1000, height: 700 } });
  await sleep(2500);
  const modes = await p.evaluate(() => [...document.querySelectorAll('ytd-comment-view-model')].map((el) =>
    el.querySelector('.ml-text')?.textContent || (el.querySelector('.ml-blur') ? 'HIDDEN' : 'ORIG')));
  step('보통: 조롱·욕설 순화, 꺼져는 가림, 비꼼은 그대로 ' + JSON.stringify(modes),
    modes[0] === 'ORIG' && modes[1].startsWith('영상 구성이') && modes[2].startsWith('자막 폰트') && modes[3] === 'HIDDEN' && modes[4] === 'ORIG' && modes[5] === 'ORIG');
  step('묶음 요청 1번 (' + calls + ')', calls === 1);
  step('머리 상태 줄', (await p.textContent('.ml-status').catch(() => '')).includes('3개'));

  // 3) 칩 → 카드 → 원문 보기
  await p.click('ytd-comment-view-model:nth-of-type(2) .ml-chip');
  await sleep(200);
  await p.screenshot({ path: `${OUT}/2-softened-card.png`, fullPage: true });
  await p.click('ytd-comment-view-model:nth-of-type(2) [data-ml="flip"]');
  step('원문으로 보기', (await p.textContent('ytd-comment-view-model:nth-of-type(2) .ml-text')).includes('뇌가 없나'));

  // 4) 강도 강하게 → 비꼼까지, API 다시 안 부름
  await setStorage({ level: 3 });
  await sleep(400);
  step('강하게: 비꼼도 순화', (await p.textContent('ytd-comment-view-model:nth-of-type(5)')).includes('나아졌으면'));
  step('강도 바꿔도 API 안 부름 (' + calls + ')', calls === 1);

  // 5) 가린 댓글 보기 → 문제없어요
  await p.click('ytd-comment-view-model:nth-of-type(4) [data-ml="show"]');
  step('가린 댓글 보기', await p.isVisible('ytd-comment-view-model:nth-of-type(4) #expander'));
  await p.click('ytd-comment-view-model:nth-of-type(3) .ml-chip');
  await p.click('ytd-comment-view-model:nth-of-type(3) [data-ml="ok"]');
  await sleep(300);
  step('문제없어요 → 원문 복원', !(await p.$('ytd-comment-view-model:nth-of-type(3) .ml-text')));

  // 줄바꿈이 든 댓글도 번호가 안 섞인다(JSON으로 보냄)
  await p.evaluate(() => { document.querySelector('ytd-comment-view-model:nth-of-type(6) #content-text span').textContent = '첫 줄은 평범\n뇌가 없나 ㅋㅋ 이걸 영상이라고'; });
  await sleep(2500);
  step('줄바꿈 댓글 순화', ((await p.textContent('ytd-comment-view-model:nth-of-type(6) .ml-text').catch(() => '')) || '').startsWith('영상 구성이'));

  // 6) 답글 코치
  await p.click('#contenteditable-root');
  await p.keyboard.type('이걸 영상이라고 올린 거면 진짜 생각이 없는 듯');
  await sleep(3500);
  step('코치 뜸', await p.isVisible('.ml-coach'));
  await p.screenshot({ path: `${OUT}/3-coach.png`, clip: { x: 0, y: 0, width: 1000, height: 420 } });
  await p.click('.ml-coach [data-c="use"]');
  step('바꾸기 → 입력창 교체', (await p.textContent('#contenteditable-root')).includes('구성이 좀 아쉬웠어요'));

  // 7) 다크
  await setStorage({ level: 2, exceptions: [] });
  await p.goto('https://www.youtube.com/mallang-test?dark');
  await sleep(1500);
  await p.click('ytd-comment-view-model:nth-of-type(2) .ml-chip');
  await sleep(200);
  await p.screenshot({ path: `${OUT}/4-dark.png`, fullPage: true });

  // 8) 팝업
  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 340, height: 640 });
  await pop.goto(`chrome-extension://${extId}/popup/popup.html`);
  await sleep(500);
  step('팝업 사용량 ' + JSON.stringify(await pop.textContent('#ai-usage')), (await pop.textContent('#ai-usage')).includes('번 썼어요'));
  step('팝업 응답 시간', (await pop.textContent('#ai-state')).includes('마지막 응답'));
  await pop.screenshot({ path: `${OUT}/5-popup.png`, fullPage: true });
  // 키 형식 검사: 다른 종류 키는 저장 전에 막고, 공백·따옴표 섞인 키는 다듬어 저장
  await pop.click('#key-clear');
  await pop.fill('#key', 'AIzaSyFakeGeminiKey');
  await pop.click('#key-form button');
  step('키 형식 오류 안내', (await pop.isVisible('#key-error')) && (await pop.textContent('#key-error')).includes('sk-ant-api'));
  await pop.fill('#key', ' "sk-ant-api03-' + 'a'.repeat(30) + 'WXYZ" \n');
  await pop.click('#key-form button');
  await sleep(300);
  step('키 다듬어 저장 ' + JSON.stringify(await pop.textContent('#key-label')), (await pop.textContent('#key-label')).includes('…WXYZ'));
  await sleep(2500); // 새 키로 다시 판별하는 요청이 끝날 때까지(아래 실패 모드와 겹치지 않게)

  // AI 실패: 크레딧 부족 → 댓글창 머리와 팝업에 알린다
  failMode = true;
  await p.goto('https://www.youtube.com/mallang-test?fail');
  await sleep(2500);
  step('AI 실패 → 머리 줄 ' + JSON.stringify(await p.textContent('.ml-status').catch(() => '')), (await p.textContent('.ml-status').catch(() => '')).includes('AI 연결에 문제'));
  const before = calls;
  await p.evaluate(() => { document.querySelector('ytd-comment-view-model #content-text span').textContent = '새로 달린 댓글인데 이건 좀 아닌 듯'; });
  await sleep(1500);
  step(`크레딧 부족 뒤엔 다시 안 부름 (${before}→${calls})`, calls === before);
  await pop.reload();
  await sleep(500);
  step('AI 실패 → 팝업 ' + JSON.stringify(await pop.textContent('#ai-state')), (await pop.textContent('#ai-state')).includes('크레딧이 부족'));
  await pop.screenshot({ path: `${OUT}/5-popup-fail.png`, fullPage: true });
  failMode = false;
  await pop.emulateMedia({ colorScheme: 'dark' });
  await pop.screenshot({ path: `${OUT}/5-popup-dark.png`, fullPage: true });

  // 9) 진짜 유튜브(댓글 DOM 실물 확인)
  if (!process.env.SKIP_REAL) {
    real = true;
    const y = await ctx.newPage();
    y.on('pageerror', (e) => log.push('[yt pageerror] ' + e.message));
    await y.setViewportSize({ width: 1400, height: 1000 });
    await y.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw');
    for (let i = 0; i < 8; i++) { await y.mouse.wheel(0, 500); await sleep(1000); }
    await y.waitForSelector('ytd-comment-view-model .ml-chip', { timeout: 30000 }).catch(() => {});
    const n = await y.$$eval('.ml-chip', (a) => a.length);
    step(`진짜 유튜브: 칩 ${n}개`, n >= 1);
    await y.click('ytd-comment-view-model .ml-chip').catch(() => {});
    await sleep(300);
    const c = await y.$('ytd-comment-view-model:has(.ml-chip)');
    await c?.scrollIntoViewIfNeeded();
    await sleep(300);
    await y.screenshot({ path: `${OUT}/6-real-youtube.png` });
  }

  console.log(log.join('\n'));
  await ctx.close();
})().catch((e) => { console.error('FATAL', e.stack); process.exit(1); });
