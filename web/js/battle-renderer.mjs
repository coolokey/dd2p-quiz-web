import { buildMobileAnswerControls } from './mobile-controls.mjs';
import { buildBattlePauseMenu } from './battle-pause-menu.mjs';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
})[character]);

export function resolveAssetUrl(path, baseUrl) {
  if (!baseUrl) return path;
  return new URL(path, baseUrl).href;
}

function playerMarkup(side, player) {
  const health = Math.max(0, Math.min(100, Number(player.health) || 0));
  return `<section class="fighter fighter-${side}" data-fighter="${side}">
    <div class="fighter-hud">
      <div class="fighter-meta"><strong>${escapeHtml(player.name)}</strong><b>${escapeHtml(player.score)} PTS</b></div>
      <div class="health-track"><span data-health="${side}" style="--health:${health}%"></span></div>
      <small>HP ${health}／100</small>
    </div>
    <div class="fighter-stage">
      <div class="fighter-shadow"></div>
      <img class="fighter-sprite" src="${escapeHtml(player.image)}" alt="${escapeHtml(player.name)}角色">
    </div>
  </section>`;
}

export function buildBattleMarkup(viewModel) {
  const sceneImage = resolveAssetUrl(viewModel.scene.image, viewModel.baseUrl);
  const questionImage = viewModel.questionImage
    ? `<img class="battle-question-image" src="${escapeHtml(viewModel.questionImage)}" alt="題目圖片">`
    : '';
  const suddenDeath = viewModel.phase === 'sudden-death'
    ? '<div class="sudden-death" role="status">驟死決勝</div>'
    : '';
  const mobileControls = buildMobileAnswerControls({
    gameMode: viewModel.gameMode,
    choiceCount: viewModel.choices.length,
    eligiblePlayers: viewModel.eligiblePlayers,
    locked: viewModel.mobileInputLocked || viewModel.orientationPaused || viewModel.manualPaused || viewModel.pausePending,
  });
  const orientationBlocker = viewModel.orientationPaused
    ? `<aside class="orientation-blocker" role="dialog" aria-modal="true">
      <span class="orientation-blocker-icon" aria-hidden="true">↻</span>
      <h2>請將裝置轉成橫向</h2>
      <p>轉為橫向後會繼續目前對戰。</p>
      <button type="button" data-return-main-menu>返回首頁</button>
    </aside>`
    : '';
  const pauseMenu = viewModel.manualPaused
    ? buildBattlePauseMenu({ confirmAction: viewModel.pauseConfirmAction ?? null })
    : '';
  const pauseButton = viewModel.pausePending
    ? '<button type="button" class="battle-pause-button" data-pause-battle aria-label="暫停對戰" disabled>等待本次攻擊結束……</button>'
    : '<button type="button" class="battle-pause-button" data-pause-battle aria-label="暫停對戰">Ⅱ 暫停</button>';

  return `<div class="battle-viewport">
  <div class="battle-stage">
  <div class="battle-shell" style="--scene:url('${escapeHtml(sceneImage)}')">
    <header class="battle-topbar">
      <span class="arena-name">${escapeHtml(viewModel.scene.label)}</span>
      <div class="battle-center-controls">
        <strong class="battle-progress">${escapeHtml(viewModel.progress)}</strong>
        ${pauseButton}
      </div>
      <div class="audio-controls">
        <label title="主音量">主<input type="range" min="0" max="1" step="0.05" value="${escapeHtml(viewModel.audio?.master ?? 0.8)}" data-master-volume></label>
        <label title="背景音樂音量">樂<input type="range" min="0" max="1" step="0.05" value="${escapeHtml(viewModel.audio?.music ?? 0.65)}" data-music-volume></label>
        <label title="音效音量">效<input type="range" min="0" max="1" step="0.05" value="${escapeHtml(viewModel.audio?.effects ?? 0.9)}" data-effects-volume></label>
        <button class="audio-toggle" type="button" data-audio-toggle aria-label="切換聲音">聲音</button>
      </div>
    </header>
    <div class="arena" data-arena>
      <div class="arena-vignette"></div>
      ${suddenDeath}
      ${playerMarkup('left', viewModel.players.left)}
      <div class="versus-mark" aria-hidden="true">VS</div>
      ${playerMarkup('right', viewModel.players.right)}
      <div class="weapon-layer" data-weapon></div>
      <div class="impact-layer" data-impact aria-hidden="true"></div>
    </div>
    <article class="battle-console${questionImage ? ' battle-console--with-image' : ' battle-console--text-only'}">
      ${questionImage}
      <div class="battle-question-copy">
        <h1>${escapeHtml(viewModel.prompt)}</h1>
        <div class="battle-choices">${viewModel.choices.map((choice, index) => {
          const revealed = index === viewModel.revealAnswerIndex;
          return `<div class="battle-choice${revealed ? ' is-correct-reveal' : ''}"${revealed ? ' aria-label="答案揭示"' : ''}><span>${index + 1}</span>${escapeHtml(choice)}</div>`;
        }).join('')}</div>
      </div>
    </article>
    <p class="battle-status" aria-live="polite">${escapeHtml(viewModel.status)}</p>
  </div>
    ${mobileControls}
  </div>
    ${orientationBlocker}
    ${pauseMenu}
  </div>`;
}

