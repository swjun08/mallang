// 답글 코치: 댓글 입력창에서 손을 멈추면(1.2초) 쓴 글을 한 번 보고, 공격적이면 바꿔 쓸 문장을 제안한다.
// 절대 막지 않는다 — 유튜브 "댓글" 버튼은 그대로 살아 있고, 제안은 고를 수 있을 뿐이다.
(() => {
  const F = globalThis.MallangFilter;
  const C = globalThis.MallangContent;
  const IDLE = 1200;
  const dismissed = new Set(); // "그대로 쓰기"를 누른 글
  const seen = new Map(); // 글 → 판별 결과
  let timer = 0;

  document.addEventListener('input', (e) => {
    const root = e.target.closest?.('#contenteditable-root');
    if (!root) return;
    clearTimeout(timer);
    timer = setTimeout(() => check(root), IDLE);
  }, true);

  async function check(root) {
    const text = root.innerText.trim();
    const box = root.closest('ytd-commentbox') || root.parentElement;
    if (!C.settings.enabled || text.length < 4 || dismissed.has(text)) return show(box, null);
    let r = seen.get(text);
    if (r === undefined) {
      const local = F.check(text);
      r = local.hit ? { severity: 3, type: local.type, keep: false, rewrite: '' } : null;
      if (C.settings.hasKey && !C.aiPaused()) {
        const res = await C.judgeOne(text).catch(() => null);
        if (res?.ok && res.results[0]) r = res.results[0];
      }
      seen.set(text, r);
    }
    if (root.innerText.trim() !== text) return; // 그새 더 썼다
    const strong = r && r.severity >= C.THRESHOLD[C.settings.level];
    show(box, strong ? { root, text, r } : null);
  }

  function show(box, s) {
    box.querySelector(':scope .ml-coach')?.remove();
    if (!s) return;
    const usable = s.r.keep && s.r.rewrite && !F.check(s.r.rewrite).hit;
    const el = document.createElement('div');
    el.className = 'ml-coach';
    el.innerHTML = `<img alt="" src="${C.IMG('surprised')}"><div class="ml-coach-bubble"><span class="ml-coach-msg"></span>
      ${usable ? '<div class="ml-coach-sug"></div>' : ''}
      <div class="ml-actions">${usable ? '<button type="button" class="ml-btn ml-btn--ink" data-c="use">바꾸기</button>' : ''}
      <button type="button" class="ml-btn ml-btn--ghost" data-c="keep">그대로 쓰기</button></div></div>`;
    el.querySelector('.ml-coach-msg').textContent = usable
      ? '이렇게 써 보면 어때요? 하고 싶은 말은 그대로예요.'
      : '읽는 사람에게 상처가 될 수 있는 말이에요. 한 번만 더 생각해 볼까요?';
    if (usable) el.querySelector('.ml-coach-sug').textContent = s.r.rewrite;
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-c]')?.dataset.c;
      if (!act) return;
      e.stopPropagation();
      if (act === 'use') replace(s.root, s.r.rewrite);
      else dismissed.add(s.text);
      el.remove();
    });
    const footer = box.querySelector('#footer');
    footer ? footer.before(el) : (box.querySelector('#creation-box') || s.root).after(el);
  }

  // execCommand는 오래된 API지만, 유튜브 입력창이 "사람이 친 것"으로 알아듣게(댓글 버튼 활성화 등) 하는 가장 짧은 길이다.
  function replace(root, text) {
    root.focus();
    const range = document.createRange();
    range.selectNodeContents(root);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('insertText', false, text);
  }
})();
