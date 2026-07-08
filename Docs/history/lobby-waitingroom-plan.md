# Lobby + Waiting Room 完整實作計劃

> 對應 worklist M0 | 最後更新：2026-06-26
> 範圍：全功能實作（含所有前置系統）

## Context

目前進多人模式需手動 URL 參數，無任何 UI。需按 `game-design-plan.md` 房間系統章節 + wireframe（`Docs/roomlist.png`、`Docs/waiting room.png`）+ Art Bible 風格完整實作。

## 前置系統依賴圖

```
正式帳號系統（email/OAuth）
  └→ 玩家 Profile DB（暱稱、等級、經驗值）
       ├→ 等級系統（經驗值計算、升級）
       ├→ 好友系統（好友關係表、加好友/刪好友）
       ├→ 裝備系統（五項裝備等級）
       ├→ 成就系統（成就定義表、達成記錄）
       └→ 排行榜（賽季排名、稱號）
              └→ 房間系統 UI（Lobby + Waiting Room）
```

---

## Phase A: 正式帳號系統

### A1. Supabase Auth 升級
- 開啟 Email Auth provider（Dashboard → Authentication → Providers → Email）
- 可選：開啟 Google/Discord OAuth
- 保留 Anonymous Auth 作為「訪客模式」

### A2. 玩家 Profile 表

```sql
CREATE TABLE player_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Goblin',
  avatar_id TEXT DEFAULT 'default',
  level INT DEFAULT 1,
  exp INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE player_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON player_profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON player_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "profiles_insert" ON player_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
```

### A3. 登入/註冊 UI
- 新增 `src/ui/authScreen.js`
- Splash 之前或之後顯示（如果未登入）
- 選項：Email 登入/註冊、訪客模式（Anonymous）
- 登入後自動建立 profile（如果不存在）

### A4. 新增檔案
- `src/net/authManager.js` — signUp, signIn, signOut, getCurrentUser, getProfile, updateProfile
- `src/ui/authScreen.js` — 登入/註冊 UI overlay

---

## Phase B: 等級系統

### B1. 經驗值規則
- 定義升級經驗值曲線（建議：`expToNextLevel = level * 100`）
- 經驗來源：完成波次、挖礦量、建造量（詳細數值待定）
- 存入 `player_profiles.exp` + `player_profiles.level`

### B2. 新增檔案
- `src/game/levelSystem.js` — `calcLevel(exp)`, `expForLevel(lv)`, `addExp(profile, amount)`
- `config/levelConfig.js` — 經驗值曲線、每級所需 exp

### B3. 遊戲結算時寫回
- 修改 `src/game/phaseRuntime.js` 或 `src/main.js` — wave clear 時計算獲得經驗，呼叫 Supabase 更新 profile

---

## Phase C: 好友系統

### C1. DB Schema

```sql
CREATE TABLE friendships (
  user_a UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_a, user_b)
);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "friends_select" ON friendships FOR SELECT 
  USING (auth.uid() = user_a OR auth.uid() = user_b);
CREATE POLICY "friends_insert" ON friendships FOR INSERT 
  WITH CHECK (auth.uid() = user_a);
CREATE POLICY "friends_update" ON friendships FOR UPDATE 
  USING (auth.uid() = user_a OR auth.uid() = user_b);
```

### C2. Edge Functions
- `send-friend-request` — 建立 pending 好友關係
- `accept-friend-request` — 更新為 accepted
- `remove-friend` — 刪除關係

### C3. 新增檔案
- `src/net/friendManager.js` — sendRequest, acceptRequest, removeFriend, listFriends, listPending

---

## Phase D: 裝備系統

### D1. DB Schema

```sql
CREATE TABLE player_equipment (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mining_level INT DEFAULT 0,
  fatigue_level INT DEFAULT 0,
  spirit_level INT DEFAULT 0,
  carry_level INT DEFAULT 0,
  repair_level INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE player_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equip_select" ON player_equipment FOR SELECT USING (true);
CREATE POLICY "equip_update" ON player_equipment FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "equip_insert" ON player_equipment FOR INSERT WITH CHECK (auth.uid() = user_id);
```

### D2. 裝備升級規則
- 待定：用什麼資源升級、每級加成多少
- config 定義在 `config/equipmentConfig.js`

### D3. 新增檔案
- `src/game/equipmentSystem.js` — getEquipment, upgradeEquipment, applyEquipBonus
- `config/equipmentConfig.js` — 升級所需資源、每級加成

