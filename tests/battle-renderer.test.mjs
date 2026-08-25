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

test('本機四選題建立兩側觸控答題板與八個按鈕', () => {
  const html = buildBattleMarkup({
    ...viewModel,
    gameMode: 'local',
    eligiblePlayers: ['left', 'right'],
    mobileInputLocked: false,
  });
  assert.match(html, /mobile-answer-controls mode-local/);
  assert.match(html, /mobile-answer-pad-left/);
  assert.match(html, /mobile-answer-pad-right/);
  assert.equal((html.match(/data-touch-answer=/g) ?? []).length, 8);
  assert.ok(html.indexOf('battle-console') < html.indexOf('mobile-answer-controls'));
  assert.ok(html.indexOf('mobile-answer-controls') < html.indexOf('battle-status'));
});

test('只有右方可作答時，左方觸控按鈕停用而右方保持可用', () => {
  const html = buildBattleMarkup({
    ...viewModel,
    gameMode: 'local',
    eligiblePlayers: ['right'],
    mobileInputLocked: false,
  });
  const leftPad = html.match(/mobile-answer-pad-left[\s\S]*?<\/div>/)?.[0] ?? '';
  const rightPad = html.match(/mobile-answer-pad-right[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.equal((leftPad.match(/ disabled/g) ?? []).length, 4);
  assert.equal((rightPad.match(/ disabled/g) ?? []).length, 0);
});

test('單人模式只建立左方觸控答題板', () => {
  const html = buildBattleMarkup({
    ...viewModel,
    gameMode: 'solo',
    eligiblePlayers: ['left'],
    mobileInputLocked: false,
  });
  assert.match(html, /mobile-answer-controls mode-solo/);
  assert.match(html, /mobile-answer-pad-left/);
  assert.doesNotMatch(html, /mobile-answer-pad-right/);
});

test('行動輸入鎖定時會停用所有觸控作答按鈕', () => {
  const html = buildBattleMarkup({
    ...viewModel,
    gameMode: 'local',
    eligiblePlayers: ['left', 'right'],
    mobileInputLocked: true,
  });
  assert.equal((html.match(/data-touch-answer=[^>]* disabled/g) ?? []).length, 8);
});

test('直向暫停時顯示無障礙旋轉提示並停用全部觸控按鈕', () => {
  const html = buildBattleMarkup({
    ...viewModel,
    gameMode: 'local',
    eligiblePlayers: ['left', 'right'],
    mobileInputLocked: false,
    orientationPaused: true,
  });
  assert.match(html, /class="orientation-blocker"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /請將裝置轉成橫向/);
  assert.match(html, /轉為橫向後會繼續目前對戰。/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /type="button" data-return-main-menu[^>]*>返回主選單/);
  assert.equal((html.match(/data-touch-answer=[^>]* disabled/g) ?? []).length, 8);
});

test('未直向暫停的戰鬥畫面不含旋轉提示遮罩', () => {
  const html = buildBattleMarkup({ ...viewModel, orientationPaused: false });
  assert.doesNotMatch(html, /orientation-blocker/);
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

test('行動橫向觸控介面提供安全區、觸控尺寸、直向遮罩與小高度規則', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.mobile-answer-controls\s*\{[^}]*display:\s*none/);
  assert.match(css, /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)\s*and\s*\(orientation:\s*landscape\)/);
  assert.match(css, /\.mobile-answer-controls\s*\{[^}]*display:\s*(?:flex|grid)/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-right\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /env\(safe-area-inset-left\)/);
  assert.match(css, /\.mobile-answer\s*\{[^}]*min-(?:width|height):\s*48px/);
  assert.match(css, /\.mobile-answer\s*\{[^}]*touch-action:\s*none/);
  assert.match(css, /\.mobile-answer\s*\{[^}]*user-select:\s*none/);
  assert.match(css, /\.mode-solo/);
  assert.match(css, /\.mode-local/);
  assert.match(css, /\.mobile-answer-pad-left/);
  assert.match(css, /\.mobile-answer-pad-right/);
  assert.match(css, /\.mobile-answer:disabled/);
  assert.match(css, /\.orientation-blocker/);
  assert.match(css, /@media\s*\(orientation:\s*portrait\)/);
  assert.match(css, /@media\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*500px\)/);
});

test('觸控橫向版為雙人側鍵與單人底鍵保留核心戰區空間', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  assert.match(css, /body:has\(\.mode-local\) \.battle-shell\s*\{[^}]*padding-left:\s*max\(64px,\s*calc\(env\(safe-area-inset-left\) \+ 64px\)\)/);
  assert.match(css, /body:has\(\.mode-local\) \.battle-shell\s*\{[^}]*padding-right:\s*max\(64px,\s*calc\(env\(safe-area-inset-right\) \+ 64px\)\)/);
  assert.match(css, /body:has\(\.mode-solo\) \.battle-shell\s*\{[^}]*padding-bottom:\s*calc\(env\(safe-area-inset-bottom\) \+ 64px\)/);
});

test('矮橫式觸控版維持雙欄答案並額外壓縮戰區高度', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(hover: none\) and \(pointer: coarse\) and \(orientation: landscape\) and \(max-height: 500px\)/);
  assert.match(css, /\.battle-choices\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0,1fr\)\)/);
  assert.match(css, /\.arena\s*\{[^}]*height:\s*clamp\(104px,32vh,180px\)/);
  assert.match(css, /\.battle-question-image\s*\{[^}]*max-height:\s*58px/);
  assert.match(css, /\.battle-status\s*\{[^}]*font-size:\s*12px/);
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
