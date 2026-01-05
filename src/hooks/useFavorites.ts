import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'

const FAVORITES_KEY = 'scenario_favorites'

export function useFavorites() {
  const { user } = useAuth()
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_KEY)
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // 顧客IDを取得（なければ作成）
  useEffect(() => {
    const fetchOrCreateCustomer = async () => {
      console.log('[useFavorites] fetchOrCreateCustomer called, user:', user?.id, user?.email)
      if (!user?.id || !user?.email) {
        console.log('[useFavorites] No user, skipping')
        setCustomerId(null)
        return
      }

      try {
        // まず既存の顧客を検索（user_idで検索）
        console.log('[useFavorites] Looking for customer with user_id:', user.id)
        const { data: customer, error: selectError } = await supabase
          .from('customers')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()

        console.log('[useFavorites] Customer search result:', customer, 'error:', selectError)

        if (customer?.id) {
          console.log('[useFavorites] Found existing customer:', customer.id)
          setCustomerId(customer.id)
          return
        }

        // 顧客が存在しない場合、作成する
        console.log('[useFavorites] Creating customer record for:', user.email)
        const { data: newCustomer, error: insertError } = await supabase
          .from('customers')
          .insert({
            email: user.email,
            name: user.name || user.email.split('@')[0],
            user_id: user.id,
          })
          .select('id')
          .single()

        console.log('[useFavorites] Insert result:', newCustomer, 'error:', insertError)

        if (insertError) {
          // 重複エラーの場合は再取得
          if (insertError.code === '23505') {
            console.log('[useFavorites] Duplicate error, re-fetching')
            const { data: existingCustomer } = await supabase
              .from('customers')
              .select('id')
              .eq('user_id', user.id)
              .single()
            setCustomerId(existingCustomer?.id || null)
          } else {
            throw insertError
          }
        } else {
          setCustomerId(newCustomer?.id || null)
          console.log('[useFavorites] Customer created:', newCustomer?.id)
        }
      } catch (error) {
        console.error('[useFavorites] Failed to fetch/create customer:', error)
        setCustomerId(null)
      }
    }

    fetchOrCreateCustomer()
  }, [user?.id, user?.email, user?.name])

  // ログインユーザーの場合、DBからお気に入りを取得
  useEffect(() => {
    const fetchFavoritesFromDB = async () => {
      if (!customerId) return

      setIsLoading(true)
      try {
        const { data: likesData, error } = await supabase
          .from('scenario_likes')
          .select('scenario_id')
          .eq('customer_id', customerId)

        if (error) throw error

        if (likesData) {
          const dbFavorites = new Set(likesData.map(like => like.scenario_id))
          setFavorites(dbFavorites)
          // ローカルストレージも更新
          localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(dbFavorites)))
        }
      } catch (error) {
        logger.error('Failed to fetch favorites from DB:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchFavoritesFromDB()
  }, [customerId])

  // ローカルストレージに保存（非ログイン時のフォールバック）
  useEffect(() => {
    if (!customerId) {
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)))
      } catch (error) {
        logger.error('Failed to save favorites:', error)
      }
    }
  }, [favorites, customerId])

  const toggleFavorite = useCallback(async (scenarioId: string) => {
    console.log('[useFavorites] toggleFavorite called, scenarioId:', scenarioId, 'customerId:', customerId)
    const isCurrentlyFavorite = favorites.has(scenarioId)
    
    // 楽観的更新
    setFavorites(prev => {
      const newFavorites = new Set(prev)
      if (newFavorites.has(scenarioId)) {
        newFavorites.delete(scenarioId)
      } else {
        newFavorites.add(scenarioId)
      }
      return newFavorites
    })

    // ログインユーザーの場合はDBにも保存
    if (customerId) {
      try {
        if (isCurrentlyFavorite) {
          // お気に入りから削除
          console.log('[useFavorites] Deleting from scenario_likes')
          const { error } = await supabase
            .from('scenario_likes')
            .delete()
            .eq('customer_id', customerId)
            .eq('scenario_id', scenarioId)

          if (error) throw error
          console.log('[useFavorites] Removed from favorites:', scenarioId)
        } else {
          // お気に入りに追加
          console.log('[useFavorites] Inserting to scenario_likes:', { customer_id: customerId, scenario_id: scenarioId })
          const { data, error } = await supabase
            .from('scenario_likes')
            .insert({
              customer_id: customerId,
              scenario_id: scenarioId,
            })
            .select()

          console.log('[useFavorites] Insert result:', data, 'error:', error)
          if (error) throw error
          console.log('[useFavorites] Added to favorites:', scenarioId)
        }
      } catch (error) {
        console.error('[useFavorites] Failed to update favorites in DB:', error)
        // エラー時はロールバック
        setFavorites(prev => {
          const newFavorites = new Set(prev)
          if (isCurrentlyFavorite) {
            newFavorites.add(scenarioId)
          } else {
            newFavorites.delete(scenarioId)
          }
          return newFavorites
        })
      }
    } else {
      console.log('[useFavorites] No customerId, not saving to DB')
    }
  }, [favorites, customerId])

  const isFavorite = useCallback((scenarioId: string) => favorites.has(scenarioId), [favorites])

  return {
    favorites,
    toggleFavorite,
    isFavorite,
    isLoading
  }
}
