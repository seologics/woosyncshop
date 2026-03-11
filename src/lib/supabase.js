import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://pwrtuqybtvgiiyghqxiw.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cnR1cXlidHZnaWl5Z2hxeGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NDM4NTIsImV4cCI6MjA4ODQxOTg1Mn0.hghy63YrDUixzGbdUu5-gF2-OPOGIuQ66zxhNzu_q3Y'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  }
})

// ─── Module-level token cache ─────────────────────────────────────────────────
// Updated by onAuthStateChange in App.jsx the moment a session changes.
// getToken() never hangs: it returns the cached value immediately, or falls back
// to getSession() with a 3-second timeout. This eliminates all "stuck loading"
// states caused by getSession() hanging during token refresh.
let _cachedToken = null

export const setCachedToken = (token) => { _cachedToken = token }

// Read token directly from localStorage — bypasses Supabase's IndexedDB lock.
// Key fix for alt-tab freeze: when Supabase is mid-refresh and holds the lock,
// we can still get a valid token from storage instantly (no await needed).
function getTokenFromStorage() {
  try {
    const raw = localStorage.getItem('sb-pwrtuqybtvgiiyghqxiw-auth-token')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.access_token || null
  } catch { return null }
}

export const getToken = async () => {
  // 1. In-memory cache (hot path — zero I/O)
  if (_cachedToken) return _cachedToken

  // 2. localStorage — instant, no lock, works even while Supabase is mid-refresh
  const storageToken = getTokenFromStorage()
  if (storageToken) { _cachedToken = storageToken; return storageToken }

  // 3. Fall back to getSession() with 3-second timeout
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('getSession timeout')), 3000)),
    ])
    const token = result?.data?.session?.access_token || null
    if (token) _cachedToken = token
    return token
  } catch {
    // 4. Last resort: re-read storage (may have just been written by the refresh)
    return getTokenFromStorage()
  }
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
export const signUp = async (email, password, options = {}) => {
  const { data, error } = await supabase.auth.signUp({ email, password, ...options })
  if (error) throw error
  return data
}

export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export const signOut = async () => {
  _cachedToken = null
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export const getUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export const getShops = async (userId) => {
  const { data, error } = await supabase
    .from('shops')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export const upsertShop = async (shop) => {
  const { data, error } = await supabase
    .from('shops')
    .upsert(shop)
    .select()
    .single()
  if (error) throw error
  return data
}

export const deleteShop = async (shopId) => {
  const { error } = await supabase.from('shops').delete().eq('id', shopId)
  if (error) throw error
}

export const getUserProfile = async (userId) => {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export const updateUserProfile = async (userId, updates) => {
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({ id: userId, ...updates })
    .select()
    .single()
  if (error) throw error
  return data
}
