const DEFAULT_REVEAL_DELAY = 900;

function cpuIsEligible(snapshot, questionKey) {
  return snapshot?.gameMode === 'solo'
    && snapshot.questionKey === questionKey
    && snapshot.phase === 'open'
    && snapshot.eligiblePlayers?.includes('right')
    && !snapshot.ended;
}

function cpuCanAnswer(snapshot, questionKey) {
  return cpuIsEligible(snapshot, questionKey) && !snapshot.paused;
}

export function createBattleLifecycle({
  cpuController,
  getSnapshot,
  resolveAnswer,
  animateAnswer,
  revealAnswer,
  wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  afterAnswer = () => {},
  onSettled = () => {},
  submitCpuAnswer,
  onQuestionAdvanced,
  revealDelay = DEFAULT_REVEAL_DELAY,
}) {
  let generation = 0;
  let sessionEpoch = 0;
  let submissionSequence = 0;
  let scheduledQuestionKey = null;
  let activeSubmission = null;
  let pendingCpuAnswer = null;
  const revealedQuestions = new Set();

  function cancel({ invalidateSubmission = false } = {}) {
    generation += 1;
    scheduledQuestionKey = null;
    pendingCpuAnswer = null;
    if (invalidateSubmission) {
      sessionEpoch += 1;
      activeSubmission = null;
    }
    cpuController.cancel();
  }

  function scheduleCpu({ questionKey, question, difficulty }) {
    const snapshot = getSnapshot();
    if (activeSubmission || pendingCpuAnswer || !cpuCanAnswer(snapshot, questionKey)) return false;
    if (scheduledQuestionKey === questionKey) return false;

    scheduledQuestionKey = questionKey;
    const scheduledGeneration = generation;
    cpuController.schedule({
      question,
      difficulty,
      onAnswer(answerIndex) {
        if (scheduledGeneration !== generation || scheduledQuestionKey !== questionKey) return false;
        if (!cpuCanAnswer(getSnapshot(), questionKey)) return false;
        const input = { player: 'right', answerIndex };
        if (activeSubmission) {
          pendingCpuAnswer ??= { questionKey, input };
          return true;
        }
        return submitCpuAnswer(input);
      },
    });
    return true;
  }

  async function revealCorrectAnswer(outcome) {
    if (revealedQuestions.has(outcome.questionKey)) return false;
    revealedQuestions.add(outcome.questionKey);
    revealAnswer({
      questionKey: outcome.questionKey,
      question: outcome.question,
      answerIndex: outcome.answerIndex,
      progress: outcome.progress,
    });
    await wait(revealDelay);
    return true;
  }

  async function submitPendingCpu() {
    const pending = pendingCpuAnswer;
    if (!pending || !cpuCanAnswer(getSnapshot(), pending.questionKey)) return false;
    const pendingEpoch = sessionEpoch;
    pendingCpuAnswer = null;
    const accepted = await submitCpuAnswer(pending.input);
    if (accepted === false && pendingEpoch === sessionEpoch && cpuIsEligible(getSnapshot(), pending.questionKey)) {
      pendingCpuAnswer ??= pending;
    }
    return accepted !== false;
  }

  function resumeCpu() {
    const snapshot = getSnapshot();
    if (snapshot?.paused || snapshot?.ended) return false;
    cpuController.resume?.();
    return activeSubmission ? false : submitPendingCpu();
  }

  async function submit(input) {
    if (activeSubmission || getSnapshot()?.ended || getSnapshot()?.paused) return false;
    const outcome = resolveAnswer(input);
    if (!outcome) return false;

    const token = { sessionEpoch, submissionId: ++submissionSequence };
    activeSubmission = token;
    const isCurrentSubmission = () => token.sessionEpoch === sessionEpoch && activeSubmission === token;
    try {
      if (outcome.correct || outcome.questionAdvanced) {
        if (outcome.questionAdvanced && onQuestionAdvanced) onQuestionAdvanced();
        else cancel();
      }
      await animateAnswer(outcome, isCurrentSubmission);
      if (!isCurrentSubmission()) return false;

      if (!outcome.correct && outcome.questionAdvanced) {
        await revealCorrectAnswer(outcome);
        if (!isCurrentSubmission()) return false;
      }

      const snapshot = getSnapshot();
      const pending = pendingCpuAnswer;
      if (pending && !cpuIsEligible(snapshot, pending.questionKey)) pendingCpuAnswer = null;
      if (pending && cpuCanAnswer(snapshot, pending.questionKey)) {
        activeSubmission = null;
        if (await submitPendingCpu()) return true;
        if (token.sessionEpoch !== sessionEpoch || activeSubmission) return false;
        activeSubmission = token;
      }

      const settlement = await afterAnswer(outcome);
      if (!isCurrentSubmission()) return false;

      activeSubmission = null;
      await onSettled(outcome, settlement);
      if (token.sessionEpoch !== sessionEpoch) return false;
      return true;
    } finally {
      if (isCurrentSubmission()) {
        activeSubmission = null;
        pendingCpuAnswer = null;
      }
    }
  }

  function reset() {
    sessionEpoch += 1;
    cancel();
    activeSubmission = null;
    revealedQuestions.clear();
  }

  return {
    cancel,
    isAnimating: () => activeSubmission !== null,
    reset,
    resumeCpu,
    scheduleCpu,
    submit,
  };
}
