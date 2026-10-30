// 기기 안에서 도는 1차 필터: 우회 표기(초성·자모 분리·띄어쓰기·반복·전각 문자)를 되돌리고 욕설 사전과 맞춘다.
// 역할은 "AI 문지기"가 아니라 즉시 가림 + 오프라인 안전망 + 순화문 검사다. 욕 없는 조롱("뇌가 없나 ㅋㅋ")은
// 사전으로 못 잡으니 그건 AI가 맡는다. content script와 node 테스트(test/filter.test.mjs)가 같이 쓴다.
(() => {
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

  // "ㅅㅣㅂㅏㄹ" → "시발". 자음+모음(+받침) 순서가 맞을 때만 합친다("ㅅㅂ" 같은 초성체는 그대로 둔다).
  function composeJamo(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = CHO.indexOf(s[i]);
      const v = c >= 0 ? JUNG.indexOf(s[i + 1]) : -1;
      if (c < 0 || v < 0) { out += s[i]; continue; }
      let t = 0;
      const j = s[i + 2] ? JONG.indexOf(s[i + 2]) : -1;
      if (j > 0 && JUNG.indexOf(s[i + 3]) < 0) t = j;
      out += String.fromCharCode(0xac00 + (c * 21 + v) * 28 + t);
      i += t ? 2 : 1;
    }
    return out;
  }

  function normalize(text) {
    return composeJamo(
      String(text)
        // 전각·특수 문자 정리. 호환 자모(ㄱ-ㅣ)는 NFKC가 조합용 자모로 바꿔 버려서 건드리지 않는다.
        .replace(/[^㄰-㆏]/g, (ch) => ch.normalize('NFKC'))
        .toLowerCase()
        .replace(/[^가-힣ㄱ-ㅣa-z0-9]/g, '') // 띄어쓰기·기호·이모지로 끊어 쓴 것 붙이기
    ).replace(/(.)\1+/g, '$1'); // "시이이발"은 못 잡지만 "ㅅㅅㅂㅂ" 같은 반복은 접는다
  }

  let compiled = null;
  function dict() {
    if (compiled) return compiled;
    const src = globalThis.MALLANG_DICT || { words: [], allow: [] };
    compiled = {
      words: src.words.map(([w, type]) => ({ key: normalize(w), type })).filter((w) => w.key),
      allow: src.allow.map(normalize).filter(Boolean),
    };
    return compiled;
  }

  // → { hit, type, words } (words는 정규화된 사전 표현)
  function check(text) {
    const d = dict();
    let s = normalize(text);
    for (const a of d.allow) s = s.split(a).join('');
    const found = d.words.filter((w) => s.includes(w.key));
    return { hit: found.length > 0, type: found[0]?.type || null, words: found.map((w) => w.key) };
  }

  // 댓글 하나를 가리키는 짧은 지문(예외 목록 저장용 — 원문 대신 이것만 남긴다)
  function fingerprint(text) {
    let h = 0x811c9dc5;
    for (const ch of normalize(text)) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193);
    return (h >>> 0).toString(36);
  }

  globalThis.MallangFilter = { normalize, check, fingerprint };
})();
