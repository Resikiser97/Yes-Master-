/**
 * @file        authManager.js
 * @module      net
 * @summary     Authentication helpers: Google OAuth, anonymous sign-in, profile management
 * @exports     signInWithGoogle, signInAnonymously, signOut, getCurrentUser, getProfile, ensureProfile
 * @depends     src/net/supabaseClient.js
 * @version     v0.0.14.0
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { getSupabaseClient } from './supabaseClient.js';

export async function signInWithGoogle(cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw error;
  return data;
}

export async function signInAnonymously(cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}

export async function signOut(cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser(cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

export async function onAuthStateChange(callback, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return data.subscription;
}

export async function getProfile(userId, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const { data, error } = await supabase
    .from('player_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function ensureProfile(user, cfg = GAME_CONFIG) {
  const existing = await getProfile(user.id, cfg);
  if (existing) return existing;

  const displayName = user.user_metadata?.full_name
    || user.user_metadata?.name
    || user.email?.split('@')[0]
    || 'Goblin';
  const avatarId = user.user_metadata?.avatar_url || 'default';

  const supabase = await getSupabaseClient(cfg);
  const { data, error } = await supabase
    .from('player_profiles')
    .insert({ user_id: user.id, display_name: displayName, avatar_id: avatarId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProfile(updates, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const user = await getCurrentUser(cfg);
  if (!user) throw new Error('not signed in');
  const { data, error } = await supabase
    .from('player_profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
