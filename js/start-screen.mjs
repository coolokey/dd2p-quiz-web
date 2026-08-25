const fallbackEscape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
})[character]);

export function buildStartScreen({
  quizCount,
  muted,
  scene,
  fighters,
  modesEnabled = true,
  loadMessage = '',
  escape = fallbackEscape,
}) {
  const [leftImage = '', rightImage = ''] = fighters ?? [];
  const disabled = modesEnabled ? '' : ' disabled aria-disabled="true"';
  const loadNotice = loadMessage
    ? `<div class="start-load-error" role="status">${escape(loadMessage)}<button id="retry-start-load">重新載入資料</button></div>`
    : '';
  return `<div class="start-screen">
    <header class="start-topbar">
      <div><small>DDP BATTLE CONTROL</small><h1>DDP 知識對決</h1></div>
      <b>CLASSROOM EDITION</b>
    </header>
    <div class="start-grid">
      <section class="start-control" aria-label="選擇遊戲模式">
        <p>SELECT GAME MODE</p>
        <button class="start-mode start-mode-solo" data-game-mode="solo"${disabled}>玩家 VS 電腦<span>01</span><b>›</b></button>
        <button class="start-mode start-mode-local" data-game-mode="local"${disabled}>本機雙人對戰<span>02</span><b>›</b></button>
        ${loadNotice}
        <div class="start-minor-actions">
          <button id="start-help">操作說明</button><button id="start-audio">音效設定</button>
        </div>
        <div class="start-stats"><span>${escape(quizCount)} QUIZ PACKS</span><span>${muted ? 'SOUND OFF' : 'SOUND ON'}</span></div>
      </section>
      <section class="start-arena" style="--start-scene:url('${escape(scene)}')">
        <img class="start-fighter start-fighter-left" src="${escape(leftImage)}" alt="紅方角色">
        <div class="start-versus">VS</div>
        <img class="start-fighter start-fighter-right" src="${escape(rightImage)}" alt="藍方角色">
        <p><b>READY</b>選擇模式，進入知識擂台</p>
      </section>
    </div>
  </div>`;
}

export function bindStartScreen(root, {
  onMode,
  onHelp,
  onAudio,
  onRetry = () => {},
  onNavigate = () => {},
}) {
  const solo = root.querySelector('[data-game-mode="solo"]');
  const local = root.querySelector('[data-game-mode="local"]');
  solo.onclick = () => onMode('solo');
  local.onclick = () => onMode('local');
  root.querySelector('#start-help').onclick = onHelp;
  root.querySelector('#start-audio').onclick = onAudio;
  const retry = root.querySelector('#retry-start-load');
  if (retry) retry.onclick = onRetry;

  let lastNavigationSound = 0;
  for (const button of root.querySelectorAll?.('button') ?? []) {
    const playNavigationSound = () => {
      const now = Date.now();
      if (button.disabled || now - lastNavigationSound < 100) return;
      lastNavigationSound = now;
      onNavigate();
    };
    button.addEventListener('focus', playNavigationSound);
    button.addEventListener('mouseenter', playNavigationSound);
  }
}
