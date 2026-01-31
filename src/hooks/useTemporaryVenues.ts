/**
 * 臨時会場管理フック（リファクタリング版）
 * 
 * レンタルスペースなど、特定の日付のみに追加される臨時会場を管理する
 * 臨時1〜5を再利用し、日付ごとに表示/非表示を制御する
 */

import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import type { Store } from '@/types'

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const TEMP_VENUE_SELECT_FIELDS =
  'id, name, short_name, is_temporary, temporary_dates, temporary_venue_names, display_order' as const

interface UseTemporaryVenuesReturn {
  temporaryVenues: Store[]  // すべての臨時会場（臨時1〜5）
  availableVenues: Store[]  // まだ予約されていない臨時会場
  getVenuesForDate: (date: string) => Store[]  // 指定日付で使用される臨時会場
  getVenueNameForDate: (venueId: string, date: string) => string  // 日付ごとのカスタム会場名を取得
  addTemporaryVenue: (date: string, venueId: string, customName?: string) => Promise<void>
  updateVenueName: (date: string, venueId: string, newName: string) => Promise<void>  // 臨時会場名を変更
  removeTemporaryVenue: (date: string, venueId: string) => Promise<void>
  loading: boolean
}

/**
 * 臨時会場を管理するフック（Supabase連携）
 */
