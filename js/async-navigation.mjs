export function createLatestSessionGate() {
  let generation = 0;
  let activeSession = null;

  function invalidate() {
    generation += 1;
    const previous = activeSession;
    activeSession = null;
    previous?.cancel();
  }

  function begin({ onCancel = () => {} } = {}) {
    invalidate();
    const sessionGeneration = generation;
    let active = true;
    const session = {
      cancel() {
        if (!active) return false;
        active = false;
        onCancel();
        return true;
      },
      commit(callback) {
        if (!session.isCurrent()) return false;
        callback();
        return true;
      },
      finish() {
        if (!session.isCurrent()) return false;
        active = false;
        if (activeSession === session) activeSession = null;
        return true;
      },
      isCurrent() {
        return active && generation === sessionGeneration && activeSession === session;
      },
    };
    activeSession = session;
    return session;
  }

  return { begin, invalidate };
}

export function createBattleInputGate() {
  let enabled = false;
  return {
    disable() {
      enabled = false;
    },
    enable() {
      enabled = true;
    },
    isEnabled() {
      return enabled;
    },
    run(action) {
      if (!enabled) return false;
      return action();
    },
  };
}

export function markQuizRequestLoading(root, id) {
  const retry = root.querySelector('#retry-quiz');
  if (retry) {
    retry.disabled = true;
    retry.setAttribute('aria-busy', 'true');
    retry.textContent = '載入中……';
  }

  const button = [...(root.querySelectorAll?.('[data-quiz]') ?? [])]
    .find(item => item.dataset.quiz === id);
  if (!button) return;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  const status = button.querySelector('span');
  if (status) status.textContent = '載入中……';
}

export async function runLatestRequest({
  gate,
  load,
  onLoading = () => {},
  onSuccess,
  onError,
}) {
  const session = gate.begin();
  try {
    onLoading();
    const value = await load();
    if (!session.commit(() => onSuccess?.(value))) return false;
    session.finish();
    return true;
  } catch (error) {
    if (!session.isCurrent()) return false;
    session.finish();
    if (onError) {
      onError(error);
      return false;
    }
    throw error;
  }
}

export async function runStartSession({
  gate,
  onCancel = () => {},
  onLoading = () => {},
  disableInput = () => {},
  enableInput = () => {},
  prepare = () => {},
  stages = [],
  startTimer = () => {},
  renderBattle,
  onError,
}) {
  const session = gate.begin({
    onCancel() {
      disableInput();
      onCancel();
    },
  });
  try {
    disableInput();
    onLoading();
    prepare();
    if (!session.isCurrent()) return false;
    for (const stage of stages) {
      await stage();
      if (!session.isCurrent()) return false;
    }
    if (!session.commit(() => {
      enableInput();
      startTimer();
      renderBattle?.();
    })) return false;
    session.finish();
    return true;
  } catch (error) {
    if (!session.isCurrent()) return false;
    gate.invalidate();
    if (onError) {
      onError(error);
      return false;
    }
    throw error;
  }
}
