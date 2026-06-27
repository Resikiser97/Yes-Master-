/**
 * @file        protocol.js
 * @module      net
 * @summary     多人 data-channel 訊息格式：MSG 類型常數、encode/decode（JSON）、makeMessage/safeDecode/byteLength
 * @exports     MSG, makeMessage, encode, decode, safeDecode, byteLength
 * @depends     （無）
 * @version     v0.0.17.0
 */

export const MSG = Object.freeze({
  AUTH: 'auth',
  AUTH_OK: 'auth_ok',
  AUTH_FAIL: 'auth_fail',
  INPUT: 'input',
  SNAPSHOT: 'snapshot',
  DELTA: 'delta',
  PING: 'ping',
  PONG: 'pong',
  REJECT: 'reject',
  STRIKE: 'strike',
  KICK: 'kick',
  HOST_MIGRATION: 'host_migration',
  CHAT: 'chat',
  GAME_START: 'game_start',
  PLAYER_INFO: 'player_info',
});

export function makeMessage(type, payload = {}, meta = {}) {
  return {
    type,
    payload,
    sentAt: Date.now(),
    ...meta,
  };
}

export function encode(message) {
  return JSON.stringify(message);
}

export function decode(raw) {
  const message = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!message || typeof message.type !== 'string') {
    throw new Error('invalid protocol message');
  }
  return message;
}

export function safeDecode(raw) {
  try {
    return { ok: true, message: decode(raw) };
  } catch (error) {
    return { ok: false, error };
  }
}

export function byteLength(value) {
  const text = typeof value === 'string' ? value : encode(value);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return text.length;
}
