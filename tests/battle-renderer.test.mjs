import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attackClassNames,
  buildAttackEffectMarkup,
  buildBattleMarkup,
  buildProjectileMarkup,
  playBattleAnimation,
  playSpriteFrames,
  resolveAssetUrl,
} from '../web/js/battle-renderer.mjs';
import { readFile } from 'node:fs/promises';

const viewModel = {
  scene: { label: '神殿決鬥', image: './assets/battle/scenes/palace.png' },
  players: {
    left: { name: '紅方', health: 100, score: 2, image: './left.png' },
    right: { name: '藍方', health: 70, score: 1, image: './right.png' },
  },
  progress: '3／10',
  prompt: '下列何者正確？',
  choices: ['甲', '乙', '丙', '丁'],
  status: '兩位玩家請搶答',
  phase: 'regulation',
};

test('戰鬥畫面包含場景、雙方角色、血條、題目與音量控制', () => {
  const html = buildBattleMarkup(viewModel);
  assert.match(html, /palace\.png/);
  assert.match(html, /left\.png/);
  assert.match(html, /right\.png/);
  assert.match(html, /data-health="right"[^>]*style="--health:70%"/);
  assert.match(html, /下列何者正確？/);
  assert.match(html, /data-audio-toggle/);
  assert.match(html, /data-master-volume/);
  assert.match(html, /data-music-volume/);
  assert.match(html, /data-effects-volume/);
});

test('驟死階段顯示驟死提示', () => {
  const html = buildBattleMarkup({ ...viewModel, phase: 'sudden-death' });
  assert.match(html, /驟死決勝/);
});

test('雙方皆錯時標示正確答案', () => {
  const html = buildBattleMarkup({ ...viewModel, revealAnswerIndex: 2 });
  assert.match(html, /battle-choice is-correct-reveal/);
  assert.match(html, /答案揭示/);
});

test('場景網址以頁面根目錄解析，不會因 CSS 檔位置重複 assets 路徑', () => {
  assert.equal(
    resolveAssetUrl('./assets/battle/scenes/ship.png', 'http://localhost:4173/'),
    'http://localhost:4173/assets/battle/scenes/ship.png',
  );
});

test('沒有原始武器的角色仍會產生可見能量彈', () => {
  assert.match(buildProjectileMarkup(null, 'left'), /energy-bolt from-left/);
  assert.match(buildProjectileMarkup('./weapon.png', 'right'), /flying-weapon from-right/);
});

test('三種攻擊建立不同特效且只有氣功產生投射物', () => {
  const energy = buildAttackEffectMarkup({ attackType: 'energy', player: 'left', opponent: 'right', damage: 10 });
  const punch = buildAttackEffectMarkup({ attackType: 'punch', player: 'left', opponent: 'right', damage: 10 });
  const kick = buildAttackEffectMarkup({ attackType: 'kick', player: 'left', opponent: 'right', damage: 10 });
  assert.match(energy.weapon, /energy-bolt/);
  assert.doesNotMatch(punch.weapon, /energy-bolt/);
  assert.doesNotMatch(kick.weapon, /energy-bolt/);
  assert.doesNotMatch(energy.weapon, /melee-strike/);
  assert.match(punch.weapon, /melee-strike strike-punch from-left/);
  assert.match(punch.weapon, /strike-limb strike-fist[^>]*><span class="strike-glyph">拳</);
  assert.match(kick.weapon, /melee-strike strike-kick from-left/);
  assert.match(kick.weapon, /strike-limb strike-boot[^>]*><span class="strike-glyph">腳</);
  assert.match(punch.impact, /impact-punch/);
  assert.match(kick.impact, /impact-kick/);
  assert.match(punch.impact, /melee-symbol-punch/);
  assert.match(punch.impact, />拳</);
  assert.match(punch.impact, /attack-callout-punch[^>]*>重拳/);
  assert.match(punch.impact, /from-left/);
  assert.match(kick.impact, /melee-symbol-kick/);
  assert.match(kick.impact, />腳</);
  assert.match(kick.impact, /attack-callout-kick[^>]*>飛踢/);
  assert.match(kick.impact, /from-left/);
  assert.doesNotMatch(energy.impact, /melee-symbol|重拳|飛踢/);
});

