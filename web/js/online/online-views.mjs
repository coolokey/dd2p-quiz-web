const fallbackEscape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
})[character]);

export function buildOnlineHubView({
  apiUrl = '',
  healthState = 'idle', // 'idle' | 'checking' | 'connected' | 'error'
  healthMessage = '',
  playerName = '',
  inviteRoomCode = '',
  savedSession = null,
  statusMessage = '',
  errorMessage = '',
  busy = false,
  escape = fallbackEscape,
} = {}) {
  const configured = Boolean(apiUrl);
  const badgeClass = healthState === 'connected'
    ? 'is-ok'
    : healthState === 'error'
      ? 'is-error'
      : 'is-pending';
  const badgeText = !configured
    ? '尚未設定伺服器'
    : healthState === 'connected'
      ? '伺服器連線正常'
      : healthState === 'checking'
        ? '正在測試連線……'
        : healthState === 'error'
          ? '連線異常'
          : '已設定伺服器';
  const resumeCard = savedSession && configured
    ? `<div class="online-resume-banner">
        <div><strong>偵測到未結束的房間：${escape(savedSession.roomCode)}</strong><span>點擊即可嘗試回到原席位繼續對戰。</span></div>
        <button type="button" class="primary" id="online-resume-btn"${busy ? ' disabled' : ''}>回到原房間</button>
      </div>`
    : '';
  const disabledAttr = !configured || busy ? ' disabled' : '';

  return `<div class="online-hub">
    <div class="online-header-row">
      <div>
        <h2 class="selection-title">網路雙人對戰</h2>
        <p class="lead">兩位玩家各自使用電腦、平板或手機即時連線搶答對決（Cloudflare × Supabase）。</p>
      </div>
      <span class="online-health-pill ${badgeClass}" role="status">${escape(badgeText)}</span>
    </div>

    ${resumeCard}
    ${statusMessage ? `<p class="online-notice" role="status">${escape(statusMessage)}</p>` : ''}
    ${errorMessage ? `<p class="error" role="alert">${escape(errorMessage)}</p>` : ''}

    <section class="online-card online-profile-card">
      <label class="online-field">
        <span>你的顯示暱稱（僅本局暫存，不儲存個資）</span>
        <input id="online-player-name" type="text" maxlength="20" placeholder="例如：溪羽挑戰者" value="${escape(playerName)}">
      </label>
    </section>

    <div class="online-hub-grid">
      <section class="online-card">
        <h3>建立對戰房間</h3>
        <p class="hint">由你選擇題庫、固定題數／限時規則與校園戰場，取得 6 碼房號與邀請連結。</p>
        <button type="button" class="primary" id="online-create-flow"${disabledAttr}>選擇題庫建立擂台</button>
      </section>

      <section class="online-card">
        <h3>加入對戰房間</h3>
        <p class="hint">輸入房主提供的 6 位英數房間碼，加入藍隊席位。</p>
        <div class="online-join-row">
          <input id="online-room-code" type="text" maxlength="6" autocomplete="off" spellcheck="false" placeholder="例如 K7M9P2" value="${escape(inviteRoomCode)}">
          <button type="button" class="primary" id="online-join-btn"${disabledAttr}>加入房間</button>
        </div>
      </section>
    </div>

    <details class="online-server-config"${!configured || healthState === 'error' ? ' open' : ''}>
      <summary>伺服器設定（Cloudflare Worker 網址）</summary>
      <p class="hint">請填入部署完成的 DDP 網路對戰 Cloudflare Worker 網址（例如 <code>https://ddp-online-battle-worker.&lt;子網域&gt;.workers.dev</code>）。</p>
      <div class="online-server-row">
        <input id="online-api-url" type="url" placeholder="https://ddp-online-battle-worker.your-subdomain.workers.dev" value="${escape(apiUrl)}">
        <button type="button" class="secondary" id="online-save-api"${busy ? ' disabled' : ''}>儲存並測試</button>
      </div>
      ${healthMessage ? `<p class="hint">${escape(healthMessage)}</p>` : ''}
    </details>

    <div class="actions">
      <button type="button" class="secondary" id="online-back-home">返回主選單</button>
    </div>
  </div>`;
}