export function useTemporaryVenues(currentDate: Date): UseTemporaryVenuesReturn {
  const [temporaryVenues, setTemporaryVenues] = useState<Store[]>([])
  const [loading, setLoading] = useState(false)

  // Supabaseから臨時会場を読み込む + Realtime購読
  useEffect(() => {
    const loadTemporaryVenues = async () => {
      setLoading(true)
      try {
        // 臨時1〜5をすべて取得
        const { data, error } = await supabase
          .from('stores')
          .select(TEMP_VENUE_SELECT_FIELDS)
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
          // Realtimeのペイロードを適切な型にキャスト
          const newData = payload.new as Partial<Store> | null
          const oldData = payload.old as Partial<Store> | null
          
          // 臨時会場以外は無視
          const isTemporary = newData?.is_temporary || oldData?.is_temporary
          if (!isTemporary) {
            return
          }
          
          logger.log('🔔 臨時会場Realtimeイベント受信:', {
            type: payload.eventType,
            venue: newData?.name || oldData?.name,
            temporary_dates: newData?.temporary_dates || oldData?.temporary_dates
          })

          if (payload.eventType === 'INSERT' && newData && newData.id) {
            setTemporaryVenues(prev => {
              // 重複チェック
              if (prev.some(v => v.id === newData.id)) {
                logger.log('⏭️ 重複をスキップ:', newData.id)
                return prev
              }
              logger.log('✅ Realtime: 臨時会場を追加:', newData.name)
              return [...prev, newData as Store].sort((a, b) => a.name.localeCompare(b.name))
            })
          } else if (payload.eventType === 'UPDATE' && newData && newData.id) {
            setTemporaryVenues(prev => 
              prev.map(v => v.id === newData.id ? newData as Store : v)
            )
            logger.log('🔄 Realtime: 臨時会場を更新:', newData.name)
          } else if (payload.eventType === 'DELETE' && oldData && oldData.id) {
            setTemporaryVenues(prev => prev.filter(v => v.id !== oldData.id))
            logger.log('🗑️ Realtime: 臨時会場を削除:', oldData.name)
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

  // 日付ごとのカスタム会場名を取得（設定がなければデフォルト名を返す）
  const getVenueNameForDate = useCallback((venueId: string, date: string) => {
    const venue = temporaryVenues.find(v => v.id === venueId)
    if (!venue) return ''
    
    // 日付ごとのカスタム名があればそれを返す
    const customName = venue.temporary_venue_names?.[date]
    if (customName) return customName
    
    // なければデフォルトの名前を返す
    return venue.short_name || venue.name
  }, [temporaryVenues])

  // まだ予約されていない臨時会場を取得
  const availableVenues = temporaryVenues

  // 臨時会場に日付を追加
  const addTemporaryVenue = useCallback(async (date: string, venueId: string, customName?: string) => {
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
      
      // カスタム名がある場合は temporary_venue_names も更新
      const currentVenueNames = venue.temporary_venue_names || {}
      const newVenueNames = customName 
        ? { ...currentVenueNames, [date]: customName }
        : currentVenueNames

      // まずカスタム名も含めて更新を試みる
      if (customName) {
        const { error: fullUpdateError } = await supabase
          .from('stores')
          .update({ 
            temporary_dates: newDates,
            temporary_venue_names: newVenueNames
          })
          .eq('id', venueId)

        if (fullUpdateError) {
          // temporary_venue_names カラムが存在しない場合は temporary_dates のみ更新
          logger.log('⚠️ temporary_venue_names カラムが存在しない可能性、temporary_dates のみ更新します')
          const { error: datesOnlyError } = await supabase
            .from('stores')
            .update({ temporary_dates: newDates })
            .eq('id', venueId)

          if (datesOnlyError) throw datesOnlyError
          
          // 楽観的更新（カスタム名なし）
          setTemporaryVenues(prev =>
            prev.map(v => v.id === venueId ? { ...v, temporary_dates: newDates } : v)
          )
          showToast.info('会場名の保存にはデータベースの更新が必要です', '臨時会場は追加されました')
        } else {
          // 楽観的更新（カスタム名あり）
          setTemporaryVenues(prev =>
            prev.map(v => v.id === venueId ? { 
              ...v, 
              temporary_dates: newDates,
              temporary_venue_names: newVenueNames
            } : v)
          )
        }
      } else {
        // カスタム名がない場合は temporary_dates のみ更新
        const { error } = await supabase
          .from('stores')
          .update({ temporary_dates: newDates })
          .eq('id', venueId)

        if (error) throw error

        // 楽観的更新
        setTemporaryVenues(prev =>
          prev.map(v => v.id === venueId ? { ...v, temporary_dates: newDates } : v)
        )
      }

      logger.log('✅ 臨時会場に日付を追加:', { venue: venue.name, date, customName })
    } catch (error) {
      logger.error('臨時会場への日付追加に失敗:', error)
      showToast.error('臨時会場の追加に失敗しました')
    }
  }, [temporaryVenues])

  // 臨時会場名を変更
  const updateVenueName = useCallback(async (date: string, venueId: string, newName: string) => {
    try {
      const venue = temporaryVenues.find(v => v.id === venueId)
      if (!venue) {
        throw new Error('臨時会場が見つかりません')
      }

      // temporary_venue_names を更新
      const currentVenueNames = venue.temporary_venue_names || {}
      const newVenueNames = { ...currentVenueNames, [date]: newName }

      const { error } = await supabase
        .from('stores')
        .update({ temporary_venue_names: newVenueNames })
        .eq('id', venueId)

      if (error) {
        // カラムが存在しない場合のエラー
        logger.error('臨時会場名の更新に失敗（カラムが存在しない可能性）:', error)
        showToast.error('会場名の保存にはデータベースの更新が必要です')
        return
      }

      // 楽観的更新
      setTemporaryVenues(prev =>
        prev.map(v => v.id === venueId ? { 
          ...v, 
          temporary_venue_names: newVenueNames
        } : v)
      )

      logger.log('✅ 臨時会場名を変更:', { venue: venue.name, date, newName })
      showToast.success('会場名を変更しました')
    } catch (error) {
      logger.error('臨時会場名の変更に失敗:', error)
      showToast.error('会場名の変更に失敗しました')
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
        showToast.warning('この日付には公演が登録されているため削除できません', '先に公演を削除してください')
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
      showToast.error('臨時会場の削除に失敗しました', message)
    }
  }, [temporaryVenues])

  return {
    temporaryVenues,
    availableVenues,
    getVenuesForDate,
    getVenueNameForDate,
    addTemporaryVenue,
    updateVenueName,
    removeTemporaryVenue,
    loading
  }
}
