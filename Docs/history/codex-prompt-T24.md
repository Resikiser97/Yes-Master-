# Codex Prompt — T24：P2P 重連功能鏈完整 wiring（client 自動重連 + connection_epoch + queue timeout）

> **版本目標：v0.0.36.0**

---

## 背景（先讀，避免誤判範圍）

Dashboard 原本把這件事描述成「P2P 安全限制部分實作，缺 3 個小防呆」，但實際調查後發現是**一整條沒接上的功能鏈**：

1. `src/net/reconnect.js` 的 `createReconnectController` **整個專案沒有任何地方呼叫它**（死碼）。
2. `src/net/peerClient.js` 完全沒有 `conn.on('close', ...)` 斷線偵測，斷線後不會自動做任何事。
3. `connection_epoch` 這個欄位在 `src/` 裡完全不存在（只在 `Docs/game-architecture-plan.md` 出現）。`src/net/validation.js` 目前用單一 `sequenceId` 防重放，這個狀態在整個 host session 期間只建立一次、從未重置——若重連被接上而 client 端 `sequenceId` 從新的計數起點開始，host 端的期望值仍停在斷線前的高位數字，重連玩家會永久卡在 `bad_sequence`/`replay` 拒絕。
4. `src/net/inputBuffer.js` 的 queue 沒有任何 `host_received_at` 逾時丟棄機制。
5. **額外發現的真 bug**（原本 dashboard 沒提到）：`src/game/world.js` 的 `ensurePlayer()` 只在玩家「不存在」時建立新 entry，重連時玩家 entry 已存在（斷線只是把 `online` 設 `false`，不會刪除），所以 `ensurePlayer()` 不會把 `online` 撥回 `true`。就算網路層重連修好了，`world.players.get(slotId).online` 仍然是 `false`，遊戲邏輯（例如卡片投票 `eligibleCardVotePlayerIds`）還是會把這個已經重連回來的玩家當離線排除。
6. **已確認不需要重做的部分**：`syncScheduler.js` 的 `sendSnapshotTo(peerId, world)` 已經 wiring 在 `peerHost.js` 的 `onPeerReady` callback（`main.js:206`/`235`），任何新 AUTH 成功（含 reconnect）都會自動收到一份 Full Snapshot。這塊不用動。

---

## 架構原則（依 `.claude/instructions.md` 5.1）

這是多人/斷線重連任務，四路徑都要顧到：
1. Host 端（`peerHost.js`）指派/追蹤 `connection_epoch`
2. Client 端（`peerClient.js`）偵測斷線、自動重連、攜帶 `connectionEpoch` 送出的每個 input
3. 驗證層（`validation.js`）依 `connectionEpoch` 重置序號基準，拒絕舊 epoch 殘留封包
4. 既有測試要更新（`multiplayerInput.test.js` 的 `testMovementInputsAreNotRateLimited` 目前送的 input 沒有 `connectionEpoch`，改完驗證邏輯後這個測試會直接壞掉，必須同步更新）

---

## 執行順序（強制分兩階段，不要一次全改完才驗證）

這個任務會動到多人連線的核心鏈路，一次全改完再測風險太高。**請照以下順序分階段進行，每階段結束都要跑一次 `node tests/index.js` 確認全過，再進下一階段：**

**階段一（純邏輯層，可完整單元測試，風險低）：**
- 檔案 2 `reconnect.js`
- 檔案 4 `validation.js`
- 檔案 5 `inputBuffer.js`
- 檔案 9 的測試 A/B/C/D（更新既有測試 + 新增 `validation.test.js`/`inputBufferQueue.test.js`/`reconnect.test.js`）
- 檔案 10 `tests/index.js`（先只掛入這階段的新測試）

跑 `node tests/index.js` 確認全過，這階段先不要動 `peerHost.js`/`peerClient.js`/`main.js`。

**階段二（實際網路層 wiring，無法單元測試，靠人工複查 + `node --check`）：**
- 檔案 1 `config/gameConfig.js`（版本號放最後）
- 檔案 3 `peerHost.js`（含上面 C 段落的 race condition 修復）
- 檔案 6 `peerClient.js`（完整重寫）
- 檔案 7 `netSession.js`
- 檔案 8 `main.js`

這階段完成後，`node --check` 過語法即可，`peerHost.js`/`peerClient.js` 不強求單元測試（見下方架構約束第5點），但**開發者會另外安排實機多人連線測試**（開兩個瀏覽器分頁模擬 host+client，手動斷網路重連）驗證這階段的實際行為，不是只憑程式碼審查就直接視為完成。

---

## 修改檔案（共 9 個）

### 1. `config/gameConfig.js`
`@version` 與 `GAME_CONFIG.version` → `v0.0.36.0`（canonical source，最後改）。

