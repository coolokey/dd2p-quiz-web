export const ONLINE_POLL_INTERVALS = Object.freeze({
  waiting: 1000,
  playing: 350,
  ended: 1200,
});

export const DISCONNECT_GRACE_MS = 45_000;

export function createOnlineController({
  transport,
  onRoomUpdate = () => {},
  onBattleEvent = () => {},
  onConnectionChange = () => {},
  onRoomLost = () => {},
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  nowFn = Date.now,
} = {}) {
  let session = null;
  let room = null;
  let polling = false;
  let pollTimer = null;
  let pollInFlight = false;
  let lastProcessedEventSeq = 0;
  let lastSuccessAt = 0;
  let connectionStatus = 'idle'; // 'idle' | 'connected' | 'reconnecting' | 'disconnected'
  let serverTimeOffsetMs = 0;
  let generation = 0;

  function clearPollTimer() {
    if (pollTimer !== null) {
      clearTimeoutFn(pollTimer);
      pollTimer = null;
    }
  }

  function updateServerTimeOffset(serverTime) {
    const parsed = Date.parse(serverTime);
    if (Number.isFinite(parsed)) {
      serverTimeOffsetMs = parsed - nowFn();
    }
  }

  function setConnectionStatus(next) {
    if (connectionStatus === next) return;
    connectionStatus = next;
    onConnectionChange(next);
  }

  function applyRoomSnapshot(nextRoom, { emitEvent = true } = {}) {
    if (!nextRoom) return;
    const previousRoom = room;
    room = nextRoom;
    updateServerTimeOffset(nextRoom.serverTime);
    lastSuccessAt = nowFn();
    setConnectionStatus('connected');

    const incomingEvent = nextRoom.lastEvent;
    const isNewEvent = Boolean(
      emitEvent
      && incomingEvent
      && Number.isInteger(incomingEvent.seq)
      && incomingEvent.seq > lastProcessedEventSeq
    );

    if (isNewEvent) {
      lastProcessedEventSeq = incomingEvent.seq;
    } else if (!emitEvent && Number.isInteger(nextRoom.eventSeq)) {
      lastProcessedEventSeq = nextRoom.eventSeq;
    }

    const meta = {
      previousRoom,
      seat: session?.seat ?? null,
      hasNewEvent: isNewEvent,
      newEvent: isNewEvent ? incomingEvent : null,
    };
    onRoomUpdate(room, meta);
    if (isNewEvent) {
      onBattleEvent(incomingEvent, room, meta);
    }
  }

  function nextPollDelay() {
    if (!room) return ONLINE_POLL_INTERVALS.waiting;
    return ONLINE_POLL_INTERVALS[room.status] ?? ONLINE_POLL_INTERVALS.waiting;
  }

  function scheduleNextPoll(currentGeneration) {
    clearPollTimer();
    if (!polling || currentGeneration !== generation) return;
    pollTimer = setTimeoutFn(() => {
      pollTimer = null;
      void pollOnce(currentGeneration);
    }, nextPollDelay());
  }

  async function pollOnce(currentGeneration = generation) {
    if (!polling || !session || pollInFlight || currentGeneration !== generation) return;
    pollInFlight = true;
    try {
      const result = await transport.getState(session, room?.version ?? 0);
      if (!polling || currentGeneration !== generation) return;

      if (result.ok) {
        updateServerTimeOffset(result.serverTime);
        lastSuccessAt = nowFn();
        setConnectionStatus('connected');
        if (result.changed && result.room) {
          applyRoomSnapshot(result.room, { emitEvent: true });
        }
      } else if (result.code === 'ROOM_NOT_FOUND' || result.code === 'UNAUTHORIZED') {
        stop();
        onRoomLost(result);
        return;
      } else {
        const elapsed = nowFn() - lastSuccessAt;
        setConnectionStatus(elapsed >= DISCONNECT_GRACE_MS ? 'disconnected' : 'reconnecting');
      }
    } finally {
      pollInFlight = false;
      if (polling && currentGeneration === generation) {
        scheduleNextPoll(currentGeneration);
      }
    }
  }

  function start(nextSession, initialRoom, { emitInitialEvent = false } = {}) {
    generation += 1;
    clearPollTimer();
    session = nextSession;
    room = null;
    lastProcessedEventSeq = 0;
    lastSuccessAt = nowFn();
    polling = true;
    applyRoomSnapshot(initialRoom, { emitEvent: emitInitialEvent });
    scheduleNextPoll(generation);
  }

  function stop() {
    generation += 1;
    polling = false;
    clearPollTimer();
    pollInFlight = false;
    setConnectionStatus('idle');
  }

  function reset() {
    stop();
    session = null;
    room = null;
    lastProcessedEventSeq = 0;
    serverTimeOffsetMs = 0;
  }

  function getRemainingSeconds() {
    if (!room || room.ruleMode !== 'time' || !room.startedAt) return null;
    const startedMs = Date.parse(room.startedAt);
    if (!Number.isFinite(startedMs)) return room.ruleLimit;
    const serverNow = nowFn() + serverTimeOffsetMs;
    const elapsedSeconds = Math.floor((serverNow - startedMs) / 1000);
    return Math.max(0, room.ruleLimit - Math.max(0, elapsedSeconds));
  }

  async function runAction(actionFn, { emitEvent = true } = {}) {
    if (!session) return { ok: false, code: 'NO_SESSION' };
    const activeGeneration = generation;
    const result = await actionFn(session);
    if (activeGeneration !== generation) return { ok: false, code: 'STALE_SESSION' };
    if (result.room) applyRoomSnapshot(result.room, { emitEvent });
    return result;
  }

  return {
    start,
    stop,
    reset,
    pollOnce,
    getSession: () => session,
    getRoom: () => room,
    getConnectionStatus: () => connectionStatus,
    getRemainingSeconds,
    selectCharacter: characterId => runAction(s => transport.selectCharacter(s, characterId), { emitEvent: false }),
    setReady: ready => runAction(s => transport.setReady(s, ready), { emitEvent: false }),
    submitAnswer: payload => runAction(s => transport.submitAnswer(s, payload), { emitEvent: true }),
    finishTime: () => runAction(s => transport.finishTime(s), { emitEvent: true }),
    requestRematch: () => runAction(s => transport.requestRematch(s), { emitEvent: true }),
    leaveRoom: async () => {
      const current = session;
      reset();
      if (!current) return { ok: true };
      return transport.leaveRoom(current);
    },
  };
}
