-- Fix infinite recursion in room_memberships RLS policy (20260627_rls_policies.sql).
--
-- 根因：原本的 "memberships_select_own_or_same_room" policy 在自己的 USING 子句裡，
-- 直接 SELECT room_memberships（同一張表）來查「目前使用者屬於哪些房間」。
-- Postgres 在評估這個 policy 時，subquery 對 room_memberships 的存取一樣會觸發同一條
-- RLS policy 再次評估，形成無限遞迴 → Postgres 丟出
-- "infinite recursion detected in policy for relation room_memberships"，
-- PostgREST 把這個內部錯誤原樣轉成 HTTP 500。
--
-- 影響範圍：任何呼叫 getRoomMembers()（waitingRoom.js 用來列出房間成員）的地方都會 500，
-- 等於整個等待房間功能自 20260627 上線 RLS 之後就是壞的，不是本次 T24 測試才發生。
--
-- 修法：把「目前使用者屬於哪些房間」的查詢移進一個 SECURITY DEFINER function。
-- SECURITY DEFINER function 內部查詢用 function owner 的權限執行，不會再觸發呼叫者
-- 這邊的 RLS policy，因此打斷遞迴。policy 本身改成呼叫這個 function，不再直接查表。
--
-- 執行前提醒：下面假設 room_memberships.room_id 是 uuid 型別（對齊
-- src/net/roomManager.js 用 crypto.randomUUID() 產生 room_id 的做法）。
-- 如果你的實際 schema 是 text/varchar，把 `uuid` 換成正確型別即可，
-- 其餘邏輯不受影響。

CREATE OR REPLACE FUNCTION my_room_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT room_id FROM room_memberships WHERE user_id = auth.uid();
$$;

-- 明確收回 public 執行權限，只開放給 authenticated（跟其他 policy 的角色範圍一致）
REVOKE ALL ON FUNCTION my_room_ids() FROM public;
GRANT EXECUTE ON FUNCTION my_room_ids() TO authenticated;

DROP POLICY IF EXISTS "memberships_select_own_or_same_room" ON room_memberships;
CREATE POLICY "memberships_select_own_or_same_room" ON room_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR room_id IN (SELECT my_room_ids())
  );
