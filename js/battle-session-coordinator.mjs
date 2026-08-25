export function createBattleSessionCoordinator({
  lifecycle,
  clearTimer,
  closeRegulation,
  stopAudio,
}) {
  let regulationEndPending = false;

  function reset() {
    regulationEndPending = false;
  }

  function questionAdvanced() {
    lifecycle.cancel();
  }

  function regulationEnded(options = {}) {
    regulationEndPending = false;
    lifecycle.cancel();
    closeRegulation(options);
  }

  function timerExpired() {
    clearTimer();
    lifecycle.cancel();
    if (lifecycle.isAnimating()) {
      regulationEndPending = true;
      return false;
    }
    regulationEndPending = false;
    closeRegulation({ advanceQuestion: true });
    return true;
  }

  function finishAnswer({ questionIndex, activeQuestionIndex }) {
    if (!regulationEndPending) return false;
    regulationEndPending = false;
    closeRegulation({ advanceQuestion: questionIndex === activeQuestionIndex });
    return true;
  }

  function resultShown() {
    regulationEndPending = false;
    lifecycle.cancel({ invalidateSubmission: true });
    clearTimer();
  }

  function catalogOpened() {
    regulationEndPending = false;
    lifecycle.cancel({ invalidateSubmission: true });
    clearTimer();
    stopAudio();
  }

  function mainMenuOpened() {
    regulationEndPending = false;
    lifecycle.cancel({ invalidateSubmission: true });
    clearTimer();
    stopAudio();
  }

  function stopBattleActivity() {
    regulationEndPending = false;
    lifecycle.cancel({ invalidateSubmission: true });
    clearTimer();
    stopAudio();
  }

  return {
    catalogOpened,
    finishAnswer,
    mainMenuOpened,
    questionAdvanced,
    regulationEnded,
    reset,
    resultShown,
    stopBattleActivity,
    timerExpired,
  };
}
