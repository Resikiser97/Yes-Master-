/**
 * @file        gameLoop.js
 * @module      game（狀態/orchestration 層，非純邏輯、非渲染）
 * @summary     固定 timestep 遊戲 loop；requestAnimationFrame 只排畫面，不決定遊戲速度
 * @exports     createGameLoop, startGameLoop
 * @depends     config/gameConfig.js
 * @sourceOfTruth Docs/game-architecture-plan.md「隨機與時間必須注入」
 * @version     v0.0.15.0
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';

export function createGameLoop({
  update,
  render,
  fixedStepSeconds = GAME_CONFIG.time.fixedStepSeconds,
  maxFrameDeltaSeconds = GAME_CONFIG.time.maxFrameDeltaSeconds,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
} = {}) {
  let raf = 0;
  let running = false;
  let lastTimestampMs = null;
  let accumulatorSeconds = 0;

  const maxFrameDeltaMs = maxFrameDeltaSeconds * 1000;

  const frame = (timestampMs) => {
    if (!running) return;
    if (lastTimestampMs === null) lastTimestampMs = timestampMs;

    const frameDeltaMs = Math.min(timestampMs - lastTimestampMs, maxFrameDeltaMs);
    lastTimestampMs = timestampMs;
    accumulatorSeconds += frameDeltaMs / 1000;

    while (accumulatorSeconds + Number.EPSILON >= fixedStepSeconds) {
      update?.(fixedStepSeconds);
      accumulatorSeconds -= fixedStepSeconds;
    }

    render?.(accumulatorSeconds / fixedStepSeconds);
    raf = requestFrame(frame);
  };

  return {
    start() {
      if (running || !requestFrame) return;
      running = true;
      lastTimestampMs = null;
      accumulatorSeconds = 0;
      raf = requestFrame(frame);
    },
    stop() {
      running = false;
      if (raf && cancelFrame) cancelFrame(raf);
      raf = 0;
    },
    isRunning() {
      return running;
    },
    get fixedStepSeconds() {
      return fixedStepSeconds;
    },
  };
}

export function startGameLoop(options) {
  const loop = createGameLoop(options);
  loop.start();
  return loop;
}

