const DEFAULT_REVEAL_DELAY = 900;

function cpuCanAnswer(snapshot, questionKey) {
  return snapshot?.gameMode === 'solo'
    && snapshot.questionKey === questionKey
    && snapshot.phase === 'open'
    && snapshot.eligiblePlayers?.includes('right')
    && !snapshot.ended;
}

export function createBattleLifecycle({
  cpuController,
  getSnapshot,
  resolveAnswer,
  animateAnswer,
  revealAnswer,
  wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  afterAnswer = () => {},
  submitCpuAnswer,
  revealDelay = DEFAULT_REVEAL_DELAY,
}) {
  let generation = 0;
  let scheduledQuestionKey = null;
  let animating = false;
  let pendingCpuAnswer = null;
  const revealedQuestions = new Set();

  function cancel() {
    generation += 1;
    scheduledQuestionKey = null;
    pendingCpuAnswer = null;
    cpuController.cancel();
  }

  function scheduleCpu({ questionKey, question, difficulty }) {
    const snapshot = getSnapshot();
    if (animating || !cpuCanAnswer(snapshot, questionKey)) return false;
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
        if (animating) {
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

  async function submit(input) {
    if (animating || getSnapshot()?.ended) return false;
    const outcome = resolveAnswer(input);
    if (!outcome) return false;

    animating = true;
    if (outcome.correct || outcome.questionAdvanced) cancel();
    await animateAnswer(outcome);
    if (!outcome.correct && outcome.questionAdvanced) await revealCorrectAnswer(outcome);
    animating = false;

    const snapshot = getSnapshot();
    const pending = pendingCpuAnswer;
    pendingCpuAnswer = null;
    if (pending && cpuCanAnswer(snapshot, pending.questionKey)) {
      await submitCpuAnswer(pending.input);
      return true;
    }

    await afterAnswer(outcome);
    return true;
  }

  function reset() {
    cancel();
    animating = false;
    revealedQuestions.clear();
  }

  return {
    cancel,
    isAnimating: () => animating,
    reset,
    scheduleCpu,
    submit,
  };
}