---

### 2. `src/net/reconnect.js`

補兩個東西：`slotId` 支援延遲解析（首次連線時 slotId 還不知道，要等 AUTH 成功才有），以及最大重試次數防止無限重連轟炸 Edge Function：

```js
/**
 * @file        reconnect.js
 * @module      net
 * @summary     斷線重連 controller：grace 期後自動申請 reconnect token 並重新呼叫 connect；
 *              達最大重試次數後放棄並回呼 onGiveUp；成功後呼叫方須呼叫 cancel() 重置嘗試計數
 * @exports     createReconnectController
 * @depends     net/roomManager.js
 * @sourceOfTruth Docs/game-architecture-plan.md「斷線重連機制」章節
 * @version     v0.0.36.0
 */
import { issueRoomJoinToken } from './roomManager.js';

export function createReconnectController({
  roomId,
  slotId,
  cfg,
  connect,
  graceMs = 3000,
  maxAttempts = 5,
  onGiveUp = null,
} = {}) {
  let timer = 0;
  let attempts = 0;
  const controller = {
    schedule() {
      clearTimeout(timer);
      if (attempts >= maxAttempts) {
        onGiveUp?.();
        return;
      }
      timer = setTimeout(() => controller.reconnect(), graceMs);
    },
    cancel() {
      clearTimeout(timer);
      timer = 0;
      attempts = 0;
    },
    async reconnect() {
      attempts += 1;
      const resolvedSlotId = typeof slotId === 'function' ? slotId() : slotId;
      const token = await issueRoomJoinToken({ room_id: roomId, join_type: 'reconnect', slot_id: resolvedSlotId }, cfg);
      return connect?.({ roomId, token, slotId: resolvedSlotId });
    },
  };
  return controller;
}
```

> 注意原本 `schedule()` 內用 `this.reconnect()`——箭頭函式或物件解構後呼叫方式改變時 `this` 容易出錯，改成 `controller.reconnect()` 直接引用物件本身，更安全。

---

### 3. `src/net/peerHost.js`

**A. 頂部新增 `epochs` Map（約 line 22 `const peers = new Map();` 之後）：**
```js
const epochs = new Map(); // slotId -> 目前有效的 connection_epoch
```

**B. AUTH 成功分支（約 line 69-77）整段改為：**
```js
try {
  const verified = await verifyRoomJoinToken(message.payload?.token, cfg);
  if (roomId && verified.room_id !== roomId) throw new Error('room mismatch');
  const slotId = host.reserveSlot(verified);
  if (world) {
    ensurePlayer(world, slotId, cfg);
    const player = world.players.get(slotId);
    if (player) player.online = true; // 首次加入或重連都要確保標記為在線（ensurePlayer 只在新建時設值，既有 entry 不會自動撥回）
  }
  const nextEpoch = (epochs.get(slotId) ?? 0) + 1;
  epochs.set(slotId, nextEpoch);
  const session = { conn, uid: verified.uid, slotId, connectedAt: Date.now(), lastPongAt: Date.now(), connectionEpoch: nextEpoch };
  peers.set(conn.peer, session);
  sendConn(conn, makeMessage(MSG.AUTH_OK, { slotId, peerId, hostEpoch: message.payload?.hostEpoch ?? 1, connectionEpoch: nextEpoch }));
  host._onPeerReady?.(conn.peer, session);
} catch (error) {
  sendConn(conn, makeMessage(MSG.AUTH_FAIL, { reason: error.message }));
  conn.close?.();
}
```

**C.（P0，必修，reviewer 抓到的 race condition）：`conn.on('close', ...)` stale session 防護**

T24 讓重連沿用**同一個 `Peer` 物件**（見檔案 6 `peerClient.js`），代表同一個玩家斷線重連前後，host 收到的 `conn.peer`（PeerJS 對外 id）字串**不會變**。這造成一個真實的競態：

1. 玩家原本的連線 A 斷線，client 端排程重連。
2. 重連建立新連線 B，`AUTH_OK` 成功，`peers.set(conn.peer, sessionB)`——**用同一個 key 覆蓋掉 sessionA**。
3. 如果連線 A 的 WebRTC `close` 事件因為延遲，在步驟 2 之後才真正觸發，目前的 `conn.on('close', ...)` handler 會用 `peers.get(conn.peer)` 重新查表——查到的是**剛剛才生效的 sessionB**，不是它自己原本對應的 sessionA。
4. 結果：連線 A 的 close handler 會把剛重連成功的玩家錯誤標成 `online = false`，還會 `peers.delete(conn.peer)` 把**還活著的 sessionB** 從 map 上刪掉——sessionB 之後收到的 INPUT/PING 全部找不到 session，等於重連後又立刻無聲斷線。

