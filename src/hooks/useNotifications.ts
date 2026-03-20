import { useCallback, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import { useQuery, useQueryClient } from '@tanstack/react-query'

export interface Notification {
  id: string
  type: 'reservation_confirmed' | 'reservation_reminder' | 'waitlist_available' | 'reservation_cancelled' | 'system'
  title: string
  message: string
  timestamp: Date
  read: boolean
  link?: string
  data?: Record<string, any>
}

/**
 * 通知機能フック
 * DBのuser_notificationsテーブルから通知を取得
 * テーブルがない場合は既存データから動的に生成（フォールバック）
 */
export function useNotifications() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => ['user_notifications', user?.email || ''] as const, [user?.email])

  // DBから通知を取得
  const fetchFromDatabase = useCallback(async (): Promise<Notification[] | null> => {
    try {
      const { data, error } = await supabase
        .from('user_notifications')
        .select('id, type, title, message, created_at, is_read, link, metadata')
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        // テーブルが存在しない場合はnullを返してフォールバック
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          return null
        }
        throw error
      }

      return data?.map(row => ({
        id: row.id,
        type: row.type as Notification['type'],
        title: row.title,
        message: row.message,
        timestamp: new Date(row.created_at),
        read: row.is_read,
        link: row.link,
        data: row.metadata
      })) || []
    } catch (error) {
      // DB通知の取得に失敗した場合はフォールバックへ
      logger.warn('DB通知取得エラー（フォールバックへ）:', error)
      return null
    }
  }, [])

  // 既存データから通知を動的に生成（フォールバック）
  const fetchFromExistingData = useCallback(async (): Promise<Notification[]> => {
    if (!user?.email) return []

    const newNotifications: Notification[] = []
    const now = new Date()
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // 既読情報をlocalStorageから取得
    const readIds = new Set<string>()
    try {
      const stored = localStorage.getItem('readNotificationIds')
      if (stored) {
        JSON.parse(stored).forEach((id: string) => readIds.add(id))
      }
    } catch { /* ignore */ }

    // 顧客情報を取得
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('email', user.email)
      .maybeSingle()

    if (customer) {
      // 最近の予約（24時間以内に作成）→ 予約確認通知
      const { data: recentReservations } = await supabase
        .from('reservations')
        .select('id, reservation_number, title, created_at, requested_datetime')
        .eq('customer_id', customer.id)
        .gte('created_at', oneDayAgo.toISOString())
        .in('status', ['confirmed', 'gm_confirmed'])
        .order('created_at', { ascending: false })
        .limit(5)

      recentReservations?.forEach(res => {
        const notifId = `reservation_confirmed_${res.id}`
        newNotifications.push({
          id: notifId,
          type: 'reservation_confirmed',
          title: '予約が確定しました',
          message: `「${res.title}」のご予約を承りました`,
          timestamp: new Date(res.created_at),
          read: readIds.has(notifId),
          link: '/mypage',
          data: { reservationId: res.id, reservationNumber: res.reservation_number }
        })
      })

      // 今後3日以内の予約 → リマインダー通知
      const { data: upcomingReservations } = await supabase
        .from('reservations')
        .select('id, reservation_number, title, requested_datetime')
        .eq('customer_id', customer.id)
        .gte('requested_datetime', now.toISOString())
        .lte('requested_datetime', threeDaysFromNow.toISOString())
        .in('status', ['confirmed', 'gm_confirmed'])
        .order('requested_datetime', { ascending: true })
        .limit(3)

      upcomingReservations?.forEach(res => {
        const eventDate = new Date(res.requested_datetime)
        const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        const notifId = `reservation_reminder_${res.id}_${eventDate.toISOString().slice(0, 10)}`
        
        newNotifications.push({
          id: notifId,
          type: 'reservation_reminder',
          title: daysUntil === 0 ? '本日の公演' : daysUntil === 1 ? '明日の公演' : `${daysUntil}日後の公演`,
          message: `「${res.title}」`,
          timestamp: eventDate,
          read: readIds.has(notifId),
          link: '/mypage',
          data: { reservationId: res.id, reservationNumber: res.reservation_number }
        })
      })

      // キャンセル待ち通知（statusがnotified）
      const { data: waitlistNotifications } = await supabase
        .from('waitlist')
        .select(`
          id, 
          created_at,
          schedule_events(id, date, start_time, scenario)
        `)
        .eq('customer_id', customer.id)
        .eq('status', 'notified')
        .order('created_at', { ascending: false })
        .limit(3)

      waitlistNotifications?.forEach(wl => {
        const event = wl.schedule_events as any
        const notifId = `waitlist_available_${wl.id}`
        newNotifications.push({
          id: notifId,
          type: 'waitlist_available',
          title: 'キャンセル待ちに空きが出ました',
          message: event ? `「${event.scenario}」${event.date}` : 'キャンセル待ちの公演に空きが出ました',
          timestamp: new Date(wl.created_at),
          read: readIds.has(notifId),
          link: '/mypage',
          data: { waitlistId: wl.id }
        })
      })

      // キャンセルされた予約の通知（7日以内）
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const { data: cancelledReservations } = await supabase
        .from('reservations')
        .select('id, reservation_number, title, cancelled_at, requested_datetime, cancellation_reason')
        .eq('customer_id', customer.id)
        .eq('status', 'cancelled')
        .gte('cancelled_at', sevenDaysAgo.toISOString())
        .order('cancelled_at', { ascending: false })
        .limit(5)

      cancelledReservations?.forEach(res => {
        const notifId = `reservation_cancelled_${res.id}`
        const eventDate = res.requested_datetime ? new Date(res.requested_datetime).toLocaleDateString('ja-JP') : ''
        newNotifications.push({
          id: notifId,
          type: 'reservation_cancelled',
          title: '予約がキャンセルされました',
          message: `「${res.title}」${eventDate}`,
          timestamp: new Date(res.cancelled_at),
          read: readIds.has(notifId),
          link: '/mypage',
          data: { reservationId: res.id, reservationNumber: res.reservation_number, cancellationReason: res.cancellation_reason }
        })
      })
    }

    // タイムスタンプでソート（新しい順）
    newNotifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    return newNotifications
  }, [user?.email])

  const {
    data: notifications = [],
    isFetching,
    refetch,
  } = useQuery({
    queryKey,
    enabled: !!user?.email,
    // DB優先、フォールバックあり
    queryFn: async () => {
      if (!user?.email) return []
      const fromDb = await fetchFromDatabase()
      if (fromDb !== null) return fromDb
      return await fetchFromExistingData()
    },
    // 連打防止（同一画面での複数マウント/再レンダリングでも共通キャッシュを利用）
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  })

  // リアルタイムサブスクリプション: 新しい通知が追加されたら自動的に再取得
  useEffect(() => {
    if (!user?.id) return

    let channel: ReturnType<typeof supabase.channel> | null = null
    let cleanedUp = false

    const setupSubscription = async () => {
      // 顧客情報を取得してcustomer_idを取得
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cleanedUp) return

      // user_idまたはcustomer_idで通知を購読
      // Supabaseのリアルタイムはフィルタを2つ同時に適用できないため、
      // フィルタなしで購読し、コールバック内でフィルタリングする
      channel = supabase
        .channel(`user_notifications_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'user_notifications',
          },
          (payload) => {
            const newRecord = payload.new as { user_id?: string; customer_id?: string }
            // このユーザーに関連する通知のみ処理
            if (newRecord.user_id === user.id || (customer && newRecord.customer_id === customer.id)) {
              queryClient.invalidateQueries({ queryKey })
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'user_notifications',
          },
          (payload) => {
            const updatedRecord = payload.new as { user_id?: string; customer_id?: string }
            if (updatedRecord.user_id === user.id || (customer && updatedRecord.customer_id === customer.id)) {
              queryClient.invalidateQueries({ queryKey })
            }
          }
        )
        .subscribe(() => {})
    }

    setupSubscription()

    return () => {
      cleanedUp = true
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [user?.id, queryClient, queryKey])

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  )

  // 通知を既読にする
  const markAsRead = useCallback(async (notificationId: string) => {
    // 先にUIを更新（楽観的更新）
    queryClient.setQueryData(queryKey, (prev) => {
      const current = (prev as Notification[] | undefined) ?? []
      return current.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    })

    // DBの通知の場合
    if (notificationId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      try {
        await supabase
          .from('user_notifications')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('id', notificationId)
      } catch (error) {
        logger.error('通知既読更新エラー:', error)
      }
    } else {
      // フォールバック通知の場合はlocalStorageに保存
      try {
        const stored = localStorage.getItem('readNotificationIds')
        const readIds = stored ? new Set(JSON.parse(stored)) : new Set()
        readIds.add(notificationId)
        localStorage.setItem('readNotificationIds', JSON.stringify([...readIds]))
      } catch (e) {
        logger.error('既読情報の保存に失敗:', e)
      }
    }
  }, [queryClient, queryKey])

  // すべての通知を既読にする
  const markAllAsRead = useCallback(async () => {
    // 先にUIを更新（楽観的更新）
    queryClient.setQueryData(queryKey, (prev) => {
      const current = (prev as Notification[] | undefined) ?? []
      return current.map((n) => ({ ...n, read: true }))
    })

    // DBの通知を一括更新
    const dbNotificationIds = notifications
      .filter(n => !n.read && n.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i))
      .map(n => n.id)
    
    if (dbNotificationIds.length > 0) {
      try {
        await supabase
          .from('user_notifications')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .in('id', dbNotificationIds)
      } catch (error) {
        logger.error('通知一括既読更新エラー:', error)
      }
    }

    // フォールバック通知はlocalStorageに保存
    const fallbackIds = notifications
      .filter(n => !n.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i))
      .map(n => n.id)
    
    if (fallbackIds.length > 0) {
      try {
        const stored = localStorage.getItem('readNotificationIds')
        const readIds = stored ? new Set(JSON.parse(stored)) : new Set()
        fallbackIds.forEach(id => readIds.add(id))
        localStorage.setItem('readNotificationIds', JSON.stringify([...readIds]))
      } catch (e) {
        logger.error('既読情報の保存に失敗:', e)
      }
    }

    // DB反映の取りこぼしがあると困るので、最後に一度だけ同期
    void refetch()
  }, [notifications, queryClient, queryKey, refetch])

  return {
    notifications,
    loading: isFetching,
    unreadCount,
    fetchNotifications: refetch,
    markAsRead,
    markAllAsRead
  }
}
