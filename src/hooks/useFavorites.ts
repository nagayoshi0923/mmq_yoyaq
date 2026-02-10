import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { getCurrentOrganizationId } from '@/lib/organization'
import { sanitizeForPostgRestFilter } from '@/lib/utils'
import { logger } from '@/utils/logger'

// デフォルト組織ID（クインズワルツ）
const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001'

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
      if (!user?.id || !user?.email) {
        setCustomerId(null)
        return
      }

      try {
        // まず既存の顧客を検索（user_idで検索）
        const { data: customerByUserId, error: selectError } = await supabase
          .from('customers')
          .select('id, user_id')
          .eq('user_id', user.id)
          .maybeSingle()
        let customer = customerByUserId

        if (selectError) {
          logger.error('Failed to fetch customer by user_id:', selectError)
        }

        // user_idで見つからない場合、emailで検索
        if (!customer?.id) {
          const { data: customerByEmail, error: emailError } = await supabase
            .from('customers')
            .select('id, user_id')
            .eq('email', user.email)
            .maybeSingle()

          if (emailError) {
            logger.error('Failed to fetch customer by email:', emailError)
          }

          if (customerByEmail?.id) {
            customer = customerByEmail
            
            // user_idが設定されていない場合は更新
            if (!customerByEmail.user_id) {
              const { error: updateError } = await supabase
                .from('customers')
                .update({ user_id: user.id })
                .eq('id', customerByEmail.id)
              
              if (updateError) {
                logger.warn('Failed to update customer user_id:', updateError)
              }
            }
          }
        }

        if (customer?.id) {
          setCustomerId(customer.id)
          return
        }

        // 顧客が存在しない場合、作成する（organization_id付き）
        const orgId = await getCurrentOrganizationId() || DEFAULT_ORG_ID
        
        const { data: newCustomer, error: insertError } = await supabase
          .from('customers')
          .insert({
            email: user.email,
            name: user.name || user.email.split('@')[0],
            user_id: user.id,
            organization_id: orgId,
          })
          .select('id')
          .single()

        if (insertError) {
          // 重複エラーの場合は再取得
          if (insertError.code === '23505') {
            const safeUserId = sanitizeForPostgRestFilter(user.id) || user.id
            const safeEmail = sanitizeForPostgRestFilter(user.email) || user.email
            const { data: existingCustomer } = await supabase
              .from('customers')
              .select('id')
              .or(`user_id.eq.${safeUserId},email.eq.${safeEmail}`)
              .maybeSingle()
            setCustomerId(existingCustomer?.id || null)
          } else {
            throw insertError
          }
        } else {
          setCustomerId(newCustomer?.id || null)
        }
      } catch (error) {
        logger.error('Failed to fetch/create customer:', error)
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
        } else {
          // お気に入りに追加（organization_idを取得して設定）
          const orgId = await getCurrentOrganizationId() || DEFAULT_ORG_ID
          const { error } = await supabase
            .from('scenario_likes')
            .insert({
              customer_id: customerId,
              scenario_id: scenarioId,
              organization_id: orgId,
            })

          if (error) throw error
        }
      } catch (error) {
        logger.error('Failed to update favorites in DB:', { error, customerId, scenarioId })
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