**修法：任何要清理 session 的地方，都必須先確認「map 裡現在這個 key 對應的 session，仍然是自己這個 `conn` 物件」，不能只憑 `conn.peer` 這個 key 查表就動手。** 用物件身分比對（`session.conn === conn`），不要用 `connectionEpoch` 比對（epoch 是給封包序號防重放用的，跟「這個 conn 是否還是目前有效連線」是兩件事，混用容易搞錯層次）。

`conn.on('close', ...)`（約 line 97-101）改為：
```js
conn.on('close', () => {
  const session = peers.get(conn.peer);
  if (!session || session.conn !== conn) return; // 已被更新的連線（例如重連後的新 session）取代，這個 close 事件是舊連線的殘留，不處理
  if (world?.players?.has(session.slotId)) world.players.get(session.slotId).online = false;
  peers.delete(conn.peer);
});
```

ping-timeout 迴圈（約 line 108-115）本身**不用改**——它是從當下的 `peers` Map 直接取出即時 session 呼叫 `session.conn.close?.()`，呼叫當下沒有 staleness 問題；但呼叫之後 PeerJS 觸發的 `close` 事件一樣會跑到上面修好的 `conn.on('close', ...)` handler，同一份防護已經涵蓋這個路徑。**T21 已經修過 ping-timeout 內「先標 offline 再 delete」的時序，這次不用重複改那段**，只需要確認上面 (C) 的 `conn.on('close')` 防護有加上去即可——兩個修法疊在一起才是完整防護，不要因為「T21 提過不用動 ping-timeout」就誤以為 (C) 也不用改。

**D.** `@version` header 更新為 `v0.0.36.0`。

---

### 4. `src/net/validation.js`

`createInputValidator` 整段改為 epoch-aware：

```js
export function createInputValidator({ cfg, limits = DEFAULT_LIMITS } = {}) {
  const last = new Map(); // playerId -> { epoch, sequenceId, actionAt }

  return function validateInput(input, { world, playerId } = {}) {
    if (!input || typeof input !== 'object') return reject('malformed');
    if (!Number.isInteger(input.sequenceId) || input.sequenceId < 0) return reject('bad_sequence');
    if (!Number.isInteger(input.connectionEpoch) || input.connectionEpoch < 1) return reject('bad_epoch');

    const now = Date.now();
    let state = last.get(playerId);
    if (!state || input.connectionEpoch > state.epoch) {
      // 新 epoch（首次連線或重連後）：序號基準重置，不沿用舊 epoch 的序號
      state = { epoch: input.connectionEpoch, sequenceId: -1, actionAt: 0 };
      last.set(playerId, state);
    } else if (input.connectionEpoch < state.epoch) {
      return reject('stale_epoch'); // 舊連線殘留封包，直接丟棄
    }

    if (input.sequenceId <= state.sequenceId) return reject('replay');
    if (input.sequenceId - state.sequenceId > limits.maxSequenceGap && state.sequenceId >= 0) return reject('sequence_gap');

    if (input.move) {
      if (!validAxis(input.move.x) || !validAxis(input.move.y)) return reject('bad_move_vector');
    }

    const actions = input.actions?.length ? input.actions : (input.action ? [input.action] : []);
    if (actions.length) {
      if (limits.minActionIntervalMs > 0 && now - state.actionAt < limits.minActionIntervalMs) return reject('action_rate');
      for (const action of actions) {
        const actionResult = validateAction(action, { world, playerId, cfg });
        if (!actionResult.ok) return actionResult;
      }
      state.actionAt = now;
    }

    state.sequenceId = input.sequenceId;
    return { ok: true };
  };
}
```

`@version` header 更新為 `v0.0.36.0`。

---

### 5. `src/net/inputBuffer.js`

**A. `createInputBuffer` 加入可注入的時鐘 + queue 逾時丟棄（依專案鐵則：時間一律參數注入，不可寫死 `Date.now()` 讓測試不可控）：**

```js
export function createInputBuffer({ cfg, validator = createInputValidator({ cfg }), now = () => Date.now(), maxQueueAgeMs = 5000 } = {}) {
  const queue = new Map();
  return {
    push(playerId, input) {
      if (!queue.has(playerId)) queue.set(playerId, []);
      queue.get(playerId).push({ input, receivedAt: now() });
    },
    drain(world, dt, onReject = null) {
      const nowTs = now();
      for (const [playerId, entries] of queue) {
        while (entries.length) {
          const { input, receivedAt } = entries.shift();
          if (nowTs - receivedAt > maxQueueAgeMs) {
            onReject?.(playerId, 'stale_queue', input);
            continue;
          }
          const valid = validator(input, { world, playerId });
          if (!valid.ok) {
            onReject?.(playerId, valid.reason, input);
            continue;
          }
          applyInput(world, playerId, input, dt, cfg);
        }
      }
    },
  };
}
```

