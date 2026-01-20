import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'

export interface Notification {
  id: string
  type: 'reservation_confirmed' | 'reservation_reminder' | 'waitlist_available' | 'reservation_cancelled'
  title: string
  message: string
  timestamp: Date
  read: boolean
  link?: string
  data?: Record<string, any>
}

/**
 * 通知機能フック
 * 予約、キャンセル待ちなどのデータから通知を生成
 */
export function useNotifications() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  
  // 既読済みの通知IDをローカルストレージから取得
  const getReadNotificationIds = useCallback((): Set<string> => {
    try {
      const stored = localStorage.getItem('readNotificationIds')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  }, [])
  
  // 既読済みの通知IDをローカルストレージに保存
  const saveReadNotificationIds = useCallback((ids: Set<string>) => {
    try {
      localStorage.setItem('readNotificationIds', JSON.stringify([...ids]))
    } catch (e) {
      logger.error('既読情報の保存に失敗:', e)
    }
  }, [])

  // 通知を取得
  const fetchNotifications = useCallback(async () => {
    if (!user?.email) return

    setLoading(true)
    try {
      const readIds = getReadNotificationIds()
      const newNotifications: Notification[] = []
      const now = new Date()
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      // 1. 顧客情報を取得
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('email', user.email)
        .maybeSingle()

      if (customer) {
        // 2. 最近の予約（24時間以内に作成）→ 予約確認通知
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

        // 3. 今後3日以内の予約 → リマインダー通知
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

        // 4. キャンセル待ち通知（statusがnotified）
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
      
      setNotifications(newNotifications)
      setUnreadCount(newNotifications.filter(n => !n.read).length)
    } catch (error) {
      logger.error('通知取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }, [user?.email, getReadNotificationIds])

  // 通知を既読にする
  const markAsRead = useCallback((notificationId: string) => {
    const readIds = getReadNotificationIds()
    readIds.add(notificationId)
    saveReadNotificationIds(readIds)
    
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    )
    setUnreadCount(prev => Math.max(0, prev - 1))
  }, [getReadNotificationIds, saveReadNotificationIds])

  // すべての通知を既読にする
  const markAllAsRead = useCallback(() => {
    const readIds = getReadNotificationIds()
    notifications.forEach(n => readIds.add(n.id))
    saveReadNotificationIds(readIds)
    
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }, [notifications, getReadNotificationIds, saveReadNotificationIds])

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

