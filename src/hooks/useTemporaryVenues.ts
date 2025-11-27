/**
 * 臨時会場管理フック
 * 
 * レンタルスペースなど、特定の日付のみに追加される臨時会場を管理する
 */

import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Store } from '@/types'

interface UseTemporaryVenuesReturn {
  temporaryVenues: Store[]
  getVenuesForDate: (date: string) => Store[]
  addTemporaryVenue: (date: string) => Promise<void>
  removeTemporaryVenue: (venueId: string) => Promise<void>
  loading: boolean
}

/**
 * 臨時会場を管理するフック（Supabase連携）
 */
export function useTemporaryVenues(currentDate: Date): UseTemporaryVenuesReturn {
  const [temporaryVenues, setTemporaryVenues] = useState<Store[]>([])
  const [loading, setLoading] = useState(false)

  // 月の開始日と終了日を取得
  const getMonthRange = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const startDate = new Date(year, month, 1, 12, 0, 0, 0)
    const endDate = new Date(year, month + 1, 0, 12, 0, 0, 0)
    
    return {
      start: `${year}-${String(month + 1).padStart(2, '0')}-01`,
      end: `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
    }
  }

  // Supabaseから臨時会場を読み込む + Realtime購読
  useEffect(() => {
    const loadTemporaryVenues = async () => {
      setLoading(true)
      try {
        const { start, end } = getMonthRange(currentDate)
        
        const { data, error } = await supabase
          .from('stores')
          .select('*')
          .eq('is_temporary', true)
          .gte('temporary_date', start)
          .lte('temporary_date', end)
        
        if (error) throw error
        
        console.log('📍 臨時会場データ読み込み:', {
          期間: { start, end },
          取得件数: data?.length || 0,
          データ: data?.map(v => ({
            id: v.id,
            name: v.name,
            temporary_date: v.temporary_date,
            is_temporary: v.is_temporary
          }))
        })
        
        setTemporaryVenues(data || [])
      } catch (error) {
        console.error('臨時会場データの読み込みに失敗:', error)
        setTemporaryVenues([])
      } finally {
        setLoading(false)
      }
    }
    
    loadTemporaryVenues()

    // Realtime購読（臨時会場のみ）
    const { start, end } = getMonthRange(currentDate)
    
    const channel = supabase
      .channel('temporary_venues_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stores',
          filter: 'is_temporary=eq.true'
        },
        (payload) => {
          console.log('臨時会場Realtimeイベント:', payload)
          
          // クライアント側で月フィルタリング
          const isInCurrentMonth = (venue: any) => {
            return venue.temporary_date >= start && venue.temporary_date <= end
          }

          if (payload.eventType === 'INSERT' && payload.new) {
            if (isInCurrentMonth(payload.new)) {
              setTemporaryVenues(prev => {
                // 重複チェック: 同じIDが既に存在するか
                if (prev.some(v => v.id === payload.new.id)) {
                  console.log('重複をスキップ:', payload.new.id)
                  return prev
                }
                return [...prev, payload.new as Store]
              })
            }
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            if (isInCurrentMonth(payload.new)) {
              setTemporaryVenues(prev => 
                prev.map(v => v.id === payload.new.id ? payload.new as Store : v)
              )
            } else {
              // 月外に移動した場合は削除
              setTemporaryVenues(prev => prev.filter(v => v.id !== payload.new.id))
            }
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setTemporaryVenues(prev => prev.filter(v => v.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [currentDate])

  // 特定の日付の臨時会場を取得
  const getVenuesForDate = useCallback((date: string) => {
    return temporaryVenues.filter(venue => venue.temporary_date === date)
  }, [temporaryVenues])

  // 臨時会場を追加
  const addTemporaryVenue = useCallback(async (date: string) => {
    try {
      const existingVenuesForDate = temporaryVenues.filter(v => v.temporary_date === date)
      const venueNumber = existingVenuesForDate.length + 1
      
      const newVenue = {
        name: `臨時会場${venueNumber}`,
        short_name: `臨時${venueNumber}`,
        is_temporary: true,
        temporary_date: date,
        address: '',
        phone_number: '',
        email: '',
        opening_date: date,
        manager_name: '',
        status: 'active' as const,
        capacity: 8,
        rooms: 1,
        color: 'gray'
      }
      
      const { data, error } = await supabase
        .from('stores')
        .insert([newVenue])
        .select()
        .single()
      
      if (error) throw error
      
      // Realtimeで自動的に反映されるため、楽観的更新は不要
      console.log('臨時会場を追加しました:', data)
    } catch (error) {
      console.error('臨時会場の追加に失敗:', error)
      alert('臨時会場の追加に失敗しました')
    }
  }, [temporaryVenues])

  // 臨時会場を削除
  const removeTemporaryVenue = useCallback(async (venueId: string) => {
    try {
      console.log('🗑️ 臨時会場削除開始:', venueId)
      
      // 削除前に公演が存在するかチェック
      const { data: events, error: checkError } = await supabase
        .from('schedule_events')
        .select('id')
        .eq('store_id', venueId)
        .limit(1)
      
      if (checkError) {
        console.error('公演チェックエラー:', checkError)
        throw checkError
      }
      
      console.log('公演チェック結果:', { 公演数: events?.length || 0 })
      
      if (events && events.length > 0) {
        alert('この臨時会場には公演が登録されているため削除できません。先に公演を削除してください。')
        return
      }
      
      const { error } = await supabase
        .from('stores')
        .delete()
        .eq('id', venueId)
      
      if (error) {
        console.error('削除エラー:', error)
        throw error
      }
      
      console.log('✅ 臨時会場を削除しました:', venueId)
    } catch (error) {
      console.error('臨時会場の削除に失敗:', error)
      alert('臨時会場の削除に失敗しました: ' + (error as any).message)
    }
  }, [])

  return {
    temporaryVenues,
    getVenuesForDate,
    addTemporaryVenue,
    removeTemporaryVenue,
    loading
  }
}

