import { showToast } from '@/utils/toast'
import { useState, useCallback } from 'react'
import type { EventSchedule } from '../utils/types'

interface UseBookingActionsProps {
  events: EventSchedule[]
  onReload: () => void
}

/**
 * 予約・貸切リクエストのアクションを管理するフック
 */
export function useBookingActions({ events, onReload }: UseBookingActionsProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<EventSchedule | null>(null)
  const [participantCount, setParticipantCount] = useState(1)
  const [showBookingConfirmation, setShowBookingConfirmation] = useState(false)
  const [showPrivateBookingRequest, setShowPrivateBookingRequest] = useState(false)

  // 予約処理
  const handleBooking = useCallback(() => {
    if (!selectedEventId) {
      showToast.warning('日付を選択してください')
      return
    }
    
    const event = events.find(e => e.event_id === selectedEventId)
    if (!event) {
      showToast.error('選択された公演が見つかりません')
      return
    }
    
    if (!event.is_available) {
      showToast.warning('この公演は満席です')
      return
    }
    
    setSelectedEvent(event)
    setShowBookingConfirmation(true)
  }, [selectedEventId, events])

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
      window.location.hash = 'login'
      return
    }
    setShowPrivateBookingRequest(true)
  }, [])

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

