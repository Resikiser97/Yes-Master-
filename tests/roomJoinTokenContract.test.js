import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('supabase/functions/issue-room-join-token/index.ts', 'utf8');

assert.match(source, /join_type !== "join" && join_type !== "reconnect"/);
assert.match(source, /const tokenSlotId = join_type === "reconnect" \? member\.slot_id : null/);
assert.match(source, /slot_id: tokenSlotId/);

console.log('room join token contract tests passed');
