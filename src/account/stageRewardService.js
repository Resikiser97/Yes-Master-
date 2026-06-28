/**
 * @file        stageRewardService.js
 * @module      account
 * @summary     關卡通關入帳（MVP mock；idempotencyKey 防重複領取）
 * @exports     claimStageReward
 * @depends     src/account/walletService.js, config/economyConfig.js
 * @version     v0.0.20.0
 */

import { ECONOMY } from '../../config/economyConfig.js';
import { WalletService } from './walletService.js';

export function claimStageReward(completedStage, world) {
  try {
    // TODO: 多人後端版需改為 `stage-reward:{roomId}:{userId}:{stage}`。
    const idempotencyKey = `stage-reward:local:${completedStage}`;
    const result = WalletService.creditWallet({
      source: 'stage',
      reason: 'stage-clear',
      reward: {
        ticket: ECONOMY.session.ticketsPerStage,
        gold: ECONOMY.session.goldPerStage,
      },
      idempotencyKey,
    });

    console.log('STAGE_REWARD_CREDIT', {
      completedStage,
      roomId: world?.roomId ?? null,
      duplicate: result.duplicate,
      wallet: result.wallet,
    });

    return result;
  } catch (err) {
    console.warn('STAGE_REWARD_FAILED', { completedStage, err });
    return { ok: false, reason: 'stage_reward_failed', error: err };
  }
}
