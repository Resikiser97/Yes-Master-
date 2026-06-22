# 雲端基礎設施 & 成本規劃
> 狀態：Planning 階段草稿，多數金額為**粗估**，待真實流量測試後校準
> 最後更新：2026-06-21
> 對應文件：`game-architecture-plan.md`（技術架構）、`planning-dashboard.md`（進度追蹤）
> ⚠️ 本文件尚未併入上述兩份正式文件，等規劃更成熟、數字驗證過後再正式同步

---

## 前提說明（重要）

多人即時同步走 **PeerJS P2P**，不是 Supabase Realtime。
這代表 Supabase 的負擔主要來自：①帳號驗證 ②存檔資料庫讀寫 ③每30秒批次上傳的 Event Log，
不是「同時在線人數＝同時佔用連線數」這種典型即時遊戲算法 → 同樣人數下，Supabase成本會比一般即時遊戲案例低。

---

## 各服務：免費方案 vs 付費升級

| 服務 | 免費方案 | 付費升級方案 | 建議起步 |
|---|---|---|---|
| **PeerJS 訊號伺服器**（牽線用，遊戲資料本身不經過它） | Cloudflare Workers + Durable Objects（真免費，100K請求/天額度，但需自己改寫signaling server，無法直接裝PeerJS官方npm套件） | Render Starter ~$7/月 或 Fly.io ~$2~8/月（穩定、不休眠） | 先試 Cloudflare Workers 版；改寫卡關就直接付費上 Render/Fly.io，金額小不用糾結 |
| **TURN 中繼伺服器**（處理約10~20%連不上純P2P的玩家，常見於對稱型NAT/部分行動網路） | Open Relay Project（openrelay.metered.ca，每月20GB免費轉發，無SLA保證、共用基礎設施） | Cloudflare Realtime TURN（$0.05/GB按量計費，不綁定SFU單獨用也是這個價） | 先用免費額度；流量逼近20GB上限、或需要穩定性保證時轉付費。本遊戲是2D小封包(非語音視訊)，實際能撐多久要等真實流量數據 |
| **Supabase**（帳號 + 存檔資料庫） | Free（500MB資料庫／50K MAU／1GB檔案儲存／5GB egress） | Pro $25/月起（含$10運算額度／8GB資料庫／100K MAU／100GB儲存） | 同時在線100人內留Free；1000人左右建議直接升Pro（卡的是資料庫運算負擔，不是儲存空間） |
| **Vercel**（前端靜態託管） | Hobby（100GB頻寬/月／1M edge requests，條款限定僅限非商業用途） | Pro $20/人/月（1TB頻寬／10M edge requests，可商業營利） | 流量幾乎不會逼你升級；但只要做VIP月卡這種營利機制，**條款規定必須上Pro，跟流量大小無關** |

---

## 整合後總預算估計（依「同時在線人數」）

| 規模 | 全部服務加總／月 | 備註 |
|---|---|---|
| 100人同時在線 | $0 ～ 約$27 | 視 Cloudflare Workers 版PeerJS是否順利、是否已上VIP月卡而定 |
| 1000人同時在線 | 約$52 ～ $132 | Supabase建議已升Pro |
| 10000人同時在線 | 約$190 ～ $670+ | 區間寬，因為Supabase運算規格與TURN實際流量都需要實測才能校準，現在是粗估範圍 |

**升級觸發訊號**（不是單純看人數，是看這三件事）：
1. VIP月卡上線 → Vercel 條款規定必須上 Pro
2. 同時在線逼近1000人 → Supabase 資料庫運算負擔建議升 Pro
3. TURN流量逼近20GB/月 → 轉 Cloudflare TURN 按量付費

---

## 已確認的設計決策

- **Event Log 上傳方式**：房主端統一批次上傳（每30秒一次），`player_uid` 由房主根據已驗證 connection/session 補上，不採信 client payload。不影響RLS權限設計（RLS只管「誰能寫入」，欄位內容是資料設計問題）。對應上方預算估算中較省的情境。

---

## 待驗證 / 待確認清單

- [ ] Render 免費方案是否真的支援 WebSocket（目前查到的資料顯示主要在付費方案才確定支援，需要實測）
- [ ] Cloudflare Workers 自架 PeerJS signaling server 的實際改寫工作量（需要參考社群開源範例調整，非直接套用官方套件）
- [ ] TURN 伺服器實際月流量（取決於真實玩家的NAT類型分布與封包大小，需上線後監測）
- [ ] Supabase 在萬人同時在線規模時，需要加購哪一級運算規格（需要實測壓力測試才能確定，現在的$100~300+是粗估範圍）
- [ ] 總玩家數與「同時在線」之間的轉換比例（會影響 Auth MAU 額度判斷，目前缺乏真實留存率資料，估不出來）

---

## 後續動作

等以上待驗證項目有實測數據、且規劃更成熟後，提醒我把已確認的部分正式併入 `game-architecture-plan.md`（建議新增「雲端基礎設施與部署規模」章節），並同步更新 `planning-dashboard.md`。
