import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { token } = await req.json();
    if (!token) return new Response(JSON.stringify({ error: "missing token" }), { status: 400, headers: corsHeaders });

    // Decode token
    let parsed: { payload: any; sig: string };
    try {
      parsed = JSON.parse(atob(token));
    } catch {
      return new Response(JSON.stringify({ error: "invalid token format" }), { status: 400, headers: corsHeaders });
    }

    const { payload, sig } = parsed;

    // Verify HMAC signature
    const secret = Deno.env.get("ROOM_TOKEN_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const sigBytes = new Uint8Array(sig.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(JSON.stringify(payload)));
    if (!valid) return new Response(JSON.stringify({ error: "invalid signature" }), { status: 403, headers: corsHeaders });

    // Check expiry
    if (Date.now() > payload.exp) return new Response(JSON.stringify({ error: "token expired" }), { status: 403, headers: corsHeaders });

    // Atomically consume nonce — update consumed_at from null to now
    const { data: nonceRow, error: nonceErr } = await supabase
      .from("consumed_nonces")
      .update({ consumed_at: new Date().toISOString() })
      .eq("nonce", payload.nonce)
      .is("consumed_at", null)
      .select()
      .single();

    if (nonceErr || !nonceRow) return new Response(JSON.stringify({ error: "nonce already consumed or not found" }), { status: 403, headers: corsHeaders });

    // Check room is still active
    const { data: room } = await supabase
      .from("rooms").select("status").eq("room_id", payload.room_id).single();
    if (!room || room.status !== "active") return new Response(JSON.stringify({ error: "room inactive" }), { status: 404, headers: corsHeaders });

    // Check player not kicked (membership exists)
    const { data: member } = await supabase
      .from("room_memberships").select("slot_id").eq("room_id", payload.room_id).eq("user_id", payload.uid).single();
    if (!member) return new Response(JSON.stringify({ error: "not a member" }), { status: 403, headers: corsHeaders });

    return new Response(JSON.stringify({
      verified: true,
      uid: payload.uid,
      room_id: payload.room_id,
      slot_id: payload.slot_id,
      join_type: payload.join_type,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