> `push`/`drain` 對外簽名不變，呼叫方（`main.js`/`peerHost.js` 的 `onInput`）完全不用改。

**B. `serializeControls` 加入 `connectionEpoch`（從 `extra` 讀，維持純函式、不碰網路物件）：**

```js
export function serializeControls(controls, world, cfg, sequenceId, extra = {}) {
  const t = cfg.render.tilePx;
  const tileX = Math.floor(((controls.mouse?.x ?? 0) + (world.camera?.x ?? 0)) / t);
  const tileY = Math.floor(((controls.mouse?.y ?? 0) + (world.camera?.y ?? 0)) / t);
  const slot = controls.getSelectedSlot?.();
  const selectedBlock = slot != null ? cfg.hotbar[slot] : null;
  const actions = consumeControlActions(controls, world, selectedBlock, tileX, tileY, cfg);
  const manualIntent = controls.consumeManualIntent?.();
  return {
    sequenceId,
    connectionEpoch: extra.connectionEpoch ?? null,
    move: controls.getMoveVector?.() ?? { x: 0, y: 0 },
    mining: !!controls.isMining?.(),
    repairing: !!controls.isRepairing?.(),
    action: actions[0] ?? null,
    actions,
    debugActions: extra.debugActions ?? [],
    selectedBlock,
    tile: { x: tileX, y: tileY },
    manualIntent,
  };
}
```

`@version` header 更新為 `v0.0.36.0`。

---

### 6. `src/net/peerClient.js`（完整重寫）

```js
/**
 * @file        peerClient.js
 * @module      net
 * @summary     PeerJS 客戶端（非房主玩家）：加入房間、取 room_join_token、連線房主、完成 auth handshake；
 *              斷線後自動排程重連（沿用同一個 Peer 物件，重新 issue reconnect token + 重做 handshake）
 * @exports     startPeerClient
 * @depends     net/protocol.js, net/peerRuntime.js, net/roomManager.js, net/reconnect.js
 * @version     v0.0.36.0
 */
import { GAME_CONFIG } from '../../config/gameConfig.js';
import { MSG, decode, encode, makeMessage } from './protocol.js';
import { createPeer, waitForPeerOpen } from './peerRuntime.js';
import { getRoom, issueRoomJoinToken } from './roomManager.js';
import { createReconnectController } from './reconnect.js';

export async function startPeerClient({
  roomId,
  cfg = GAME_CONFIG,
  token = null,
  onMessage = null,
  onAuthed = null,
  onDisconnected = null,
  onReconnected = null,
  onReconnectFailed = null,
} = {}) {
  if (!roomId) throw new Error('roomId is required');
  const room = await getRoom(roomId, cfg);
  const hostPeerId = room.current_host_peer_id;
  if (!hostPeerId) throw new Error('room has no host peer id');
  const initialToken = token ?? await issueRoomJoinToken({ room_id: roomId, join_type: 'join' }, cfg);

  const peer = await createPeer(cfg);
  await waitForPeerOpen(peer);

  let closing = false;

  const client = {
    role: 'client',
    peer,
    conn: null,
    slotId: null,
    hostPeerId,
    connectionEpoch: null,
    isHost: () => false,
    send(message) {
      if (client.conn?.open === false) return;
      client.conn?.send(encode(message));
    },
    sendInput(input) {
      client.send(makeMessage(MSG.INPUT, input));
    },
    _onMessage: onMessage,
    close() {
      closing = true;
      reconnectCtl.cancel();
      client.conn?.close?.();
      peer.destroy?.();
    },
  };

  const reconnectCtl = createReconnectController({
    roomId,
    slotId: () => client.slotId,
    cfg,
    onGiveUp: () => onReconnectFailed?.(),
    connect: async ({ token: reconnectToken }) => {
      try {
        await attemptConnect(reconnectToken);
        reconnectCtl.cancel(); // 成功後歸零嘗試次數，之後再斷線可以重新算滿額度
        onReconnected?.();
      } catch (err) {
        console.warn('[net] reconnect attempt failed', err);
        reconnectCtl.schedule();
      }
    },
  });

  function attemptConnect(joinToken) {
    return new Promise((resolve, reject) => {
      const conn = peer.connect(hostPeerId, { reliable: true });
      client.conn = conn;
      const timer = setTimeout(() => reject(new Error('auth timeout')), 8000);
      let authed = false;

      conn.on('open', () => {
        conn.send(encode(makeMessage(MSG.AUTH, { token: joinToken, roomId })));
      });
      conn.on('data', (raw) => {
        const message = decode(raw);
        if (!authed && message.type === MSG.AUTH_OK) {
          authed = true;
          clearTimeout(timer);
          client.slotId = message.payload.slotId;
          client.connectionEpoch = message.payload.connectionEpoch ?? null;
          onAuthed?.(message.payload);
          resolve();
          return;
        }
        if (!authed && message.type === MSG.AUTH_FAIL) {
          clearTimeout(timer);
          reject(new Error(message.payload?.reason ?? 'auth failed'));
          return;
        }
        if (message.type === MSG.PING) {
          client.send(makeMessage(MSG.PONG, { t: message.payload?.t ?? Date.now() }));
          return;
        }
        client._onMessage?.(message);
      });
      conn.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      conn.on('close', () => {
        if (!authed) return; // 認證完成前的 close 由上面 error/timeout/AUTH_FAIL 處理，不在這裡重連
        if (closing) return; // 主動呼叫 client.close() 造成的關閉，不觸發重連
        onDisconnected?.();
        reconnectCtl.schedule();
      });
    });
  }

  await attemptConnect(initialToken);
  return client;
}
```

