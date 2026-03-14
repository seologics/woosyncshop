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

// Single in-flight getSession() promise — prevents concurrent calls fighting over IndexedDB lock
let _sessionPromise = null

export const getToken = () => {
  if (_cachedToken) return Promise.resolve(_cachedToken)
  // Reuse an in-flight getSession() if one is already running
  if (_sessionPromise) return _sessionPromise
  _sessionPromise = new Promise((resolve) => {
    const timer = setTimeout(() => { _sessionPromise = null; resolve(null) }, 3000)
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timer)
        _sessionPromise = null
        _cachedToken = session?.access_token || null
        resolve(_cachedToken)
      })
      .catch(() => { clearTimeout(timer); _sessionPromise = null; resolve(null) })
  })
  return _sessionPromise
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
  // Don't let supabase.auth.signOut() hang if it can't acquire the IndexedDB lock
  // (happens right after alt-tab when the token refresher holds the lock).
  // We clear the token cache above, so the app will treat the user as logged out
  // regardless of whether the Supabase call completes.
  try {
    await Promise.race([
      supabase.auth.signOut(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('signOut timeout')), 2000)),
    ])
  } catch {
    // Intentionally ignored — local state already cleared above
  }
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
