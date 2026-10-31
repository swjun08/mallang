const $ = (id) => document.getElementById(id);
const HINT = { 1: '욕설·혐오만 바꿔요', 2: '욕설·비하에 조롱까지 바꿔요', 3: '비꼼과 공격적인 말투까지 바꿔요' };
const today = () => new Date().toLocaleDateString('sv');

async function render() {
  const s = await chrome.storage.local.get(['enabled', 'level', 'apiKey', 'exceptions', 'stats', 'usage', 'aiStatus']);
  const enabled = s.enabled !== false;
  const level = s.level || 2;
  const st = s.stats?.day === today() ? s.stats : { softened: 0, hidden: 0, types: {} };

  document.body.classList.toggle('off', !enabled);
  $('enabled').setAttribute('aria-checked', String(enabled));

  const hero = $('hero-text');
  hero.replaceChildren();
  if (!enabled) {
    $('hero-img').src = '../assets/mallang-shy.png';
    hero.append('지금은 쉬고 있어요', small('켜면 댓글을 다시 말랑하게 바꿔요'));
  } else if (st.softened + st.hidden === 0) {
    $('hero-img').src = '../assets/mallang-neutral.png';
    hero.append('오늘은 아직', document.createElement('br'), '바꾼 댓글이 없어요', small('유튜브 댓글을 열면 말랑이 살펴봐요'));
  } else {
    $('hero-img').src = '../assets/mallang-happy.png';
    const em = document.createElement('em');
    em.textContent = `${st.softened}개`;
    hero.append('오늘 댓글 ', em, '를', document.createElement('br'), '말랑하게 바꿨어요');
    if (st.hidden) hero.append(small(`보기 힘든 댓글 ${st.hidden}개는 가렸어요`));
  }

  for (const b of $('level').children) b.setAttribute('aria-checked', String(+b.dataset.v === level));
  $('level-hint').textContent = HINT[level];

  const types = Object.entries(st.types).sort((a, b) => b[1] - a[1]);
  const total = types.reduce((n, [, v]) => n + v, 0);
  $('types-sec').hidden = !total;
  $('types-total').textContent = `전체 ${total}`;
  $('types').replaceChildren(...types.map(([name, n]) => {
    const row = document.createElement('div');
    row.className = 'bar';
    const bar = document.createElement('i');
    bar.style.setProperty('--w', `${Math.round((n / types[0][1]) * 100)}%`);
    const num = document.createElement('span');
    num.textContent = n;
    row.append(name, bar, num);
    return row;
  }));

  $('key-form').hidden = !!s.apiKey;
  $('key-set').hidden = !s.apiKey;
  $('key-label').textContent = s.apiKey ? `키 저장됨 · …${s.apiKey.slice(-4)}` : '';
  $('key-hint').hidden = !!s.apiKey;
  $('ai-info').hidden = !s.apiKey;
  if (s.apiKey) renderAi(s.usage?.day === today() ? s.usage : null, s.aiStatus);

  const ex = s.exceptions?.length || 0;
  $('ex-row').hidden = !ex;
  $('ex-clear').textContent = `${ex}개 되돌리기`;
}

const AI_ERROR = {
  bad_key: '키가 맞지 않아요. 키를 지우고 다시 넣어 주세요.',
  quota: '요청이 너무 많아요. 잠시 뒤 다시 시도해요.',
  credit: '크레딧이 부족해요. Claude Console에서 충전해 주세요.',
  refusal: 'Claude가 이 댓글 묶음 처리를 거절했어요. 사전으로만 가렸어요.',
  max_tokens: '응답이 너무 길어 잘렸어요.',
};

// 일반 API 키로는 잔액을 조회할 수 없어서, 말랑이 직접 센 오늘 사용량(어림값)과 마지막 응답 상태만 보여 준다
function renderAi(usage, status) {
  const u = $('ai-usage');
  u.replaceChildren();
  if (usage?.calls) {
    const b = document.createElement('b');
    b.textContent = `약 $${usage.cost < 0.01 ? usage.cost.toFixed(4) : usage.cost.toFixed(2)}`;
    u.append(`오늘 ${usage.calls}번 썼어요 · `, b);
  } else u.append('오늘은 아직 AI를 쓰지 않았어요');
  const st = $('ai-state');
  st.className = status && !status.ok ? 'bad' : '';
  st.textContent = !status
    ? ''
    : status.ok
      ? `마지막 응답 ${(status.ms / 1000).toFixed(1)}초`
      : AI_ERROR[status.code] || 'Claude에 연결하지 못했어요. 잠시 뒤 다시 시도해요.';
  st.title = status?.detail || '';
}

function small(text) {
  const el = document.createElement('small');
  el.textContent = text;
  return el;
}

$('enabled').onclick = async () => {
  const { enabled } = await chrome.storage.local.get('enabled');
  await chrome.storage.local.set({ enabled: enabled === false });
};
$('level').onclick = (e) => {
  const v = +e.target.closest('[data-v]')?.dataset.v;
  if (v) chrome.storage.local.set({ level: v });
};
// 붙여 넣을 때 섞이기 쉬운 공백·줄바꿈·따옴표를 지우고, Claude API 키 모양인지 저장 전에 확인한다
function checkKey(raw) {
  const key = raw.replace(/[\s"'“”‘’]/g, '');
  if (!key) return { error: 'Claude API 키를 붙여 넣어 주세요.' };
  if (key.startsWith('sk-ant-oat')) return { error: 'Claude 로그인 토큰이라 쓸 수 없어요. Claude Console → API Keys에서 만든 키를 넣어 주세요.' };
  if (key.startsWith('sk-ant-admin')) return { error: '관리자 키라 쓸 수 없어요. 일반 API 키를 넣어 주세요.' };
  if (!/^sk-ant-[a-z]+\d*-[\w-]{20,}$/.test(key)) return { error: 'Claude API 키는 sk-ant-로 시작해요. 끝까지 복사됐는지 확인해 주세요.' };
  return { key };
}

$('key-form').onsubmit = (e) => {
  e.preventDefault();
  const { key, error } = checkKey($('key').value);
  $('key-error').textContent = error || '';
  $('key-error').hidden = !error;
  if (!key) return;
  chrome.storage.local.set({ apiKey: key });
  chrome.storage.local.remove('aiStatus'); // 이전 키의 실패 기록은 지운다
  $('key').value = '';
};
$('key').oninput = () => ($('key-error').hidden = true);
$('key-clear').onclick = () => chrome.storage.local.remove(['apiKey', 'aiStatus']);
$('ex-clear').onclick = () => chrome.storage.local.set({ exceptions: [] });

chrome.storage.onChanged.addListener(render);
render();