**風險點（審核時務必檢查）**：
- `peer.connect(hostPeerId, ...)` 重連時**沿用同一個 `Peer` 物件**（不是重新 `createPeer()`），因為 `Peer`（signaling 連線）沒有被 `destroy()`，理論上可以重複呼叫 `.connect()` 建立新的 DataConnection。這是刻意設計（比整個重建 Peer 簡單、且 host 端 `conn.peer`（PeerJS peer id）維持一致，`peers` Map 的 key 行為可預期）。**如果你在測試/驗證時發現 PeerJS 的 `Peer` 物件在 DataConnection 關閉後無法再次 `.connect()` 成功，請回報這個假設是錯的，不要硬改成看起來能跑但實際行為不對的寫法。**
- `waitingRoom.js` 目前直接呼叫 `startPeerClient({ roomId, onMessage })`（不經過 `netSession.js`），沒有傳新的 `onDisconnected`/`onReconnected`/`onReconnectFailed`——這沒關係，這三個 callback 全部有預設值 `null`（optional chaining呼叫，`null?.()` 安全），`waitingRoom.js` 那條路徑一樣會自動重連，只是沒有 console log，不用特地去改 `waitingRoom.js`。

---

### 7. `src/net/netSession.js`

`createNetSession` 的 client 分支加入新 callback 透傳：

```js
export async function createNetSession({
  cfg = GAME_CONFIG,
  role = 'host',
  roomId = null,
  world = null,
  onInput = null,
  onMessage = null,
  onPeerReady = null,
  onDisconnected = null,
  onReconnected = null,
  onReconnectFailed = null,
} = {}) {
  if (role === 'host') {
    return startPeerHost({ roomId, cfg, world, onInput, onPeerReady });
  }
  const client = await startPeerClient({
    roomId,
    cfg,
    onMessage,
    onAuthed(payload) {
      if (world) world.localPlayerId = payload.slotId;
    },
    onDisconnected,
    onReconnected,
    onReconnectFailed,
  });
  client.sendInput = (input) => {
    client.send(makeMessage(MSG.INPUT, input));
  };
  return client;
}
```

`@version` header 更新為 `v0.0.36.0`。

---

### 8. `src/main.js`

**A. client 端送 input 時附上 `connectionEpoch`（約 line 275）：**
```js
if (netSession?.sendInput) {
  netSession.sendInput(serializeControls(controls, world, cfg, inputSequenceId++, { debugActions, connectionEpoch: netSession.connectionEpoch }));
}
```

**B. 首次建立 client session 的 `createNetSession` 呼叫（約 line 214-224）加入基本 console log（比照既有 `console.info('[net] ...')` 風格，不用做 UI）：**
```js
createNetSession({
  cfg,
  role: 'client',
  roomId: netRoomId,
  world,
  onMessage: (message) => {
    if (clientSync?.handle(message)) {
      world = worldRef.current;
      prevPhase = world.phase;
    }
  },
  onDisconnected: () => console.warn('[net] disconnected, attempting reconnect...'),
  onReconnected: () => console.info('[net] reconnected'),
  onReconnectFailed: () => console.warn('[net] reconnect failed after max attempts, giving up'),
}).then((session) => {
  netSession = session;
  console.info('[net] client ready', session.slotId);
}).catch((err) => console.warn('[net] client start failed', err));
```

> 第二個 client 分支（約 line 239-248，「reusing waitingRoom session」）不用加這三個 callback——那個 `netSession` 物件是從 `waitingRoom.js` 直接呼叫 `startPeerClient`拿到的，已經內建自動重連（見上方檔案6風險點），只是沒有 console log，不影響功能。

---

### 9. 測試

