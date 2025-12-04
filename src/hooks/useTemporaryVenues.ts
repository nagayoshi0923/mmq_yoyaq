/**
 * 臨時会場管理フック（リファクタリング版）
 * 
 * レンタルスペースなど、特定の日付のみに追加される臨時会場を管理する
 * 臨時1〜5を再利用し、日付ごとに表示/非表示を制御する
 */

import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { Store } from '@/types'

interface UseTemporaryVenuesReturn {
  temporaryVenues: Store[]  // すべての臨時会場（臨時1〜5）
  availableVenues: Store[]  // まだ予約されていない臨時会場
  getVenuesForDate: (date: string) => Store[]  // 指定日付で使用される臨時会場
  addTemporaryVenue: (date: string, venueId: string) => Promise<void>
  removeTemporaryVenue: (date: string, venueId: string) => Promise<void>
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
        // 臨時1〜5をすべて取得
        const { data, error } = await supabase
          .from('stores')
          .select('*')
          .eq('is_temporary', true)
          .order('name', { ascending: true })
        
        if (error) throw error
        
        logger.log('📍 臨時会場データ読み込み:', {
          取得件数: data?.length || 0,
          データ: data?.map(v => ({
            id: v.id,
            name: v.name,
            temporary_dates: v.temporary_dates
          }))
        })
        
        setTemporaryVenues(data || [])
      } catch (error) {
        logger.error('臨時会場データの読み込みに失敗:', error)
        setTemporaryVenues([])
      } finally {
        setLoading(false)
      }
    }
    
    loadTemporaryVenues()

    // Realtime購読（臨時会場のみ）
    const channel = supabase
      .channel('temporary_venues_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stores'
          // フィルターなし: クライアント側で is_temporary をチェック
        },
        (payload) => {
          // 臨時会場以外は無視
          const isTemporary = payload.new?.is_temporary || payload.old?.is_temporary
          if (!isTemporary) {
            return
          }
          
          logger.log('🔔 臨時会場Realtimeイベント受信:', {
            type: payload.eventType,
            venue: payload.new?.name || payload.old?.name,
            temporary_dates: payload.new?.temporary_dates || payload.old?.temporary_dates
          })

          if (payload.eventType === 'INSERT' && payload.new) {
            setTemporaryVenues(prev => {
              // 重複チェック
              if (prev.some(v => v.id === payload.new.id)) {
                logger.log('⏭️ 重複をスキップ:', payload.new.id)
                return prev
              }
              logger.log('✅ Realtime: 臨時会場を追加:', payload.new.name)
              return [...prev, payload.new as Store].sort((a, b) => a.name.localeCompare(b.name))
            })
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            setTemporaryVenues(prev => 
              prev.map(v => v.id === payload.new.id ? payload.new as Store : v)
            )
            logger.log('🔄 Realtime: 臨時会場を更新:', payload.new.name)
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setTemporaryVenues(prev => prev.filter(v => v.id !== payload.old.id))
            logger.log('🗑️ Realtime: 臨時会場を削除:', payload.old.name)
          }
        }
      )
      .subscribe((status) => {
        logger.log('📡 臨時会場Realtime購読状態:', status)
        if (status === 'SUBSCRIBED') {
          logger.log('✅ 臨時会場Realtime購読成功')
        } else if (status === 'CHANNEL_ERROR') {
          logger.error('❌ 臨時会場Realtime購読エラー')
        }
      })

    return () => {
      channel.unsubscribe()
    }
  }, [currentDate])

  // 特定の日付の臨時会場を取得
  const getVenuesForDate = useCallback((date: string) => {
    return temporaryVenues.filter(venue => {
      const dates = venue.temporary_dates || []
      return dates.includes(date)
    })
  }, [temporaryVenues])

  // まだ予約されていない臨時会場を取得
  const availableVenues = temporaryVenues

  // 臨時会場に日付を追加
  const addTemporaryVenue = useCallback(async (date: string, venueId: string) => {
    try {
      // 現在の temporary_dates を取得
      const venue = temporaryVenues.find(v => v.id === venueId)
      if (!venue) {
        throw new Error('臨時会場が見つかりません')
      }

      const currentDates = venue.temporary_dates || []
      
      // 既に追加されているかチェック
      if (currentDates.includes(date)) {
        logger.log('⏭️ 既に追加済み:', { venueId, date })
        return
      }

      // 日付を追加
      const newDates = [...currentDates, date].sort()

      const { error } = await supabase
        .from('stores')
        .update({ temporary_dates: newDates })
        .eq('id', venueId)

      if (error) throw error

      // 楽観的更新
      setTemporaryVenues(prev =>
        prev.map(v => v.id === venueId ? { ...v, temporary_dates: newDates } : v)
      )

      logger.log('✅ 臨時会場に日付を追加:', { venue: venue.name, date })
    } catch (error) {
      logger.error('臨時会場への日付追加に失敗:', error)
      alert('臨時会場の追加に失敗しました')
    }
  }, [temporaryVenues])

  // 臨時会場から日付を削除
  const removeTemporaryVenue = useCallback(async (date: string, venueId: string) => {
    try {
      logger.log('🗑️ 臨時会場から日付を削除開始:', { date, venueId })

      // 現在の temporary_dates を取得
      const venue = temporaryVenues.find(v => v.id === venueId)
      if (!venue) {
        throw new Error('臨時会場が見つかりません')
      }

      // 削除前に公演が存在するかチェック
      const { data: events, error: checkError } = await supabase
        .from('schedule_events')
        .select('id')
        .eq('store_id', venueId)
        .eq('date', date)
        .limit(1)

      if (checkError) {
        logger.error('公演チェックエラー:', checkError)
        throw checkError
      }

      logger.log('公演チェック結果:', { 公演数: events?.length || 0 })

      if (events && events.length > 0) {
        alert('この日付には公演が登録されているため削除できません。先に公演を削除してください。')
        return
      }

      // 日付を削除
      const currentDates = venue.temporary_dates || []
      const newDates = currentDates.filter(d => d !== date)

      const { error } = await supabase
        .from('stores')
        .update({ temporary_dates: newDates })
        .eq('id', venueId)

      if (error) {
        logger.error('削除エラー:', error)
        throw error
      }

      // 楽観的更新
      setTemporaryVenues(prev =>
        prev.map(v => v.id === venueId ? { ...v, temporary_dates: newDates } : v)
      )

      logger.log('✅ 臨時会場から日付を削除:', { venue: venue.name, date })
    } catch (error) {
      logger.error('臨時会場からの日付削除に失敗:', error)
      const message = error instanceof Error ? error.message : '不明なエラー'
      alert('臨時会場の削除に失敗しました: ' + message)
    }
  }, [temporaryVenues])

  return {
    temporaryVenues,
    availableVenues,
    getVenuesForDate,
    addTemporaryVenue,
    removeTemporaryVenue,
    loading
  }
}