test('近身漫畫特效保留攻擊方向', () => {
  const rightPunch = buildAttackEffectMarkup({ attackType: 'punch', player: 'right', opponent: 'left', damage: 10 });
  assert.match(rightPunch.weapon, /strike-punch from-right/);
  assert.match(rightPunch.weapon, /strike-glyph[^>]*>拳</);
  assert.match(rightPunch.impact, /from-right/);
  assert.match(rightPunch.impact, /damage-left/);
});

test('每種攻擊提供不同攻擊者與受擊者類別', () => {
  assert.deepEqual(attackClassNames('energy'), { actor: 'attack-energy', target: 'hit-energy' });
  assert.deepEqual(attackClassNames('punch'), { actor: 'attack-punch', target: 'hit-punch' });
  assert.deepEqual(attackClassNames('kick'), { actor: 'attack-kick', target: 'hit-kick' });
});

test('受擊動作與傷害特效等到命中時間才出現', async () => {
  let now = 0;
  const timers = [];
  const schedule = (callback, delay) => {
    const timer = { at: now + delay, callback, canceled: false };
    timers.push(timer);
    return timer;
  };
  const cancelSchedule = timer => { timer.canceled = true; };
  const tick = duration => {
    const targetTime = now + duration;
    while (true) {
      const timer = timers
        .filter(candidate => !candidate.canceled && candidate.at <= targetTime)
        .sort((left, right) => left.at - right.at)[0];
      if (!timer) break;
      timer.canceled = true;
      now = timer.at;
      timer.callback();
    }
    now = targetTime;
  };
  const makeClassList = initial => {
    const values = new Set(initial);
    return {
      add: (...names) => names.forEach(name => values.add(name)),
      remove: (...names) => names.forEach(name => values.delete(name)),
      contains: name => values.has(name),
    };
  };
  const actor = { classList: makeClassList(['fighter-left']), querySelector: () => null };
  const target = { classList: makeClassList(['fighter-right']) };
  const weaponLayer = { innerHTML: '' };
  const impactLayer = { innerHTML: '' };
  const root = {
    querySelector(selector) {
      return {
        '[data-fighter="left"]': actor,
        '[data-fighter="right"]': target,
        '[data-weapon]': weaponLayer,
        '[data-impact]': impactLayer,
      }[selector] ?? null;
    },
  };

  const animation = playBattleAnimation(root, { type: 'attack', player: 'left', opponent: 'right', damage: 10 }, {
    attackType: 'punch', duration: 80, impactDelay: 20, reactionDuration: 300, schedule, cancelSchedule,
  });
  assert.match(weaponLayer.innerHTML, /melee-strike strike-punch/);
  assert.equal(target.classList.contains('is-hit'), false);
  assert.equal(impactLayer.innerHTML, '');
  tick(19);
  assert.equal(target.classList.contains('is-hit'), false);
  tick(1);
  assert.equal(target.classList.contains('hit-punch'), true);
  assert.match(impactLayer.innerHTML, /impact-punch/);
  tick(299);
  assert.equal(target.classList.contains('hit-punch'), true);
  assert.match(impactLayer.innerHTML, /impact-punch/);
  tick(1);
  await animation;
  assert.equal(target.classList.contains('is-hit'), false);
  assert.equal(weaponLayer.innerHTML, '');
  assert.equal(impactLayer.innerHTML, '');
});