---

## Phase E: 成就系統

### E1. DB Schema

```sql
CREATE TABLE achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general'
);

CREATE TABLE player_achievements (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT REFERENCES achievements(id),
  unlocked_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

ALTER TABLE player_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pa_select" ON player_achievements FOR SELECT USING (true);
CREATE POLICY "pa_insert" ON player_achievements FOR INSERT WITH CHECK (auth.uid() = user_id);
```

### E2. 成就定義
- 定義在 `config/achievements.js`（ID、名稱、描述、解鎖條件）
- 初版可先做 5-10 個基礎成就（首次通關、首次建造、首次多人等）

### E3. 新增檔案
- `src/game/achievementSystem.js` — checkAchievements, unlockAchievement
- `config/achievements.js` — 成就清單定義

---

## Phase F: 排行榜 + 賽季稱號

### F1. DB Schema

```sql
CREATE TABLE leaderboard (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  score INT DEFAULT 0,
  highest_wave INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, season)
);

ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lb_select" ON leaderboard FOR SELECT USING (true);
CREATE POLICY "lb_upsert" ON leaderboard FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "lb_update" ON leaderboard FOR UPDATE USING (auth.uid() = user_id);
```

### F2. 賽季稱號規則
- 依排名百分比給稱號（例：Top 10% = 金冠、Top 30% = 銀冠）
- 定義在 `config/seasonConfig.js`

### F3. 新增檔案
- `src/game/leaderboardSystem.js` — submitScore, getLeaderboard, getPlayerRank
- `config/seasonConfig.js` — 賽季定義、稱號門檻

---

## Phase G: 房間系統 DB 補強

### G1. rooms 表補欄位

```sql
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Room';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS password TEXT DEFAULT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS max_players INT DEFAULT 4;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS min_level INT DEFAULT 0;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'normal';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public' 
  CHECK (visibility IN ('public', 'private', 'friends'));
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS game_started BOOLEAN DEFAULT false;
```

### G2. room_memberships 補欄位

```sql
ALTER TABLE room_memberships ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT 'Goblin';
ALTER TABLE room_memberships ADD COLUMN IF NOT EXISTS player_level INT DEFAULT 1;
ALTER TABLE room_memberships ADD COLUMN IF NOT EXISTS online BOOLEAN DEFAULT true;
ALTER TABLE room_memberships ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ DEFAULT NULL;
```

### G3. Edge Functions 更新
- `create-room` — 支援 name, password, max_players, min_level, difficulty, visibility
- `join-room` — 檢查密碼、等級限制、人數上限
- `kick-player` — 房主踢人（從 membership 移除或標記 kicked）

---

## Phase H: Lobby UI（房間列表）

### 參照：`Docs/roomlist.png` + `game-design-plan.md`

### 版面配置
- **全螢幕 overlay**，黑底 `#000`，Art Bible 風格
- **左側 3 個 tab**：
  - 「公開」— 列出所有 `visibility='public'` 的房間
  - 「朋友」— 列出好友建的房間（JOIN friendships + rooms）
  - 「房間號碼」— 輸入框 + 密碼框，直接用 ID 加入
- **中央主面板**：房間列表（scrollable）
  - 每個房間卡片：人數（N/M）、房主名字、等級限制、難度
  - 點擊 → 確認 popup →「是否加入？」
  - 房間已滿 → 提示
- **左下**：「建立房間」按鈕
  - 彈出建房 popup：房間名稱、密碼（optional）、人數、等級限制、難度
- **右上**：X 返回按鈕 → 回 Splash
- **Polling**：每 3 秒刷新房間列表

### 視覺風格
- 配色：黑底 + 金色 `#D4A017` 文字/邊框（同 Splash）
- 像素風邊框（可用 CSS box-shadow 模擬 pixel border）
- 哥布林配色：綠/棕/銅黃 accent
- 按鈕：hover 微亮 `rgba(212,160,23,0.12)`

### 新增檔案
- `src/ui/lobby.js` — `showLobby(inputMode, onStart)`

---

## Phase I: Waiting Room UI

### 參照：`Docs/waiting room.png` + `game-design-plan.md`