**A. 修正既有測試** `tests/multiplayerInput.test.js` 的 `testMovementInputsAreNotRateLimited`（約 line 14-24）——`validation.js` 現在會拒絕沒有 `connectionEpoch` 的 input，這個既有測試會壞掉，必須更新：

```js
function testMovementInputsAreNotRateLimited() {
  const cfg = multiConfig();
  const world = createWorld(cfg);
  ensurePlayer(world, 'p2', cfg);
  const validate = createInputValidator({ cfg });

  for (let i = 0; i < 10; i++) {
    const out = validate({ sequenceId: i, connectionEpoch: 1, move: { x: 1, y: 0 }, action: null }, { world, playerId: 'p2' });
    assert.equal(out.ok, true);
  }
}
```

**B. 新建 `tests/validation.test.js`**（epoch-aware 防重放邏輯）：

```js
import assert from 'node:assert/strict';
import { createInputValidator } from '../src/net/validation.js';

function baseInput(overrides = {}) {
  return { sequenceId: 0, connectionEpoch: 1, move: { x: 0, y: 0 }, action: null, ...overrides };
}

// 1. 缺少/非法 connectionEpoch 一律拒絕
function testMissingOrInvalidEpochIsRejected() {
  const validate = createInputValidator({ cfg: {} });
  assert.equal(validate(baseInput({ connectionEpoch: undefined }), { playerId: 'p1' }).ok, false);
  assert.equal(validate(baseInput({ connectionEpoch: 0 }), { playerId: 'p1' }).ok, false);
  assert.equal(validate(baseInput({ connectionEpoch: -1 }), { playerId: 'p1' }).ok, false);
  assert.equal(validate(baseInput({ connectionEpoch: 1.5 }), { playerId: 'p1' }).ok, false);
}

// 2. 同一 epoch 內序號遞增正常通過，重放/回退被拒絕
function testSameEpochSequenceMonotonic() {
  const validate = createInputValidator({ cfg: {} });
  assert.equal(validate(baseInput({ sequenceId: 0, connectionEpoch: 1 }), { playerId: 'p1' }).ok, true);
  assert.equal(validate(baseInput({ sequenceId: 1, connectionEpoch: 1 }), { playerId: 'p1' }).ok, true);
  assert.equal(validate(baseInput({ sequenceId: 1, connectionEpoch: 1 }), { playerId: 'p1' }).ok, false, 'replay of same sequenceId must be rejected');
  assert.equal(validate(baseInput({ sequenceId: 0, connectionEpoch: 1 }), { playerId: 'p1' }).ok, false, 'sequenceId going backward must be rejected');
}

// 3. 新 epoch（重連後）序號從頭開始也能通過，不受舊 epoch 高序號影響
function testNewEpochResetsSequenceBaseline() {
  const validate = createInputValidator({ cfg: {} });
  assert.equal(validate(baseInput({ sequenceId: 50, connectionEpoch: 1 }), { playerId: 'p1' }).ok, true);
  // 重連：epoch 變 2，client 端序號從 0 重新算
  assert.equal(validate(baseInput({ sequenceId: 0, connectionEpoch: 2 }), { playerId: 'p1' }).ok, true, 'new epoch should reset sequence baseline, not be rejected as replay');
  assert.equal(validate(baseInput({ sequenceId: 1, connectionEpoch: 2 }), { playerId: 'p1' }).ok, true);
}

// 4. 舊 epoch 的殘留封包在新 epoch 生效後一律丟棄
function testStaleEpochPacketIsRejected() {
  const validate = createInputValidator({ cfg: {} });
  validate(baseInput({ sequenceId: 0, connectionEpoch: 2 }), { playerId: 'p1' });
  // 舊連線 (epoch 1) 延遲送達的封包，即使 sequenceId 看起來合法也要丟棄
  assert.equal(validate(baseInput({ sequenceId: 99, connectionEpoch: 1 }), { playerId: 'p1' }).ok, false, 'packet from an old epoch must be rejected even with a high sequenceId');
}

// 5. 不同 playerId 的 epoch/序號狀態互不干擾
function testEpochStateIsPerPlayer() {
  const validate = createInputValidator({ cfg: {} });
  assert.equal(validate(baseInput({ sequenceId: 5, connectionEpoch: 3 }), { playerId: 'p1' }).ok, true);
  assert.equal(validate(baseInput({ sequenceId: 0, connectionEpoch: 1 }), { playerId: 'p2' }).ok, true, 'a different player starting at epoch 1 should not be affected by p1 state');
}

testMissingOrInvalidEpochIsRejected();
testSameEpochSequenceMonotonic();
testNewEpochResetsSequenceBaseline();
testStaleEpochPacketIsRejected();
testEpochStateIsPerPlayer();
console.log('validation tests passed');
```

