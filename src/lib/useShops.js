import { useState, useEffect } from 'react'
import { getShops, upsertShop, deleteShop, supabase } from './supabase.js'

export function useShops(userId) {
  const [shops, setShops] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!userId) return
    load()
  }, [userId])

  const load = async () => {
    try {
      setLoading(true)
      const data = await getShops(userId)
      setShops(data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const addShop = async (shopData) => {
    const shop = await upsertShop({ ...shopData, user_id: userId })
    setShops(s => [...s, shop])
    return shop
  }

  const updateShop = async (id, updates) => {
    const shop = await upsertShop({ id, user_id: userId, ...updates })
    setShops(s => s.map(x => x.id === id ? shop : x))
    return shop
  }

  const removeShop = async (id) => {
    await deleteShop(id)
    setShops(s => s.filter(x => x.id !== id))
  }

  const testConnection = async (shopId) => {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    if (!token) throw new Error('Not authenticated')

    const shop = shops.find(s => s.id === shopId)
    if (!shop) throw new Error('Shop not found')

    const res = await fetch('/api/woo-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        site_url: shop.site_url,
        consumer_key: shop.consumer_key,
        consumer_secret: shop.consumer_secret,
      })
    })
    return await res.json()
  }

  return { shops, loading, error, addShop, updateShop, removeShop, testConnection, reload: load }
}

export async function wooCall(shopId, endpoint, method = 'GET', data = null) {
  const session = await supabase.auth.getSession()
  const token = session.data.session?.access_token
  if (!token) throw new Error('Not authenticated')

  const res = await fetch('/api/woo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ shop_id: shopId, endpoint, method, data })
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || `HTTP ${res.status}`)
  }

  return await res.json()
}
