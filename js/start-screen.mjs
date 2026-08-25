const fallbackEscape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
})[character]);

export function buildStartScreen({ quizCount, muted, scene, fighters, escape = fallbackEscape }) {
  const [leftImage = '', rightImage = ''] = fighters ?? [];
  return `<div class="start-screen">
    <header class="start-topbar">
      <div><small>DDP BATTLE CONTROL</small><h1>DDP 知識對決</h1></div>
      <b>CLASSROOM EDITION</b>
    </header>
    <div class="start-grid">
      <section class="start-control" aria-label="選擇遊戲模式">
        <p>SELECT GAME MODE</p>
        <button class="start-mode start-mode-solo" data-game-mode="solo">玩家 VS 電腦<span>01</span><b>›</b></button>
        <button class="start-mode start-mode-local" data-game-mode="local">本機雙人對戰<span>02</span><b>›</b></button>
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

export function bindStartScreen(root, { onMode, onHelp, onAudio }) {
  root.querySelector('[data-game-mode="solo"]').onclick = () => onMode('solo');
  root.querySelector('[data-game-mode="local"]').onclick = () => onMode('local');
  root.querySelector('#start-help').onclick = onHelp;
  root.querySelector('#start-audio').onclick = onAudio;
}
