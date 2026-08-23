export function shuffleWithRandom(values, random = Math.random) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function randomizeQuestion(question, random = Math.random) {
  const options = question.choices.map((choice, index) => ({
    choice,
    correct: index === question.answerIndex,
  }));
  const shuffled = shuffleWithRandom(options, random);
  return {
    ...question,
    choices: shuffled.map(option => option.choice),
    answerIndex: shuffled.findIndex(option => option.correct),
  };
}

export function prepareQuestionRound(questions, random = Math.random) {
  return shuffleWithRandom(questions, random)
    .map(question => randomizeQuestion(question, random));
}
