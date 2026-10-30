// node test/filter.test.mjs — 정규화·사전 규칙이 깨지면 여기서 멈춘다.
import assert from 'node:assert/strict';
import '../src/dict.js';
import '../src/filter.js';

const F = globalThis.MallangFilter;

assert.equal(F.normalize('ㅅㅣㅂㅏㄹ'), '시발');
assert.equal(F.normalize('시 . 발'), '시발');
assert.equal(F.normalize('ＳＩＢＡＬ'), 'sibal');
assert.equal(F.normalize('ㅅㅂㅅㅂ'), 'ㅅㅂㅅㅂ');
assert.equal(F.normalize('씨이이발'), '씨이발');

for (const bad of ['ㅅㅂ 이게 뭐냐', '시..발 진짜', 'ㅅㅣㅂㅏㄹ', 'tlqkf', '편집 진짜 ㅈ같네', '개 새 끼', '꺼져 진짜', '병🤬신']) {
  assert.ok(F.check(bad).hit, `걸려야 함: ${bad}`);
}
for (const ok of ['시발점부터 다시 보자', '오늘도 잘 보고 갑니다', '미친 퀄리티네요', '시바견 귀여워', '뇌가 없나 ㅋㅋ', '불이 꺼져가요']) {
  assert.ok(!F.check(ok).hit, `걸리면 안 됨: ${ok}`);
}
assert.equal(F.check('병신같네').type, '욕설');
assert.equal(F.fingerprint('꺼져 진짜'), F.fingerprint('꺼져  진짜!!'));
assert.notEqual(F.fingerprint('꺼져 진짜'), F.fingerprint('좋아요'));
console.log('filter ok');
