/**
 * @file        authManager.js
 * @module      net
 * @summary     Authentication helpers: Google OAuth, anonymous sign-in, profile management
 * @exports     signInWithGoogle, signInAnonymously, signOut, getCurrentUser, onAuthStateChange, getProfile, ensureProfile, updateProfile
 * @depends     src/net/supabaseClient.js
 * @version     v0.0.20.0
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { getSupabaseClient } from './supabaseClient.js';

const profilePromises = new Map();

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
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function ensureProfile(user, cfg = GAME_CONFIG) {
  if (!user?.id) throw new Error('missing user');
  if (!profilePromises.has(user.id)) {
    profilePromises.set(user.id, ensureProfileOnce(user, cfg).finally(() => {
      profilePromises.delete(user.id);
    }));
  }
  return profilePromises.get(user.id);
}

async function ensureProfileOnce(user, cfg) {
  const existing = await getProfile(user.id, cfg);
  const googleProfile = buildGoogleProfilePatch(user);
  if (existing) {
    if (shouldRefreshProfile(existing, googleProfile, user)) {
      return updateProfileForUser(user.id, googleProfile, cfg);
    }
    return existing;
  }

  const displayName = googleProfile.display_name || user.email?.split('@')[0] || 'Goblin';
  const avatarId = googleProfile.avatar_id || 'default';

  const supabase = await getSupabaseClient(cfg);
  const { data, error } = await supabase
    .from('player_profiles')
    .insert({ user_id: user.id, display_name: displayName, avatar_id: avatarId })
    .select()
    .single();
  if (error?.code === '23505') return getProfile(user.id, cfg);
  if (error) throw error;
  return data;
}

function buildGoogleProfilePatch(user) {
  if (user?.app_metadata?.provider !== 'google' || user?.is_anonymous) return {};
  return {
    display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || null,
    avatar_id: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
  };
}

function shouldRefreshProfile(profile, patch, user) {
  if (!patch.display_name && !patch.avatar_id) return false;
  if (user?.is_anonymous) return false;
  const hasDefaultName = !profile?.display_name || profile.display_name === 'Goblin';
  const hasDefaultAvatar = !profile?.avatar_id || profile.avatar_id === 'default';
  return hasDefaultName || hasDefaultAvatar;
}

async function updateProfileForUser(userId, patch, cfg) {
  const supabase = await getSupabaseClient(cfg);
  const payload = Object.fromEntries(
    Object.entries({
      display_name: patch.display_name,
      avatar_id: patch.avatar_id,
      updated_at: new Date().toISOString(),
    }).filter(([, value]) => value)
  );
  const { data, error } = await supabase
    .from('player_profiles')
    .update(payload)
    .eq('user_id', userId)
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
