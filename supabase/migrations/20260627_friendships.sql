-- friendships table: 好友關係表
-- user_a = 送出邀請方，user_b = 接收方；status = 'pending' | 'accepted'
-- 所有讀取走 RLS；INSERT/UPDATE/DELETE 直接由 client 透過 anon key 觸發（角色限制在 RLS 內）

CREATE TABLE IF NOT EXISTS friendships (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'accepted')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_a, user_b)
);

-- RLS
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- SELECT: 自己是 user_a 或 user_b 才可見
CREATE POLICY "friendships_select" ON friendships
  FOR SELECT USING (
    auth.uid() = user_a OR auth.uid() = user_b
  );

-- INSERT: 只能以自己為 user_a（sender）送出邀請
CREATE POLICY "friendships_insert" ON friendships
  FOR INSERT WITH CHECK (
    auth.uid() = user_a
  );

-- UPDATE: 只有 user_b（接收方）可以更新（接受邀請）
CREATE POLICY "friendships_update" ON friendships
  FOR UPDATE USING (
    auth.uid() = user_b
  ) WITH CHECK (
    auth.uid() = user_b
  );

-- DELETE: user_a 或 user_b 都可以刪（取消 / 拒絕 / 解除好友）
CREATE POLICY "friendships_delete" ON friendships
  FOR DELETE USING (
    auth.uid() = user_a OR auth.uid() = user_b
  );
