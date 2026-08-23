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

  return `<div class="battle-shell" style="--scene:url('${escapeHtml(sceneImage)}')">
    <header class="battle-topbar">
      <span class="arena-name">${escapeHtml(viewModel.scene.label)}</span>
      <strong class="battle-progress">${escapeHtml(viewModel.progress)}</strong>
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
    <article class="battle-console">
      ${questionImage}
      <div class="battle-question-copy">
        <h1>${escapeHtml(viewModel.prompt)}</h1>
        <div class="battle-choices">${viewModel.choices.map((choice, index) => `<div class="battle-choice"><span>${index + 1}</span>${escapeHtml(choice)}</div>`).join('')}</div>
      </div>
    </article>
    <p class="battle-status" aria-live="polite">${escapeHtml(viewModel.status)}</p>
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

export function buildAttackEffectMarkup({ attackType = 'energy', player, opponent, damage, weapon = null }) {
  if (attackType === 'energy') {
    return {
      weapon: buildProjectileMarkup(weapon, player),
      impact: `<span class="impact-burst impact-energy damage-${opponent}" aria-hidden="true"></span><b class="damage-pop damage-${opponent}">−${escapeHtml(damage)}</b>`,
    };
  }
  return {
    weapon: '',
    impact: `<span class="melee-impact impact-${attackType} damage-${opponent}" aria-hidden="true"></span><b class="damage-pop damage-${opponent}">−${escapeHtml(damage)}</b>`,
  };
}

export async function playSpriteFrames(image, frames, duration) {
  if (!image || !Array.isArray(frames) || frames.length === 0) return;
  const original = image.getAttribute?.('src') ?? image.src;
  const setSource = source => image.setAttribute ? image.setAttribute('src', source) : image.src = source;
  const stepMs = Math.max(1, duration / (frames.length + 1));
  let frameIndex = 0;
  setSource(frames[frameIndex++]);

  await new Promise(resolve => {
    const interval = setInterval(() => {
      if (frameIndex < frames.length) setSource(frames[frameIndex++]);
    }, stepMs);
    setTimeout(() => {
      clearInterval(interval);
      setSource(original);
      resolve();
    }, duration);
  });
}

export async function playBattleAnimation(root, animation, {
  duration = 650,
  weapon = null,
  attackFrames = [],
  attackType = 'energy',
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

  if (animation.type === 'attack') {
    actor?.classList.add(typeClasses.actor);
    target?.classList.add('is-hit', typeClasses.target);
    const effects = buildAttackEffectMarkup({
      attackType,
      player: animation.player,
      opponent: animation.opponent,
      damage: animation.damage,
      weapon,
    });
    if (weaponLayer) weaponLayer.innerHTML = effects.weapon;
    if (impact) impact.innerHTML = effects.impact;
  }

  await new Promise(resolve => setTimeout(resolve, duration));
  await frameAnimation;
  actor?.classList.remove(attackClass);
  actor?.classList.remove(typeClasses.actor);
  target?.classList.remove('is-hit', typeClasses.target);
  if (weaponLayer) weaponLayer.innerHTML = '';
  if (impact) impact.innerHTML = '';
}