test('攻擊時依序播放原始角色影格並回復待機圖', async () => {
  const assignments = [];
  const image = {
    _src: './idle.png',
    get src() { return this._src; },
    set src(value) { this._src = value; assignments.push(value); },
  };

  await playSpriteFrames(image, ['./attack-1.png', './attack-2.png', './attack-3.png'], 30);

  assert.deepEqual(assignments.slice(0, 3), ['./attack-1.png', './attack-2.png', './attack-3.png']);
  assert.equal(assignments.at(-1), './idle.png');
});

test('減少動態模式仍保留可辨識的攻擊與命中效果', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  const reducedMotion = css.slice(css.indexOf('@media(prefers-reduced-motion:reduce)'));
  assert.doesNotMatch(reducedMotion, /animation-duration:\s*\.01ms/);
  assert.match(css, /\.energy-bolt/);
});

test('CSS 包含三種攻擊與三種受擊動畫', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  for (const name of ['attack-energy', 'attack-punch', 'attack-kick', 'hit-energy', 'hit-punch', 'hit-kick']) {
    assert.match(css, new RegExp(`\\.${name}`));
  }
  assert.match(css, /\.impact-punch/);
  assert.match(css, /\.impact-kick/);
});

test('CSS 提供大型拳腳圖形、文字與方向樣式', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  for (const selector of [
    '.melee-symbol-punch',
    '.melee-symbol-kick',
    '.attack-callout-punch',
    '.attack-callout-kick',
    '.melee-impact.from-left',
    '.melee-impact.from-right',
  ]) {
    assert.match(css, new RegExp(selector.replaceAll('.', '\\.')));
  }
  assert.match(css, /@keyframes punchLeft/);
  assert.match(css, /@keyframes kickLeft/);
  assert.match(css, /@keyframes hitPunchLeft/);
  assert.match(css, /@keyframes hitKickLeft/);
});

test('CSS 讓拳頭水平伸出並讓腳沿弧線踢出', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  for (const selector of ['.melee-strike', '.strike-fist', '.strike-boot', '.strike-punch.from-left', '.strike-punch.from-right', '.strike-kick.from-left', '.strike-kick.from-right']) {
    assert.match(css, new RegExp(selector.replaceAll('.', '\\.')));
  }
  for (const animation of ['extendPunchLeft', 'extendPunchRight', 'swingKickLeft', 'swingKickRight', 'fistPop', 'bootSwing']) {
    assert.match(css, new RegExp(`@keyframes ${animation}`));
  }
  const mobile = css.slice(css.indexOf('@media(max-width:760px)'));
  const reduced = css.slice(css.indexOf('@media(prefers-reduced-motion:reduce)'));
  assert.match(mobile, /melee-strike/);
  assert.match(reduced, /melee-strike/);
});

test('右方拳腳外殼鏡像但中文字保持正向', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.melee-strike\.from-right\s*\{[^}]*--limb-direction:\s*-1/);
  assert.match(css, /\.melee-strike\.from-right \.strike-glyph\s*\{[^}]*scale:\s*-1 1/);
  assert.match(css, /@keyframes fistPop\s*\{[^}]*scale:\s*var\(--limb-direction\)/);
  assert.match(css, /@keyframes bootSwing\s*\{[^}]*scale:\s*var\(--limb-direction\)/);
});

test('reduced-motion 仍保留拳腳辨識標記', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  const reduced = css.slice(css.indexOf('@media(prefers-reduced-motion:reduce)'));
  assert.match(reduced, /melee-impact/);
  assert.match(reduced, /attack-callout/);
});

test('右方近身特效鏡像外框並將中文字轉回正向', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.melee-impact\.from-right\s*\{[^}]*--impact-direction:\s*-1/);
  assert.match(css, /@keyframes impactPulse\s*\{[^}]*scaleX\(var\(--impact-direction\)\)/);
  assert.match(css, /\.melee-impact\.from-right \.melee-symbol\s*\{[^}]*scale:\s*-1 1/);
  assert.doesNotMatch(css, /\.attack-callout\.from-right\s*\{[^}]*scale:\s*-1/);
});
