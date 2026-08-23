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
      <button class="audio-toggle" type="button" data-audio-toggle aria-label="切換聲音">聲音</button>
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

export async function playBattleAnimation(root, animation, { duration = 650, weapon = null } = {}) {
  if (!animation) return;
  const actor = root.querySelector(`[data-fighter="${animation.player}"]`);
  const target = root.querySelector(`[data-fighter="${animation.opponent}"]`);
  const weaponLayer = root.querySelector('[data-weapon]');
  const impact = root.querySelector('[data-impact]');
  const attackClass = animation.type === 'attack' ? 'is-attacking' : 'is-missing';
  actor?.classList.add(attackClass);

  if (animation.type === 'attack') {
    target?.classList.add('is-hit');
    if (weapon && weaponLayer) weaponLayer.innerHTML = `<img class="flying-weapon from-${animation.player}" src="${escapeHtml(weapon)}" alt="">`;
    if (impact) impact.innerHTML = `<b class="damage-pop damage-${animation.opponent}">−${escapeHtml(animation.damage)}</b>`;
  }

  await new Promise(resolve => setTimeout(resolve, duration));
  actor?.classList.remove(attackClass);
  target?.classList.remove('is-hit');
  if (weaponLayer) weaponLayer.innerHTML = '';
  if (impact) impact.innerHTML = '';
}