export function buildOnlineWaitingRoomView({
  room,
  seat,
  characters = [],
  arenaLabel = '',
  inviteUrl = '',
  connectionStatus = 'connected',
  copyFeedback = '',
  errorMessage = '',
  busy = false,
  characterImage = () => '',
  escape = fallbackEscape,
} = {}) {
  const left = room.players?.left;
  const right = room.players?.right;
  const me = seat === 'left' ? left : right;
  const opponent = seat === 'left' ? right : left;
  const ruleText = room.ruleMode === 'time' ? `限時 ${room.ruleLimit} 秒` : `固定 ${room.ruleLimit} 題`;
  const connText = connectionStatus === 'reconnecting'
    ? '重新連線中……'
    : connectionStatus === 'disconnected'
      ? '連線逾時'
      : '即時同步中';

  const playerSlot = (side, label, player) => {
    const selectedChar = characters.find(item => String(item.id) === String(player?.characterId));
    const isMe = seat === side;
    if (!player) {
      return `<section class="select-side ${side} online-seat-empty">
        <h3>${escape(label)}</h3>
        <div class="selected-fighter"><b>等待對手加入……</b></div>
        <p class="hint">請將房號 <strong>${escape(room.roomCode)}</strong> 或邀請連結傳給對手。</p>
      </section>`;
    }
    const readyBadge = player.ready
      ? '<span class="online-ready-tag is-ready">已準備完成</span>'
      : '<span class="online-ready-tag">準備中</span>';
    const preview = selectedChar
      ? `<div class="selected-fighter"><img src="${escape(characterImage(selectedChar))}" alt="${escape(selectedChar.label || selectedChar.name)}"></div>`
      : '<div class="selected-fighter"><b>尚未選角</b></div>';
    return `<section class="select-side ${side}${isMe ? ' is-local-seat' : ''}">
      <div class="online-seat-head">
        <h3>${escape(label)}：${escape(player.name)}${isMe ? '（你）' : ''}</h3>
        ${readyBadge}
      </div>
      ${preview}
      <p class="hint">${selectedChar ? escape(selectedChar.label || selectedChar.name) : '請從下方挑選一位校園英雄'}</p>
    </section>`;
  };

  const charCards = characters.map(character => {
    const id = String(character.id);
    const mine = String(me?.characterId ?? '') === id;
    const takenByOpponent = String(opponent?.characterId ?? '') === id;
    const disabled = character.playable === false || takenByOpponent || busy;
    return `<button type="button" class="character-card ${mine ? 'is-selected' : ''}${takenByOpponent ? ' is-opponent-picked' : ''}" data-online-character="${escape(id)}"${disabled ? ' disabled' : ''}>
      <img src="${escape(character.thumbnail || characterImage(character))}" alt="" loading="lazy" decoding="async">
      <b>${escape(character.label || character.name || `角色 ${id}`)}</b>
    </button>`;
  }).join('');

  const canToggleReady = Boolean(me?.characterId) && !busy;
  const readyLabel = me?.ready ? '取消準備' : '準備完成！';
  const waitHint = !right
    ? '等待藍隊玩家輸入房號加入；你可先挑選角色。'
    : !me?.characterId
      ? '請先挑選你的角色，再按下「準備完成！」。'
      : me.ready && !opponent?.ready
        ? '你已準備完成，等待對手按下準備後立即開戰！'
        : '雙方皆按下「準備完成！」後會立刻同步開局。';

  return `<div class="online-waiting">
    <div class="online-room-banner">
      <div>
        <small>ROOM CODE</small>
        <strong class="online-room-code" data-room-code="${escape(room.roomCode)}">${escape(room.roomCode)}</strong>
      </div>
      <div class="online-room-meta">
        <span>題庫：<b>${escape(room.quizName)}</b></span>
        <span>規則：<b>${escape(ruleText)}</b></span>
        <span>戰場：<b>${escape(arenaLabel || room.arenaId)}</b></span>
        <span class="online-conn-tag">${escape(connText)}</span>
      </div>
      <div class="online-copy-actions">
        <button type="button" class="secondary" id="online-copy-code">複製房號</button>
        ${inviteUrl ? '<button type="button" class="secondary" id="online-copy-link">複製邀請連結</button>' : ''}
      </div>
    </div>

    ${copyFeedback ? `<p class="online-notice" role="status">${escape(copyFeedback)}</p>` : ''}
    ${errorMessage ? `<p class="error" role="alert">${escape(errorMessage)}</p>` : ''}

    <div class="versus-select">
      ${playerSlot('left', '紅隊房主', left)}
      <div class="select-vs">VS</div>
      ${playerSlot('right', '藍隊挑戰者', right)}
    </div>

    <section class="online-char-picker">
      <h3>選擇你的出戰角色（與對手不可重複）</h3>
      <div class="character-grid">${charCards}</div>
    </section>

    <p class="hint" role="status">${escape(waitHint)}</p>
    <div class="actions">
      <button type="button" class="secondary" id="online-leave-room"${busy ? ' disabled' : ''}>離開房間</button>
      <button type="button" class="primary" id="online-toggle-ready"${canToggleReady ? '' : ' disabled'}>${escape(readyLabel)}</button>
    </div>
  </div>`;
}

export function buildOnlineResultView({
  room,
  seat,
  busy = false,
  escape = fallbackEscape,
} = {}) {
  const leftName = room.players?.left?.name || '紅隊';
  const rightName = room.players?.right?.name || '藍隊';
  const winnerName = room.winner === 'left'
    ? `紅隊（${leftName}）`
    : room.winner === 'right'
      ? `藍隊（${rightName}）`
      : '平手';
  const reasonMap = {
    ko: 'KO！',
    'sudden-death': '驟死決勝！',
    score: '分數勝利！',
    forfeit: '對手已離開房間，直接獲勝！',
    'host-closed': '房主已關閉房間。',
  };
  const reason = reasonMap[room.endReason] ?? '本局結束';
  const canRematch = !['forfeit', 'host-closed'].includes(room.endReason) && Boolean(room.players?.right);
  const myRematch = Boolean(room.rematch?.[seat]);
  const opponentSeat = seat === 'left' ? 'right' : 'left';
  const opponentRematch = Boolean(room.rematch?.[opponentSeat]);
  const rematchLabel = myRematch
    ? '已發出再戰請求，等待對手……'
    : opponentRematch
      ? '對手邀請再戰！立即開局'
      : '再戰一局';

  return `<article class="result online-result">
    <p class="lead">網路對戰結算　${escape(reason)}</p>
    <div class="winner">${room.winner ? `${escape(winnerName)}獲勝！` : escape(winnerName)}</div>
    <p class="prompt">${escape(leftName)} ${escape(room.scores?.left ?? 0)} 分　：　${escape(rightName)} ${escape(room.scores?.right ?? 0)} 分</p>
    <div class="actions">
      <button type="button" class="secondary" id="online-result-hub">返回網路大廳</button>
      <button type="button" class="secondary" id="online-result-home">返回主選單</button>
      ${canRematch ? `<button type="button" class="primary" id="online-rematch-btn"${myRematch || busy ? ' disabled' : ''}>${escape(rematchLabel)}</button>` : ''}
    </div>
  </article>`;
}
