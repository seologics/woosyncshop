import { createClient } from '@supabase/supabase-js'

// Anon key is intentionally public — safe to expose (protected by RLS)
// Service role key stays server-side in Netlify env vars only
const supabaseUrl = 'https://pwrtuqybtvgiiyghqxiw.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cnR1cXlidHZnaWl5Z2hxeGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NDM4NTIsImV4cCI6MjA4ODQxOTg1Mn0.hghy63YrDUixzGbdUu5-gF2-OPOGIuQ66zxhNzu_q3Y'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
