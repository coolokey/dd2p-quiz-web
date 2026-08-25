export const CPU_DIFFICULTIES = Object.freeze({
  easy: { minDelay: 4000, maxDelay: 7000, accuracy: 0.5 },
  normal: { minDelay: 2500, maxDelay: 5000, accuracy: 0.7 },
  hard: { minDelay: 1500, maxDelay: 3500, accuracy: 0.9 },
});

export function getCpuDelay(difficulty, random = Math.random) {
  const setting = CPU_DIFFICULTIES[difficulty] ?? CPU_DIFFICULTIES.normal;
  return Math.round(setting.minDelay + Math.min(1, random()) * (setting.maxDelay - setting.minDelay));
}

export function chooseCpuAnswer(question, difficulty, random = Math.random) {
  const setting = CPU_DIFFICULTIES[difficulty] ?? CPU_DIFFICULTIES.normal;
  if (random() < setting.accuracy) return question.answerIndex;
  const wrong = question.choices.map((_, index) => index).filter(index => index !== question.answerIndex);
  return wrong[Math.min(wrong.length - 1, Math.floor(random() * wrong.length))];
}

export function createCpuController({
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  random = Math.random,
} = {}) {
  let timerId = null;
  let generation = 0;
  function cancel() {
    generation += 1;
    if (timerId !== null) clearTimer(timerId);
    timerId = null;
  }
  function schedule({ question, difficulty, onAnswer }) {
    cancel();
    const currentGeneration = generation;
    const answerIndex = chooseCpuAnswer(question, difficulty, random);
    timerId = setTimer(() => {
      if (currentGeneration !== generation) return;
      timerId = null;
      onAnswer(answerIndex);
    }, getCpuDelay(difficulty, random));
  }
  return { schedule, cancel };
}