**C. 新建 `tests/inputBufferQueue.test.js`**（`host_received_at` 逾時丟棄，用注入時鐘做到完全可控，不依賴真實 `Date.now()`）：

```js
import assert from 'node:assert/strict';
import { createInputBuffer } from '../src/net/inputBuffer.js';
import { createWorld } from '../src/game/world.js';
import { GAME_CONFIG } from '../config/gameConfig.js';

function fakeClock(startAt = 0) {
  let t = startAt;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

// 1. 在逾時門檻內的 input 正常處理
function testFreshInputIsProcessed() {
  const clock = fakeClock(0);
  const buffer = createInputBuffer({ cfg: GAME_CONFIG, now: clock.now, maxQueueAgeMs: 5000 });
  const world = createWorld(GAME_CONFIG);
  const rejected = [];

  buffer.push('p1', { sequenceId: 0, connectionEpoch: 1, move: { x: 0, y: 0 } });
  clock.advance(1000); // 1 秒後才 drain，仍在 5 秒門檻內
  buffer.drain(world, GAME_CONFIG.time.fixedStepSeconds, (playerId, reason) => rejected.push(reason));

  assert.deepEqual(rejected, [], 'input within maxQueueAgeMs should not be rejected for staleness');
}

// 2. 超過 5 秒才被處理的 input 直接丟棄（stale_queue），不呼叫 validator/applyInput
function testStaleQueuedInputIsDiscarded() {
  const clock = fakeClock(0);
  const buffer = createInputBuffer({ cfg: GAME_CONFIG, now: clock.now, maxQueueAgeMs: 5000 });
  const world = createWorld(GAME_CONFIG);
  const rejected = [];

  buffer.push('p1', { sequenceId: 0, connectionEpoch: 1, move: { x: 1, y: 0 } });
  clock.advance(5001); // 超過門檻
  buffer.drain(world, GAME_CONFIG.time.fixedStepSeconds, (playerId, reason) => rejected.push(reason));

  assert.deepEqual(rejected, ['stale_queue']);
}

// 3. 同一批次中新舊 input 分開判斷（先進先出，各自依自己 receivedAt 判斷）
function testMixedFreshAndStaleInputsInSameDrain() {
  const clock = fakeClock(0);
  const buffer = createInputBuffer({ cfg: GAME_CONFIG, now: clock.now, maxQueueAgeMs: 5000 });
  const world = createWorld(GAME_CONFIG);
  const rejected = [];

  buffer.push('p1', { sequenceId: 0, connectionEpoch: 1, move: { x: 0, y: 0 } }); // t=0
  clock.advance(6000); // 這筆已經逾時
  buffer.push('p1', { sequenceId: 1, connectionEpoch: 1, move: { x: 0, y: 0 } }); // t=6000，這筆是新的
  buffer.drain(world, GAME_CONFIG.time.fixedStepSeconds, (playerId, reason) => rejected.push(reason));

  assert.deepEqual(rejected, ['stale_queue'], 'only the old queued input should be rejected as stale; the fresh one should process normally');
}

testFreshInputIsProcessed();
testStaleQueuedInputIsDiscarded();
testMixedFreshAndStaleInputsInSameDrain();
console.log('inputBufferQueue tests passed');
```

**D. 新建 `tests/reconnect.test.js`**（純邏輯，`connect`/`issueRoomJoinToken` 皆為注入的假函式，不碰真實網路）：

```js
import assert from 'node:assert/strict';

// reconnect.js 會 import roomManager.js 的 issueRoomJoinToken，roomManager.js 依賴 supabaseClient.js。
// 若直接 import roomManager 在無瀏覽器環境會失敗，這裡改用 dependency injection 的方式測試 createReconnectController 本身邏輯，
// 用 mock 模組取代 issueRoomJoinToken —— 若 reconnect.js 目前無法注入 issueRoomJoinToken，見下方「架構約束」第4點。
```

> **重要**：`reconnect.js` 目前是 `import { issueRoomJoinToken } from './roomManager.js';`（模組層級靜態依賴），`roomManager.js` 又依賴 `supabaseClient.js`。在純 Node 測試環境呼叫 `createReconnectController(...).reconnect()` 會真的嘗試呼叫 Supabase，這在測試環境會失敗或掛住。**寫測試前請先確認這件事**：
> - 如果 `getSupabaseClient`/`requireSupabaseUser` 在缺少瀏覽器/env 變數時會直接 throw（快速失敗，不會真的發網路請求掛住），可以直接測試「`reconnect()` 呼叫失敗時 `schedule()` 之後會重試、達 `maxAttempts` 呼叫 `onGiveUp`」这类不需要 `connect` 真正成功的行為。
> - 若 `getSupabaseClient` 會掛住（無限等待、無 timeout），**不要硬測 `reconnect()` 整個流程**，改成只測 `createReconnectController` 的 `schedule`/`cancel`/`maxAttempts` 計數邏輯，透過覆蓋 `connect` 為假函式、但避免真的走到 `issueRoomJoinToken`——這代表你可能需要判斷目前 `reconnect.js` 的結構是否需要把 `issueRoomJoinToken` 改成可注入參數（例如 `createReconnectController({ ..., issueToken = issueRoomJoinToken })`），若需要請一併調整並在 sync report 說明為什麼。

