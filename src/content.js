// 유튜브 댓글을 말랑하게. 화면에 들어오기 직전의 댓글만 읽는다(안 본 댓글은 보내지도 않는다).
// 흐름: 감지 → 사전(즉시 가림) → AI 묶음 판별 → 강도 기준선과 비교 → 순화 / 가림 / 그대로.
// 유튜브는 댓글 요소를 재활용하므로 #content-text를 건드리지 않고, 숨긴 뒤 옆에 우리 블록을 붙인다.
(() => {
  const F = globalThis.MallangFilter;
  const COMMENT = 'ytd-comment-view-model';
  const BATCH = 20;
  const PENDING_TIMEOUT = 25000; // 이 안에 답이 없으면 사전만으로 처리하고, 답이 늦게 오면 그때 다시 그린다
  // 강도 → 바꾸기 시작하는 severity(1 비꼼 · 2 조롱 · 3 욕설)
  const THRESHOLD = { 1: 3, 2: 2, 3: 1 };
  const IMG = (pose) => chrome.runtime.getURL(`assets/mallang-${pose}.png`);

  let settings = { enabled: true, level: 2, exceptions: new Set(), hasKey: false, aiError: null };
  // 키가 틀렸거나 크레딧이 없으면 키를 바꿀 때까지 멈추고, 그 밖의 실패는 30초 쉰다(같은 오류로 계속 부르지 않게)
  let aiStopped = false;
  let aiPausedUntil = 0;
  const aiPaused = () => aiStopped || Date.now() < aiPausedUntil;
  const recs = new WeakMap(); // 댓글 요소 → 상태
  const cache = new Map(); // 원문 → AI 결과 (메모리에만, 저장하지 않음)
  const countedFp = new Set(); // 이 영상에서 이미 센 댓글(유튜브가 요소를 재활용해도 두 번 세지 않게)
  const MAX_LEN = 1000; // 이보다 긴 댓글은 앞부분만 보내므로 순화문을 믿지 않고 가린다
  let queue = [];
  let flushTimer = 0;
  let videoCount = 0;

  // ── 상태 판단 ──────────────────────────────────────────────

  function textOf(el) {
    return el.querySelector('#content-text')?.textContent.trim() || '';
  }

  function decide(rec) {
    if (!settings.enabled) return 'orig';
    if (settings.exceptions.has(rec.fp)) return 'orig';
    if (rec.status === 'new') return 'orig';
    if (rec.status === 'pending') return rec.local.hit ? 'hold-hidden' : 'hold';
    const r = rec.result;
    if (!r) return rec.local.hit ? 'hidden' : 'orig'; // AI 없음·실패 → 사전만 믿는다
    if (r.severity < THRESHOLD[settings.level]) return 'orig';
    return usableRewrite(rec) ? 'soft' : 'hidden';
  }

  // 의미 훼손 방지: 비었거나, 순화문에도 욕이 남았거나, 원문보다 지나치게 길면 쓰지 않고 가린다.
  function usableRewrite(rec) {
    const w = rec.result?.rewrite?.trim();
    return !!(rec.result.keep && w && !F.check(w).hit && rec.text.length <= MAX_LEN && w.length <= Math.max(80, rec.text.length * 2));
  }

  // ── 그리기 ────────────────────────────────────────────────

  function render(el) {
    const rec = recs.get(el);
    if (!rec) return;
    const mode = decide(rec);
    const sig = `${mode}|${rec.showOrig}|${rec.open}`;
    if (el.dataset.mlSig === sig && (mode === 'orig' || el.querySelector('.ml-block'))) return;
    el.dataset.mlSig = sig;
    queueHeader();

    el.querySelectorAll('.ml-block, .ml-chip').forEach((n) => n.remove());
    el.classList.remove('ml-hold', 'ml-replaced');
    if (mode === 'orig') return;
    if (mode === 'hold') {
      // 판정을 기다리는 동안: 원문은 흐리게, 시간 옆엔 "읽는 중" — 왜 흐린지 알 수 있게
      el.classList.add('ml-hold');
      return addChip(el, rec, true);
    }

    count(rec, mode);
    const expander = el.querySelector('#expander');
    if (!expander) return;
    const block = document.createElement('div');
    block.className = 'ml-block';

    if (mode === 'hold-hidden' || (mode === 'hidden' && !rec.showOrig)) {
      el.classList.add('ml-replaced');
      block.innerHTML = `<span class="ml-hidden"><span class="ml-blur" aria-hidden="true"></span><span class="ml-pill"></span></span>`;
      block.querySelector('.ml-blur').textContent = rec.text;
      block.querySelector('.ml-pill').innerHTML =
        `<img alt="" src="${IMG('shy')}">` +
        (mode === 'hold-hidden'
          ? '말랑이 읽는 중이에요'
          : '말랑이 가린 댓글이에요<button type="button" data-ml="show">보기</button>');
      expander.after(block);
      return;
    }

    addChip(el, rec);
    if (mode === 'soft') {
      el.classList.add('ml-replaced');
      const p = document.createElement('p');
      p.className = 'ml-text';
      p.textContent = rec.showOrig ? rec.text : rec.result.rewrite;
      block.append(p);
    }
    if (rec.open) block.append(card(rec, mode));
    if (block.childNodes.length) expander.after(block);
  }

  function addChip(el, rec, busy = false) {
    const at = el.querySelector('#published-time-text') || el.querySelector('#header-author');
    if (!at) return;
    const chip = document.createElement(busy ? 'span' : 'button');
    chip.className = busy ? 'ml-chip ml-chip--busy' : 'ml-chip';
    if (!busy) {
      chip.type = 'button';
      chip.dataset.ml = 'toggle';
      chip.setAttribute('aria-expanded', String(rec.open));
    }
    // 16px에선 입체 마스코트가 뭉개져서 칩에는 평면 아이콘을 쓴다
    chip.innerHTML = `<img alt="" src="${chrome.runtime.getURL('icons/icon-32.png')}">${busy ? '읽는 중' : '말랑'}`;
    at.after(chip);
  }

  function card(rec, mode) {
    const r = rec.result;
    const c = document.createElement('div');
    c.className = 'ml-card';
    const soft = mode === 'soft';
    // 마스코트가 바꾼 이유를 직접 말하고, 그 아래 원문을 보여 준다
    c.innerHTML = `
      <div class="ml-say"><img alt="" src="${IMG(soft ? 'neutral' : 'shy')}"><p class="ml-why"><b></b><span></span></p></div>
      ${soft ? '<div class="ml-orig-box"><span class="ml-label">원문</span><p class="ml-orig"></p></div>' : ''}
      <div class="ml-actions">
        <button type="button" class="ml-btn ml-btn--ink" data-ml="${soft ? 'flip' : 'hide'}">${soft ? (rec.showOrig ? '말랑하게 보기' : '원문으로 보기') : '다시 가리기'}</button>
        <button type="button" class="ml-btn" data-ml="ok">문제없는 댓글이에요</button>
      </div>`;
    if (soft) markEvidence(c.querySelector('.ml-orig'), rec.text, r.evidence);
    c.querySelector('.ml-why b').textContent = r?.type && r.type !== '없음' ? r.type : rec.local.type || '공격적 표현';
    c.querySelector('.ml-why span').textContent = soft
      ? '공격적인 표현을 빼고, 하고 싶은 말은 남겼어요.'
      : r
        ? '공격 말고는 남길 의견이 없어서 가렸어요.'
        : '욕설이 들어 있어서 가렸어요. AI를 연결하면 가리는 대신 말랑하게 바꿔요.'; // 키 없음·AI 실패 → 사전만 본 것
    return c;
  }

  function markEvidence(p, text, ev) {
    const at = ev ? text.indexOf(ev) : -1;
    if (at < 0) return (p.textContent = text);
    const em = document.createElement('em');
    em.textContent = ev;
    p.append(text.slice(0, at), em, text.slice(at + ev.length));
  }

  // ── 리포트 집계(오늘·이 영상) ──────────────────────────────

  let pendingStats = null;
  function count(rec, mode) {
    if (rec.counted || (mode !== 'soft' && mode !== 'hidden')) return;
    rec.counted = true;
    if (countedFp.has(rec.fp)) return;
    countedFp.add(rec.fp);
    videoCount++;
    updateHeader();
    const type = rec.result?.type && rec.result.type !== '없음' ? rec.result.type : rec.local.type || '기타';
    pendingStats ||= { softened: 0, hidden: 0, types: {} };
    pendingStats[mode === 'soft' ? 'softened' : 'hidden']++;
    pendingStats.types[type] = (pendingStats.types[type] || 0) + 1;
    clearTimeout(count.t);
    count.t = setTimeout(saveStats, 1000);
  }

  // 탭 여러 개가 동시에 쓰면 몇 건 빠질 수 있다. 오늘 숫자 보여주기 용도라 감수.
  async function saveStats() {
    const add = pendingStats;
    pendingStats = null;
    if (!add) return;
    const day = new Date().toLocaleDateString('sv');
    let { stats } = await chrome.storage.local.get('stats');
    if (stats?.day !== day) stats = { day, softened: 0, hidden: 0, types: {} };
    stats.softened += add.softened;
    stats.hidden += add.hidden;
    for (const [k, v] of Object.entries(add.types)) stats.types[k] = (stats.types[k] || 0) + v;
    await chrome.storage.local.set({ stats });
  }

  // 댓글 머리는 레이아웃마다 다르다: 영상 아래 댓글(ytd-comments-header-renderer, 화면 읽기 전용 사본이 하나 더 있음)
  // 또는 오른쪽 패널(engagement panel 제목줄). 실제로 보이는 쪽에 붙인다.
  const HEADER = 'ytd-comments-header-renderer #title, ytd-engagement-panel-section-list-renderer[target-id*="comments"] #title-container';
  let headerQueued = false;
  function queueHeader() {
    if (headerQueued) return;
    headerQueued = true;
    requestAnimationFrame(() => { headerQueued = false; updateHeader(); });
  }

  // 읽는 중이면 "댓글 N개를 읽고 있어요", 끝나면 "이 영상에서 N개를 말랑하게 바꿨어요"
  function updateHeader() {
    const title = [...document.querySelectorAll(HEADER)].find((t) => t.offsetWidth > 0);
    document.querySelectorAll('.ml-status').forEach((n) => n.parentElement !== title && n.remove());
    if (!title) return;
    let s = title.querySelector(':scope > .ml-status');
    const busy = document.querySelectorAll(`${COMMENT}[data-ml-sig^="hold"]`).length;
    const aiDown = settings.hasKey && settings.aiError;
    if (!settings.enabled || (!busy && !videoCount && !aiDown)) return s?.remove();
    if (!s) {
      s = document.createElement('div');
      s.className = 'ml-status';
      s.setAttribute('role', 'status');
      title.append(s);
    }
    const img = document.createElement('img');
    img.alt = '';
    img.src = IMG(busy ? 'neutral' : 'happy');
    const b = document.createElement('b');
    b.textContent = `${busy || videoCount}개`;
    const text = document.createElement('span');
    if (busy) text.append('댓글 ', b, '를 말랑이 읽고 있어요');
    else if (aiDown) {
      // AI가 실패하는 중이면 숨기지 않고 알린다(사전만으로 동작 중). 자세한 이유는 팝업에.
      img.src = IMG('shy');
      text.append('AI 연결에 문제가 있어 욕설만 가리고 있어요');
    } else text.append('이 영상에서 ', b, '를 말랑하게 바꿨어요');
    s.title = aiDown ? settings.aiError.detail || '' : '';
    s.classList.toggle('ml-status--busy', !!busy);
    s.replaceChildren(img, text);
  }

  // ── 판별 요청(묶음) ────────────────────────────────────────

  function enqueue(el) {
    const rec = recs.get(el);
    if (!rec || rec.status !== 'new') return;
    const cached = cache.get(rec.text);
    if (cached !== undefined) return finish(rec, el, cached);
    // 짧거나 글자가 없는 댓글("ㅋㅋ", 이모지만)은 사전에 안 걸리면 AI로 안 보낸다
    if (!rec.local.hit && F.normalize(rec.text).length < 4) return finish(rec, el, null);
    if (!settings.hasKey || aiPaused()) return finish(rec, el, null);
    rec.status = 'pending';
    render(el);
    queue.push(el);
    setTimeout(() => {
      if (rec.status !== 'pending') return;
      rec.timedOut = true;
      finish(rec, el, null);
    }, PENDING_TIMEOUT);
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, queue.length >= BATCH ? 0 : 250);
  }

  function finish(rec, el, result) {
    rec.status = 'done';
    rec.result = result;
    render(el);
  }

  async function flush() {
    const batch = queue.splice(0, BATCH);
    if (queue.length) flushTimer = setTimeout(flush, 250);
    const texts = [...new Set(batch.map((el) => recs.get(el)?.text).filter(Boolean))];
    if (!texts.length) return;
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: 'mallang:judge', texts });
    } catch {
      res = { ok: false }; // 확장이 다시 로드됐을 때 등
    }
    if (res?.code === 'no_key') settings.hasKey = false;
    else if (['bad_key', 'credit'].includes(res?.code)) aiStopped = true;
    else if (!res?.ok) aiPausedUntil = Date.now() + 30000;
    texts.forEach((t, i) => {
      const r = res?.ok ? res.results[i] : null;
      if (res?.ok) cache.set(t, r);
      for (const el of batch) {
        const rec = recs.get(el);
        if (rec?.text === t && (rec.status === 'pending' || (rec.timedOut && !rec.result))) finish(rec, el, r);
      }
    });
  }

  // ── 감지 ──────────────────────────────────────────────────

  // 화면 한 장 앞까지 미리 읽어, 스크롤해서 닿을 때는 이미 끝나 있게 한다.
  // 댓글이 자체 스크롤 상자(오른쪽 패널의 div#contents) 안에 있으면 그 상자를 기준으로 재야 미리 읽기가 된다.
  const ios = new Map(); // 기준(스크롤 상자 또는 null=화면) → IntersectionObserver
  function observerFor(el) {
    let root = el.parentElement;
    while (root && root !== document.body) {
      const oy = getComputedStyle(root).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && root.scrollHeight > root.clientHeight + 1) break;
      root = root.parentElement;
    }
    if (root === document.body) root = null;
    if (!ios.has(root)) {
      ios.set(root, new IntersectionObserver(
        (entries) => entries.forEach((e) => e.isIntersecting && enqueue(e.target)),
        { root, rootMargin: '100% 0px' }
      ));
    }
    return ios.get(root);
  }
  function watch(el, rec) {
    rec.io?.unobserve(el);
    rec.io = observerFor(el);
    rec.io.observe(el);
  }

  function scan() {
    if (!chrome.runtime?.id) return teardown();
    for (const el of document.querySelectorAll(COMMENT)) {
      const text = textOf(el);
      const rec = recs.get(el);
      if (rec && rec.text === text) continue;
      if (rec) {
        // 유튜브가 요소를 다른 댓글로 재활용했다
        rec.io?.unobserve(el);
        el.querySelectorAll('.ml-block, .ml-chip').forEach((n) => n.remove());
        el.classList.remove('ml-hold', 'ml-replaced');
        delete el.dataset.mlSig;
      }
      if (!text) continue;
      const fresh = {
        text, fp: F.fingerprint(text), local: F.check(text),
        status: 'new', result: null, showOrig: false, open: false, counted: false,
      };
      recs.set(el, fresh);
      watch(el, fresh);
    }
    updateHeader();
  }

  function rerenderAll() {
    for (const el of document.querySelectorAll(COMMENT)) {
      const rec = recs.get(el);
      if (!rec) continue;
      if (rec.status === 'new' && settings.enabled) watch(el, rec);
      render(el);
    }
    updateHeader();
  }

  let scanTimer = 0;
  const mo = new MutationObserver(() => {
    if (!scanTimer) scanTimer = setTimeout(() => { scanTimer = 0; scan(); }, 200);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  // 확장을 새로고침하면 이미 열려 있던 탭의 이 스크립트는 크롬 API를 못 쓴다.
  // 반쯤 고장 난 화면을 남기지 않게 손을 떼고 원래 유튜브로 되돌린다(새 버전은 탭을 새로고침하면 붙는다).
  function teardown() {
    mo.disconnect();
    ios.forEach((io) => io.disconnect());
    document.querySelectorAll('.ml-block, .ml-chip, .ml-status, .ml-coach').forEach((n) => n.remove());
    document.querySelectorAll('.ml-hold, .ml-replaced').forEach((n) => n.classList.remove('ml-hold', 'ml-replaced'));
  }

  document.addEventListener('yt-navigate-finish', () => {
    videoCount = 0;
    countedFp.clear();
    updateHeader();
  });

  // ── 클릭 ──────────────────────────────────────────────────

  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-ml]');
    const el = btn?.closest(COMMENT);
    const rec = el && recs.get(el);
    if (!rec) return;
    e.preventDefault();
    e.stopPropagation();
    const act = btn.dataset.ml;
    if (act === 'toggle') rec.open = !rec.open;
    if (act === 'flip') rec.showOrig = !rec.showOrig;
    if (act === 'show') { rec.showOrig = true; rec.open = false; }
    if (act === 'hide') { rec.showOrig = false; rec.open = false; }
    if (act === 'ok') {
      rec.open = false;
      settings.exceptions.add(rec.fp);
      chrome.storage.local.set({ exceptions: [...settings.exceptions] });
    }
    render(el);
  }, true);

  // ── 설정 ──────────────────────────────────────────────────

  function applySettings(s) {
    if ('enabled' in s) settings.enabled = s.enabled !== false;
    if ('level' in s) settings.level = THRESHOLD[s.level] ? s.level : 2;
    if ('exceptions' in s) settings.exceptions = new Set(s.exceptions || []);
    if ('apiKey' in s) {
      settings.hasKey = !!s.apiKey;
      aiStopped = false;
      aiPausedUntil = 0;
    }
    if ('aiStatus' in s) settings.aiError = s.aiStatus && !s.aiStatus.ok ? s.aiStatus : null;
  }

  chrome.storage.local.get(['enabled', 'level', 'exceptions', 'apiKey', 'aiStatus']).then((s) => {
    applySettings({ enabled: true, level: 2, exceptions: [], apiKey: '', ...s });
    scan();
  });
  chrome.storage.onChanged.addListener((changes) => {
    const s = {};
    for (const [k, v] of Object.entries(changes)) s[k] = v.newValue;
    applySettings(s);
    if ('aiStatus' in s) queueHeader();
    if ('apiKey' in s && s.apiKey) cache.clear();
    if (['enabled', 'level', 'exceptions', 'apiKey'].some((k) => k in s)) {
      // 키를 새로 넣으면 사전만으로 처리했던 댓글을 AI로 다시 본다
      if ('apiKey' in s) for (const el of document.querySelectorAll(COMMENT)) { const r = recs.get(el); if (r) r.status = 'new'; }
      rerenderAll();
    }
  });

  globalThis.MallangContent = { settings, aiPaused, judgeOne: (text) => chrome.runtime.sendMessage({ type: 'mallang:judge', texts: [text] }), THRESHOLD, IMG };
})();
