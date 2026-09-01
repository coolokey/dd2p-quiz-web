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

export function createAnswerPositionState() {
  return { bags: new Map(), lastPositions: new Map() };
}

function refillPositionBag(count, random, lastPosition) {
  const bag = shuffleWithRandom(Array.from({ length: count }, (_, index) => index), random);
  if (bag.length > 1 && bag[0] === lastPosition) {
    const swapIndex = bag.findIndex(position => position !== lastPosition);
    [bag[0], bag[swapIndex]] = [bag[swapIndex], bag[0]];
  }
  return bag;
}

function drawAnswerPosition(state, count, random) {
  let bag = state.bags.get(count) ?? [];
  if (bag.length === 0) bag = refillPositionBag(count, random, state.lastPositions.get(count));
  const position = bag.shift();
  state.bags.set(count, bag);
  state.lastPositions.set(count, position);
  return position;
}

export function validateQuestionForRandomization(question) {
  if (!Array.isArray(question?.choices) || question.choices.length < 2 || question.choices.length > 4) {
    throw new RangeError('題目選項數必須介於 2 至 4');
  }
  if (!Number.isInteger(question.answerIndex)
      || question.answerIndex < 0
      || question.answerIndex >= question.choices.length) {
    throw new RangeError('題目正確答案索引無效');
  }
  return question;
}

export function randomizeQuestionToPosition(question, targetPosition, random = Math.random) {
  validateQuestionForRandomization(question);
  if (!Number.isInteger(targetPosition) || targetPosition < 0 || targetPosition >= question.choices.length) {
    throw new RangeError('正確答案目標位置超出選項範圍');
  }
  const correct = question.choices[question.answerIndex];
  const wrong = shuffleWithRandom(question.choices.filter((_, index) => index !== question.answerIndex), random);
  const choices = [...wrong];
  choices.splice(targetPosition, 0, correct);
  return { ...question, choices, answerIndex: targetPosition };
}

export function prepareQuestionRound(questions, random = Math.random, state = createAnswerPositionState(), questionOrder = 'random') {
  for (const question of questions) validateQuestionForRandomization(question);
  const orderedQuestions = questionOrder === 'fixed' ? [...questions] : shuffleWithRandom(questions, random);
  return orderedQuestions
    .map(question => {
      const position = drawAnswerPosition(state, question.choices.length, random);
      return randomizeQuestionToPosition(question, position, random);
    });
}
