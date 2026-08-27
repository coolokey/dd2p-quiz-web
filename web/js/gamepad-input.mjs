import { PLAYER_KEYS } from './input.mjs';

export const GAMEPAD_PLAYER_MAP = ['left', 'right'];

export function createGamepadState() {
  return {
    previousPressed: new Map(),
  };
}

export function getConnectedGamepads(getGamepadsFn = () => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [])) {
  const raw = getGamepadsFn() || [];
  const list = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i]) list.push(raw[i]);
  }
  return list;
}

export function mapGamepadButtonToEvent(player, buttonIndex) {
  const keys = PLAYER_KEYS[player];
  if (!keys) return null;

  if (buttonIndex >= 0 && buttonIndex <= 3) {
    return {
      player,
      type: 'answer',
      answerIndex: buttonIndex,
      code: keys.answers[buttonIndex],
    };
  }

  if (buttonIndex === 9) {
    return {
      player,
      type: 'start',
    };
  }

  if (buttonIndex === 8) {
    return {
      player,
      type: 'select',
    };
  }

  if (buttonIndex === 12) {
    return { player, type: 'navigation', direction: 'up', code: keys.navigation[0] };
  }
  if (buttonIndex === 13) {
    return { player, type: 'navigation', direction: 'down', code: keys.navigation[1] };
  }
  if (buttonIndex === 14) {
    return { player, type: 'navigation', direction: 'left', code: keys.navigation[2] };
  }
  if (buttonIndex === 15) {
    return { player, type: 'navigation', direction: 'right', code: keys.navigation[3] };
  }

  return null;
}

export function pollGamepadEvents(state, getGamepadsFn = () => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [])) {
  const rawGamepads = getGamepadsFn() || [];
  const events = [];

  for (let padIndex = 0; padIndex < Math.min(rawGamepads.length, 2); padIndex++) {
    const pad = rawGamepads[padIndex];
    if (!pad) continue;

    const player = GAMEPAD_PLAYER_MAP[padIndex];
    if (!player) continue;

    if (!state.previousPressed.has(padIndex)) {
      state.previousPressed.set(padIndex, new Set());
    }
    const prevSet = state.previousPressed.get(padIndex);
    const currentSet = new Set();

    if (pad.buttons) {
      for (let btnIndex = 0; btnIndex < pad.buttons.length; btnIndex++) {
        const btn = pad.buttons[btnIndex];
        const isPressed = typeof btn === 'object' ? Boolean(btn && (btn.pressed || btn.value > 0.5)) : btn > 0.5;
        const keyId = `btn_${btnIndex}`;

        if (isPressed) {
          currentSet.add(keyId);
          if (!prevSet.has(keyId)) {
            const event = mapGamepadButtonToEvent(player, btnIndex);
            if (event) events.push(event);
          }
        }
      }
    }

    if (pad.axes && pad.axes.length >= 2) {
      const axisX = pad.axes[0];
      const axisY = pad.axes[1];

      if (axisX < -0.5) {
        currentSet.add('axis_left');
        if (!prevSet.has('axis_left')) {
          events.push({ player, type: 'navigation', direction: 'left', code: PLAYER_KEYS[player].navigation[2] });
        }
      } else if (axisX > 0.5) {
        currentSet.add('axis_right');
        if (!prevSet.has('axis_right')) {
          events.push({ player, type: 'navigation', direction: 'right', code: PLAYER_KEYS[player].navigation[3] });
        }
      }

      if (axisY < -0.5) {
        currentSet.add('axis_up');
        if (!prevSet.has('axis_up')) {
          events.push({ player, type: 'navigation', direction: 'up', code: PLAYER_KEYS[player].navigation[0] });
        }
      } else if (axisY > 0.5) {
        currentSet.add('axis_down');
        if (!prevSet.has('axis_down')) {
          events.push({ player, type: 'navigation', direction: 'down', code: PLAYER_KEYS[player].navigation[1] });
        }
      }
    }

    state.previousPressed.set(padIndex, currentSet);
  }

  return events;
}