### 版面配置
- **全螢幕 overlay**
- **上方**：玩家 slot 卡片（依建房人數顯示 2~4 格）
  - 每張卡片：
    - 頭像圓圈（上方，大）
    - 皇冠 icon（if 房主）
    - 稱號1：賽季排名稱號
    - 稱號2：成就稱號
    - 紅色框：玩家等級
    - 三個操作圓：
      - 🔵 藍色：查看角色面板（彈出六數值+五裝備等級）
      - 🟢 綠色：加好友
      - 🔴 紅色：踢出（僅房主可見）
  - 空位卡片：顯示「等待加入…」
- **下方**：聊天室
  - 訊息區（scrollable，棕色邊框 — Art Bible 的棕/皮革色）
  - 輸入欄 + 表情按鈕 + Enter 送出
- **右下**：紅色「退出」按鈕
- **Host 專屬**：「開始遊戲」按鈕（至少 2 人才可按，或單人也可按）

### 聊天系統
- 透過 PeerJS data channel 發送（host relay 給所有人）
- 訊息格式：`{ type: 'CHAT', from: displayName, text: '...' }`
- 加入 `src/net/protocol.js` 的 MSG enum
- 表情符號：預設 8-12 個 emoji 快捷（😀👍❤️🔥⚔️🛡️💎⛏️）

### 角色面板 Popup
- 點藍色圓彈出
- 顯示：挖掘/疲勞/靈動/背負/修復/移動速度 六數值
- 顯示：五項裝備等級
- 資料來源：`player_profiles` + `player_equipment`

### 開始遊戲流程
1. Host 按「開始遊戲」
2. 更新 DB `rooms.game_started = true`
3. Host 透過 PeerJS 廣播 `{ type: 'GAME_START', cfg }` 給所有 client
4. Client 收到後 + polling 到 `game_started = true` → 雙重確認
5. 所有人呼叫 `onStart(diffMode, inputMode, netInfo)` → Waiting Room 淡出 → 遊戲啟動

### 新增檔案
- `src/ui/waitingRoom.js` — `showWaitingRoom({ roomId, roomName, role, inputMode, onStart, onBack })`
- `src/ui/chatPanel.js` — 聊天 UI component（可被 waitingRoom 和未來遊戲內 chat 共用）
- `src/ui/playerCard.js` — 玩家 slot 卡片 component
- `src/ui/characterPopup.js` — 角色面板彈窗

---

## Phase J: 整合 main.js

### 修改 `src/ui/splash.js`
- 難度按鈕列加第三個：「多人模式」
- 點擊後 → `showLobby(inputMode, onStart)` 取代直接 `onStart()`

### 修改 `src/main.js`
- `onStart` callback 接受第三參數 `netInfo`
- 如果有 `netInfo` → 設定 `cfg.mode = 'multi'`，用 `netInfo.roomId` 和 `netInfo.role`
- 保留 URL 參數 `parseNetLaunch()` 作為 debug 後門

### 修改 `src/net/protocol.js`
- 加入 `CHAT`, `GAME_START`, `KICK`, `PLAYER_INFO` 訊息類型

### 修改 `src/net/roomManager.js`
- `getRoomMembers(room_id)` — 查成員列表
- `kickPlayer(room_id, user_id)` — 踢人
- `updateRoomSettings(room_id, settings)` — 更新房間設定

---

## 實作順序

```
Phase A (帳號) → Phase B (等級) → Phase C (好友) → Phase D (裝備) → Phase E (成就) → Phase F (排行榜)
                                                                                         ↓
Phase G (房間DB補強) → Phase H (Lobby UI) → Phase I (Waiting Room UI) → Phase J (整合 main.js)
```

**建議分工：**
- **Claude**：Phase A (帳號 + Auth UI)、Phase G-J (Lobby/WaitingRoom UI + 整合)
- **Codex**：Phase B-F (等級/好友/裝備/成就/排行榜 — DB schema + 純邏輯)

---

## 驗收標準

1. 可用 Email 註冊/登入，也可訪客模式
2. Splash → 「多人模式」→ Lobby 顯示房間列表
3. 建房時可設定名稱/密碼/人數/等級限制/難度
4. 房間列表按「公開/朋友/房間號碼」三個 tab 篩選
5. 加入房間 → Waiting Room 顯示玩家卡片（等級、稱號、頭像）
6. 聊天室可發文字 + 表情
7. 藍色圓查看角色面板（六數值+五裝備）
8. 綠色圓加好友
9. 紅色圓踢人（僅房主可見可用）
10. Host 按「開始遊戲」→ 全員進入遊戲
11. 退出 → 回 Lobby → 回 Splash
12. 單人模式完全不受影響
13. 手機觸控模式 UI 正常（responsive）
