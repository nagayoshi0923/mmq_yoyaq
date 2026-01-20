import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'

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
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  // DBから通知を取得
  const fetchFromDatabase = useCallback(async (): Promise<Notification[] | null> => {
    try {
      const { data, error } = await supabase
        .from('user_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        // テーブルが存在しない場合はnullを返してフォールバック
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          logger.log('user_notificationsテーブルが存在しないため、フォールバック処理を使用')
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
      logger.error('DB通知取得エラー:', error)
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
    }

    // タイムスタンプでソート（新しい順）
    newNotifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    return newNotifications
  }, [user?.email])

  // 通知を取得（DB優先、フォールバックあり）
  const fetchNotifications = useCallback(async () => {
    if (!user?.email) return

    setLoading(true)
    try {
      // まずDBから取得を試みる
      let notifs = await fetchFromDatabase()
      
      // DBテーブルがない場合はフォールバック
      if (notifs === null) {
        notifs = await fetchFromExistingData()
      }

      setNotifications(notifs)
      setUnreadCount(notifs.filter(n => !n.read).length)
    } catch (error) {
      logger.error('通知取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }, [user?.email, fetchFromDatabase, fetchFromExistingData])

  // 通知を既読にする
  const markAsRead = useCallback(async (notificationId: string) => {
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
    
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    )
    setUnreadCount(prev => Math.max(0, prev - 1))
  }, [])

  // すべての通知を既読にする
  const markAllAsRead = useCallback(async () => {
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
    
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }, [notifications])

  // 初回読み込み
  useEffect(() => {
    if (user?.email) {
      fetchNotifications()
    }
  }, [user?.email, fetchNotifications])

  return {
    notifications,
    loading,
    unreadCount,
    fetchNotifications,
    markAsRead,
    markAllAsRead
  }
}
