import { createAnswerPositionState, prepareQuestionRound } from '../question-randomizer.mjs';

export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const ROOM_CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

export function normalizeRoomCode(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '');
}

export function isValidRoomCode(value) {
  return ROOM_CODE_PATTERN.test(normalizeRoomCode(value));
}

export function createSeededRandom(seed) {
  let state = (Number(seed) >>> 0) || 1;
  return function nextRandom() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeededQuestionDeck(questions, seed, questionOrder = 'random') {
  const random = createSeededRandom(seed);
  const answerPositionState = createAnswerPositionState();
  const activeQuestions = prepareQuestionRound(questions, random, answerPositionState, questionOrder);

  return {
    getQuestion(index) {
      while (index >= activeQuestions.length) {
        activeQuestions.push(...prepareQuestionRound(questions, random, answerPositionState, questionOrder));
      }
      return activeQuestions[index];
    },
    get length() {
      return activeQuestions.length;
    },
  };
}