---

### 10. `tests/index.js`

加入：
```js
import './validation.test.js';
import './inputBufferQueue.test.js';
import './reconnect.test.js';
```

---

## 架構約束

1. `connection_epoch` 由 **host 指派**，client 不得自行產生或修改，只能原樣回傳 host 在 `AUTH_OK` 給的值。
2. `validation.js` 的 epoch 檢查優先於序號檢查（新 epoch 一律重置基準，不受舊 epoch 序號大小影響）。
3. 不要改動 `syncScheduler.js`（`sendSnapshotTo` 已經 wiring 好，不用重做）。
4. `reconnect.js` 若因為 `roomManager.js`/`supabaseClient.js` 的模組層依賴導致無法在 Node 測試環境安全測試 `reconnect()` 完整流程，允許你調整 `createReconnectController` 讓 `issueRoomJoinToken` 可被注入替換（純為了可測試性，不改變預設的實際呼叫對象），但**不要為了讓測試通過而移除任何既有的安全檢查**。
5. `peerHost.js`/`peerClient.js` 涉及真實 PeerJS WebRTC 物件，本專案至今沒有任何檔案對這兩個模組做直接單元測試（`grep` 確認過）。**不要嘗試自己發明 PeerJS mock 框架**去測試 `startPeerHost`/`startPeerClient` 整個流程——這兩個檔案用 `node --check` 語法檢查 + 仔細人工複查即可，測試重點放在 `validation.js`/`inputBuffer.js`/`reconnect.js` 這些純邏輯層。
6. **`peerHost.js` 任何清理/刪除 `peers` Map 或改動 `world.players[...].online` 的地方，都要先確認自己拿到的 session 物件身分是否仍然對應「當下這個 conn」**（`session.conn === conn`），不能只用 `conn.peer` 這個 key 查表就直接動手。這是本次任務新增「重連沿用同一個 Peer 物件」後才會出現的競態，`conn.on('close', ...)` 是目前唯一需要這個防護的地方（見檔案 3 段落 C），但如果你在實作過程中發現其他地方也有類似「用 key 查表後直接刪除/改狀態」的寫法，一併檢查是否有同樣的風險，不要假設只有一處。

---

## 版本號

以下檔案 `@version` 更新為 `v0.0.36.0`：`reconnect.js`、`peerHost.js`、`validation.js`、`inputBuffer.js`、`peerClient.js`、`netSession.js`。
`config/gameConfig.js` 的 `@version` 與 `GAME_CONFIG.version` 同步更新為 `v0.0.36.0`（canonical source，最後改，確保前面檔案都改完不出錯才升版號）。

---

## 完成標準

```
node tests/index.js   → 全通過（含既有 multiplayerInput 測試更新後、validation/inputBufferQueue/reconnect 三個新測試檔）
node --check src/net/peerHost.js
node --check src/net/peerClient.js
```
- Host 在每次 AUTH 成功（join 或 reconnect）時指派遞增的 `connection_epoch`，並在成功時把該玩家的 `world.players.get(slotId).online` 撥回 `true`。
- Client 斷線後（非主動關閉）自動排程重連，重連使用同一個 `Peer` 物件、`join_type:'reconnect'`、帶回原 `slotId`；達最大重試次數放棄並觸發 `onReconnectFailed`。
- 每筆送出的 input 都攜帶 host 指派的 `connectionEpoch`；host 端驗證時，新 epoch 重置序號基準，舊 epoch 殘留封包一律丟棄。
- `inputBuffer` 的 queue 對每筆 input 記錄 `receivedAt`（用可注入時鐘），在 host 處理 queue 中停留超過 5 秒的 input 直接丟棄，不進入驗證/套用流程。
- 若審查中發現 `reconnect.js` 目前的模組依賴讓測試不可行，需要小幅調整以支援依賴注入，請在 sync report 說明改了什麼、為什麼。
- **`conn.on('close', ...)` 已加上 `session.conn === conn` 身分比對**，重連後的新連線不會被舊連線延遲觸發的 close 事件誤殺（不會被錯誤標成 offline，也不會被 `peers.delete()` 誤刪活著的新 session）。
