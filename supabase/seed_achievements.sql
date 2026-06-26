-- Seed initial achievement definitions.
-- Source: config/achievements.js, Docs/lobby-waitingroom-plan.md Phase E.

INSERT INTO achievements (id, name, description, category) VALUES
  ('first_clear', '初次守住', '首次通過任一波次。', 'progress'),
  ('wave_10_clear', '第十波防線', '通過第 10 關。', 'progress'),
  ('wave_20_clear', '第二防線', '通過第 20 關。', 'progress'),
  ('first_multiplayer', '首次並肩', '完成第一場多人遊戲。', 'social'),
  ('first_friend', '握手成盟', '新增第一位好友。', 'social'),
  ('mine_1000', '礦道熟手', '累計挖礦 1000 次。', 'mining'),
  ('build_100', '百塊工事', '累計建造 100 塊。', 'building'),
  ('repair_500', '核心修補匠', '累計修復 500 點核心生命。', 'support'),
  ('first_equipment_upgrade', '第一次強化', '完成第一次裝備升級。', 'equipment'),
  ('ranked_first_score', '榜上有名', '首次提交排行榜分數。', 'leaderboard')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;
