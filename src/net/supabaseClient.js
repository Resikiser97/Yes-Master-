/**
 * @file supabaseClient.js
 * @module net
 * @summary Lazy Supabase browser client. Kept dynamic so Node smoke tests never import https: modules.
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';

let clientPromise = null;

export async function getSupabaseClient(cfg = GAME_CONFIG) {
  if (typeof window === 'undefined') {
    throw new Error('Supabase client is only available in the browser');
  }
  if (!clientPromise) {
    clientPromise = import('https://esm.sh/@supabase/supabase-js@2').then(({ createClient }) => {
      const { supabaseUrl, supabaseAnonKey } = cfg.net ?? {};
      if (!supabaseUrl || !supabaseAnonKey) throw new Error('missing Supabase config');
      return createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    });
  }
  return clientPromise;
}

export async function ensureSupabaseUser(cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const current = await supabase.auth.getUser();
  if (current.data?.user) return current.data.user;
  const signedIn = await supabase.auth.signInAnonymously();
  if (signedIn.error) throw signedIn.error;
  return signedIn.data.user;
}
