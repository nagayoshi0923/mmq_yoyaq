import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { EventSchedule } from '../utils/types'

interface UseBookingActionsProps {
  events: EventSchedule[]
  onReload: () => void
}

/**
 * 予約・貸切リクエストのアクションを管理するフック
 */
export function useBookingActions({ events, onReload }: UseBookingActionsProps) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<EventSchedule | null>(null)
  const [participantCount, setParticipantCount] = useState(1)
  const [showBookingConfirmation, setShowBookingConfirmation] = useState(false)
  const [showPrivateBookingRequest, setShowPrivateBookingRequest] = useState(false)
  
  // URLパラメータからの復元を一度だけ実行するフラグ
  const hasRestoredFromUrl = useRef(false)
  
  // URLパラメータから予約状態を復元
  useEffect(() => {
    if (hasRestoredFromUrl.current || events.length === 0) return
    
    const eventParam = searchParams.get('event')
    const countParam = searchParams.get('count')
    
    if (eventParam) {
      // 指定された公演IDが存在するか確認
      const event = events.find(e => e.event_id === eventParam)
      if (event) {
        setSelectedEventId(eventParam)
        if (countParam) {
          const count = parseInt(countParam, 10)
          if (!isNaN(count) && count > 0) {
            setParticipantCount(count)
          }
        }
        // URLからパラメータを削除（履歴を汚さないためreplace）
        searchParams.delete('event')
        searchParams.delete('count')
        setSearchParams(searchParams, { replace: true })
        
        hasRestoredFromUrl.current = true
      }
    }
  }, [events, searchParams, setSearchParams])

  // 予約処理
  const handleBooking = useCallback(async () => {
    if (!selectedEventId) {
      showToast.warning('日付を選択してください')
      return
    }
    
    const event = events.find(e => e.event_id === selectedEventId)
    if (!event) {
      showToast.error('選択された公演が見つかりません')
      return
    }
    
    // 🚨 CRITICAL: リアルタイムで最新の空席状況をチェック
    // ページロード時のデータ(event.is_available)は古い可能性がある
    // 注: reservations テーブルは RLS により顧客自身の行しか見えないため
    //     schedule_events_public.current_participants（トリガーで常に最新）を使用する
    try {
      const { data: freshEventData } = await supabase
        .from('schedule_events_public')
        .select('current_participants, max_participants, capacity')
        .eq('id', event.event_id)
        .single()
      const currentParticipants = freshEventData?.current_participants ?? event.current_participants
      const maxParticipants = freshEventData?.max_participants || freshEventData?.capacity || event.max_participants || 8
      const availableSeats = maxParticipants - currentParticipants

      // 満席の場合でも予約確認画面に遷移（キャンセル待ち登録が可能）
      if (availableSeats <= 0) {
        // 満席でもBookingConfirmationに遷移（キャンセル待ちUI表示）
        setSelectedEvent(event)
        setShowBookingConfirmation(true)
        return
      }

      if (participantCount > availableSeats) {
        showToast.warning(`残り${availableSeats}名分の空きしかありません`)
        return
      }
    } catch (error) {
      // エラーの場合は続行（予約確定時に再チェックされる）
      logger.error('空席チェックエラー:', error)
    }
    
    setSelectedEvent(event)
    setShowBookingConfirmation(true)
  }, [selectedEventId, events, participantCount])

  // 予約完了
  const handleBookingComplete = useCallback(() => {
    setShowBookingConfirmation(false)
    setSelectedEvent(null)
    setSelectedEventId(null)
    onReload()
  }, [onReload])

  // 予約キャンセル（戻る）
  const handleBackFromBooking = useCallback(() => {
    setShowBookingConfirmation(false)
    setSelectedEvent(null)
  }, [])

  // 貸切リクエスト開始
  const handlePrivateBookingRequest = useCallback((isLoggedIn: boolean) => {
    if (!isLoggedIn) {
      // 戻り先URLを保存してログインページへ遷移（貸切タブを維持）
      const url = new URL(window.location.href)
      url.searchParams.set('tab', 'private')
      sessionStorage.setItem('returnUrl', url.pathname + url.search)
      navigate('/login')
      return
    }
    setShowPrivateBookingRequest(true)
  }, [navigate])

  // 貸切リクエスト完了
  const handlePrivateBookingComplete = useCallback(() => {
    setShowPrivateBookingRequest(false)
    onReload()
  }, [onReload])

  // 貸切リクエストキャンセル（戻る）
  const handleBackFromPrivateBooking = useCallback(() => {
    setShowPrivateBookingRequest(false)
  }, [])

  return {
    selectedEventId,
    selectedEvent,
    participantCount,
    showBookingConfirmation,
    showPrivateBookingRequest,
    setSelectedEventId,
    setParticipantCount,
    handleBooking,
    handleBookingComplete,
    handleBackFromBooking,
    handlePrivateBookingRequest,
    handlePrivateBookingComplete,
    handleBackFromPrivateBooking
  }
}

