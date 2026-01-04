import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { getCurrentOrganizationId } from '@/lib/organization'
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

  // 顧客IDを取得
  useEffect(() => {
    const fetchCustomerId = async () => {
      if (!user?.email) {
        setCustomerId(null)
        return
      }

      try {
        const { data: customer } = await supabase
          .from('customers')
          .select('id')
          .eq('email', user.email)
          .maybeSingle()

        setCustomerId(customer?.id || null)
      } catch (error) {
        logger.error('Failed to fetch customer ID:', error)
        setCustomerId(null)
      }
    }

    fetchCustomerId()
  }, [user?.email])

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
          const { error } = await supabase
            .from('scenario_likes')
            .delete()
            .eq('customer_id', customerId)
            .eq('scenario_id', scenarioId)

          if (error) throw error
          logger.info('Removed from favorites:', scenarioId)
        } else {
          // お気に入りに追加
          const orgId = await getCurrentOrganizationId()
          const { error } = await supabase
            .from('scenario_likes')
            .insert({
              customer_id: customerId,
              scenario_id: scenarioId,
              organization_id: orgId
            })

          if (error) throw error
          logger.info('Added to favorites:', scenarioId)
        }
      } catch (error) {
        logger.error('Failed to update favorites in DB:', error)
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