export function renderBattle(root, viewModel) {
  root.innerHTML = buildBattleMarkup(viewModel);
  return root;
}

export function buildProjectileMarkup(weapon, player) {
  if (weapon) return `<img class="flying-weapon from-${player}" src="${escapeHtml(weapon)}" alt="">`;
  return `<span class="energy-bolt from-${player}" aria-hidden="true"></span>`;
}

export function attackClassNames(attackType = 'energy') {
  return { actor: `attack-${attackType}`, target: `hit-${attackType}` };
}

export function buildAttackEffectMarkup({ attackType = 'energy', player, opponent, damage, weapon = null, profile = null }) {
  const accent = profile?.color ? ` style="--attack-accent:${escapeHtml(profile.color)}"` : '';
  if (attackType === 'energy') {
    return {
      weapon: buildProjectileMarkup(weapon, player),
      impact: `<span class="impact-burst impact-energy damage-${opponent}"${accent} aria-hidden="true"></span><b class="damage-pop damage-${opponent}">−${escapeHtml(damage)}</b>`,
    };
  }
  const melee = attackType === 'kick'
    ? { glyph: '腳', callout: '飛踢', limbClass: 'strike-boot' }
    : { glyph: '拳', callout: '重拳', limbClass: 'strike-fist' };
  return {
    weapon: `<span class="melee-strike strike-${attackType} from-${player}"${accent} aria-hidden="true"><span class="strike-trail"></span><span class="strike-limb ${melee.limbClass}"><span class="strike-glyph">${profile?.glyph ?? melee.glyph}</span></span></span>`,
    impact: `<span class="melee-impact impact-${attackType} damage-${opponent} from-${player}"${accent} aria-hidden="true"><span class="melee-symbol melee-symbol-${attackType}">${profile?.glyph ?? melee.glyph}</span></span><b class="attack-callout attack-callout-${attackType} damage-${opponent} from-${player}" aria-hidden="true">${escapeHtml(profile?.callout ?? melee.callout)}</b><b class="damage-pop damage-${opponent}">−${escapeHtml(damage)}</b>`,
  };
}

export async function playSpriteFrames(image, frames, duration) {
  if (!image || !Array.isArray(frames) || frames.length === 0) return;
  const original = image.getAttribute?.('src') ?? image.src;
  const setSource = source => image.setAttribute ? image.setAttribute('src', source) : image.src = source;
  const stepMs = Math.max(1, duration / frames.length);
  for (const frame of frames) {
    setSource(frame);
    await new Promise(resolve => setTimeout(resolve, stepMs));
  }
  setSource(original);
}

export async function playBattleAnimation(root, animation, {
  duration = 650,
  weapon = null,
  profile = null,
  attackFrames = [],
  attackType = 'energy',
  impactDelay = 0,
  reactionDuration = 650,
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
} = {}) {
  if (!animation) return;
  const actor = root.querySelector(`[data-fighter="${animation.player}"]`);
  const target = root.querySelector(`[data-fighter="${animation.opponent}"]`);
  const weaponLayer = root.querySelector('[data-weapon]');
  const impact = root.querySelector('[data-impact]');
  const attackClass = animation.type === 'attack' ? 'is-attacking' : 'is-missing';
  actor?.classList.add(attackClass);
  const frameAnimation = playSpriteFrames(actor?.querySelector('.fighter-sprite'), attackFrames, duration);
  const typeClasses = attackClassNames(attackType);
  let impactTimer = null;
  let effectiveImpactDelay = 0;

  if (animation.type === 'attack') {
    actor?.classList.add(typeClasses.actor);
    const effects = buildAttackEffectMarkup({
      attackType,
      player: animation.player,
      opponent: animation.opponent,
      damage: animation.damage,
      weapon,
      profile,
    });
    if (weaponLayer) weaponLayer.innerHTML = effects.weapon;
    const showImpact = () => {
      target?.classList.add('is-hit', typeClasses.target);
      if (impact) impact.innerHTML = effects.impact;
    };
    effectiveImpactDelay = Math.max(0, Math.min(duration, Number(impactDelay) || 0));
    if (effectiveImpactDelay === 0) showImpact();
    else impactTimer = schedule(showImpact, effectiveImpactDelay);
  }

  const totalDuration = animation.type === 'attack'
    ? Math.max(duration, effectiveImpactDelay + Math.max(0, Number(reactionDuration) || 0))
    : duration;
  await new Promise(resolve => schedule(resolve, totalDuration));
  if (impactTimer) cancelSchedule(impactTimer);
  await frameAnimation;
  actor?.classList.remove(attackClass);
  actor?.classList.remove(typeClasses.actor);
  target?.classList.remove('is-hit', typeClasses.target);
  if (weaponLayer) weaponLayer.innerHTML = '';
  if (impact) impact.innerHTML = '';
}
