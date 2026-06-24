# icon-status.md — 圖示素材追蹤表

> 最後更新：2026-06-24
> 用途：追蹤每一張素材的狀態（命名後、裁剪後、整合後）
> 方塊 spritesheet 直接由程式碼 `drawImage + getFrameRect()` 讀取，不需要另外裁剪個別 PNG

---

## 狀態圖例

✅ 已整合進遊戲  |  ✅ 已裁剪可用  |  🔲 原始圖已有，待整合/裁剪  |  ⏸ 原始圖已有，暫緩處理  |  ❌ 尚未製作

---

## 方塊圖示（快捷列 hotbar 用）

> 來源：`spritesheet_blocks_9tiles_hotbar.png`（由原始 noframe sheet 去背、置中、正方格重打包，index 0~8）
> 程式碼：`config/sprites.js` `SPRITE_SHEETS.blocksNoFrame` + `getFrameRect()`

| index | blockKey | 中文名 | 狀態 | 備註 |
|---|---|---|---|---|
| 0 | sand | 沙塊 | ✅ | 快捷列 slot 1 |
| 1 | dirt | 土塊 | ✅ | 快捷列 slot 2 |
| 2 | stone | 石塊 | ✅ | 快捷列 slot 3 |
| 3 | iron | 鐵塊 | ✅ | 快捷列 slot 4 |
| 4 | gold | 金塊 | ✅ | 快捷列 slot 5 |
| 5 | glass | 琉璃塊 | ✅ | 快捷列 slot 6 |
| 6 | diamond | 鑽塊 | ✅ | 快捷列 slot 7 |
| 7 | ladder | 梯子 | ⏸ | 非 hotbar 材料，暫不顯示 |
| 8 | hollow | 挖空格 | ⏸ | 非 hotbar 材料，暫不顯示 |

> 原始 `spritesheet_blocks_9tiles_noframe.png` 保留作素材來源；其假透明棋盤格已烤進 PNG，不再直接給 hotbar 使用。

---

## 方塊圖示（槽框版，備用）

> 來源：`spritesheet_blocks_9tiles_slotframe.png`（與上同順序，帶木質槽框）
> 可作為「已選中 slot」的背景圖，目前以金色邊框替代，暫緩使用

| 狀態 | 備註 |
|---|---|
| ⏸ | 待評估是否整合為 hotbar 選中背景 |

---

## 敵人 Spritesheet（已裁剪）

> 來源：`spritesheet_enemies_shield-muscle-leader_3row4col.png`
> 裁剪輸出目錄：`assets/enemies/`
> Codex 任務：Python PIL 裁成 3×4 幀，已輸出獨立 PNG；後續仍可接敵人動畫。

| row | 敵人 | 中文名 | 幀數 | 狀態 | 輸出檔名 |
|---|---|---|---|---|---|
| 0 | shield | 盾兵 | 4 | ✅ | `shield_walk_f0~f3.png` |
| 1 | muscle | 猛男 | 4 | ✅ | `muscle_walk_f0~f3.png` |
| 2 | leader | 小隊長 | 4 | ✅ | `leader_walk_f0~f3.png` |

> 來源：`spritesheet_enemy_civilian_2x2_walk.png`

| 敵人 | 中文名 | 幀數 | 狀態 | 輸出檔名 |
|---|---|---|---|---|
| civilian | 平民 | 4 | ✅ | `civilian_walk_f0~f3.png` |

---

## 角色 Spritesheet（已裁剪）

> 來源：`spritesheet_goblin_3row4col_walk-walk-mine.png`
> 裁剪輸出目錄：`assets/characters/goblin/`

| row | 動作 | 幀數 | 狀態 | 輸出檔名 |
|---|---|---|---|---|
| 0 | 走路（朝右） | 4 | ✅ | `goblin_walk_right_f0~f3.png` |
| 1 | 走路（朝左） | 4 | ✅ | `goblin_walk_left_f0~f3.png` |
| 2 | 挖礦 | 4 | ✅ | `goblin_mine_f0~f3.png` |

---

## 核心 Spritesheet（已裁剪）

> 來源：`spritesheet_core_orb_3row4col_normal-hit-lowhp.png`
> 裁剪輸出目錄：`assets/core/`

| row | 狀態 | 幀數 | 狀態(整合) | 輸出檔名 |
|---|---|---|---|---|
| 0 | 藍色・正常 | 4 | ✅ | `core_normal_f0~f3.png` |
| 1 | 紅色・受擊 | 4 | ✅ | `core_hit_f0~f3.png` |
| 2 | 紫色・低血量 | 4 | ✅ | `core_lowhp_f0~f3.png` |

---

## UI 圖示（已裁剪）

> 來源：`spritesheet_ui_icons_12pack_4x3grid.png`（4 欄 × 3 列 = 12 圖示）
> 裁剪輸出目錄：`assets/ui/`

| 位置 | 圖示名 | 狀態 | 輸出檔名 |
|---|---|---|---|
| row0 col0 | 金幣 | ✅ | `icon_gold-coin.png` |
| row0 col1 | 銀幣 | ✅ | `icon_silver-coin.png` |
| row0 col2 | 鑽石 | ✅ | `icon_diamond-gem.png` |
| row0 col3 | 票券 | ✅ | `icon_ticket.png` |
| row1 col0 | 設定齒輪 | ✅ | `icon_settings-gear.png` |
| row1 col1 | 獎盃 | ✅ | `icon_trophy.png` |
| row1 col2 | 握手 | ✅ | `icon_handshake.png` |
| row1 col3 | 背包 | ✅ | `icon_backpack.png` |
| row2 col0 | 空槽框 | ✅ | `icon_slot-empty.png` |
| row2 col1 | 選中槽框 | ✅ | `icon_slot-selected.png` |
| row2 col2 | 皇冠 | ✅ | `icon_crown.png` |
| row2 col3 | 紅點通知 | ✅ | `icon_red-dot.png` |

---

## 背景類

| 檔名 | 用途 | 狀態 |
|---|---|---|
| `bg_outdoor_daytime.png` | 白天戶外背景（Terraria 風） | ⏸ |
| `bg_outdoor_night.png` | 夜晚戶外背景（星空月亮） | ⏸ |
| `bg_mine_cave_deep.png` | 礦洞深層俯瞰場景 | ⏸ |
| `bg_mine_interior_sideview.png` | 礦坑室內側視（木架+礦車） | ⏸ |

---

## UI 設計稿（參考用，不整合進遊戲）

| 檔名 | 用途 |
|---|---|
| `ui_screen_defeat_mockup.png` | 遊戲失敗結算畫面設計稿 |
| `ui_screen_settlement_mockup.png` | 主動結算（Settlement）畫面設計稿 |

---

## Codex 裁剪任務清單

詳細指令見 `Docs/claude-codex-worklist.md` → 「Codex Task: Spritesheet 裁剪」條目；已完成 52 張 PNG 輸出。

優先順序（建議）：
1. `spritesheet_ui_icons_12pack_4x3grid.png` → HUD 圖示整合用
2. `spritesheet_enemies_*` → 敵人動畫整合用
3. `spritesheet_goblin_*` → 玩家動畫整合用
4. `spritesheet_core_orb_*` → 核心受擊動畫整合用
