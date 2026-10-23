import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { scenarioPageReadApi } from '@/lib/api/scenarioPageReadApi'
import type { EventSchedule } from '../utils/types'
import { useRequireCompleteProfile } from '@/hooks/useRequireCompleteProfile'
import { BOOKING_CONFIRM_STEP } from '@/lib/profileGate'
import { loginUrlWithIntent } from '@/lib/authReturn'
import { savePrivateBookingLoginDraft, type PrivateBookingDraftSlot } from '@/lib/privateBookingLoginDraft'

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
  const requireCompleteProfile = useRequireCompleteProfile()
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [participantCount, setParticipantCount] = useState(1)
  const [showPrivateBookingRequest, setShowPrivateBookingRequest] = useState(false)
  // この画面の中で「予約確認へ進む」を押して確認画面の履歴を積んだか（戻るボタンで履歴を戻すため）
  const pushedConfirmRef = useRef(false)
  
  // URLパラメータからの復元を一度だけ実行するフラグ
  const hasRestoredFromUrl = useRef(false)
  // 復元が終わってから URL への書き戻しを始める（同じ描画で書き戻すと、復元前の空の選択で URL を消してしまう）
  const [restored, setRestored] = useState(false)
  
  // URLパラメータから予約状態を復元（?event=&count=。トップの検索・ログインからの戻り・ブラウザの戻る）
  useEffect(() => {
    if (hasRestoredFromUrl.current || events.length === 0) return
    hasRestoredFromUrl.current = true
    setRestored(true)
    
    const eventParam = searchParams.get('event')
    const countParam = searchParams.get('count')
    if (!eventParam) return

    // 指定された公演IDが存在するか確認
    const event = events.find(e => e.event_id === eventParam)
    if (!event) return
    setSelectedEventId(eventParam)
    if (countParam) {
      const count = parseInt(countParam, 10)
      if (!isNaN(count) && count > 0) {
        // トップの検索から来た人数は、その公演の残席までに収める（人数の選択肢に無い値を入れない）
        const seats = event.available_seats
        setParticipantCount(seats > 0 ? Math.min(count, seats) : count)
      }
    }
    // 選んだ公演が見える位置まで送る（スマホでは日程が画面の下にあるため）。確認画面のときは送らない
    if (searchParams.get('step') !== BOOKING_CONFIRM_STEP) {
      window.setTimeout(() => {
        document.querySelector(`[data-event-id="${CSS.escape(eventParam)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 400)
    }
  }, [events, searchParams])

  // 選んだ公演と人数を URL に持たせる（ログインへ行って戻る・再読み込みでも消えない。点検 12）
  useEffect(() => {
    if (!restored) return
    const currentEvent = searchParams.get('event')
    const currentCount = searchParams.get('count')
    const nextCount = selectedEventId ? String(participantCount) : null
    if (currentEvent === selectedEventId && currentCount === nextCount) return
    const next = new URLSearchParams(searchParams)
    if (selectedEventId && nextCount) {
      next.set('event', selectedEventId)
      next.set('count', nextCount)
    } else {
      next.delete('event')
      next.delete('count')
      next.delete('step')
    }
    setSearchParams(next, { replace: true })
  }, [restored, selectedEventId, participantCount, searchParams, setSearchParams])

  // 予約確認画面は ?step=confirm の URL（再読み込み・戻るで消えない。点検 48）
  const selectedEvent = useMemo(
    () => (selectedEventId ? events.find(e => e.event_id === selectedEventId) ?? null : null),
    [events, selectedEventId],
  )
  const showBookingConfirmation = searchParams.get('step') === BOOKING_CONFIRM_STEP && selectedEvent !== null

  const openConfirmStep = useCallback(async (event: EventSchedule) => {
    const next = new URLSearchParams(searchParams)
    next.set('event', event.event_id)
    next.set('count', String(participantCount))
    next.set('step', BOOKING_CONFIRM_STEP)
    const confirmUrl = `${window.location.pathname}?${next.toString()}`
    // プロフィール登録が済んでいなければ、ここで登録へ（登録後はこの確認画面へ戻る。点検 9）
    if (!(await requireCompleteProfile(confirmUrl))) return
    pushedConfirmRef.current = true
    setSearchParams(next)
  }, [searchParams, participantCount, requireCompleteProfile, setSearchParams])

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
      const { data: freshEventData } = await scenarioPageReadApi.findEventSeats(event.event_id)
      const currentParticipants = freshEventData?.current_participants ?? event.current_participants
      const maxParticipants = freshEventData?.max_participants || freshEventData?.capacity || event.max_participants || 8
      const availableSeats = maxParticipants - currentParticipants

      // 満席の場合でも予約確認画面に遷移（キャンセル待ち登録が可能）
      if (availableSeats <= 0) {
        await openConfirmStep(event)
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
    
    await openConfirmStep(event)
  }, [selectedEventId, events, participantCount, openConfirmStep])

  // 予約完了（URL から公演・人数・確認の段階を外す）
  const handleBookingComplete = useCallback(() => {
    pushedConfirmRef.current = false
    setSelectedEventId(null)
    const next = new URLSearchParams(searchParams)
    next.delete('event')
    next.delete('count')
    next.delete('step')
    setSearchParams(next, { replace: true })
    onReload()
  }, [onReload, searchParams, setSearchParams])

  // 予約確認から戻る（ブラウザの戻ると同じ。選んだ公演と人数は残す）
  const handleBackFromBooking = useCallback(() => {
    if (pushedConfirmRef.current) {
      pushedConfirmRef.current = false
      navigate(-1)
      return
    }
    const next = new URLSearchParams(searchParams)
    next.delete('step')
    setSearchParams(next, { replace: true })
  }, [navigate, searchParams, setSearchParams])

  // 未ログインで押したときの二重押し止め（ログイン画面への移動を 1 回にする）
  const leavingForLoginRef = useRef(false)

  // 貸切リクエスト開始
  // selection: 今選んでいる候補日時・店舗。ログインやプロフィール登録で画面を離れる間だけタブ内に預け、戻ったら戻す
  const handlePrivateBookingRequest = useCallback(async (
    isLoggedIn: boolean,
    intentLabel?: string,
    selection?: { timeSlots: PrivateBookingDraftSlot[]; storeIds: string[] },
  ) => {
    // 戻り先は貸切タブを開いた作品ページ
    const url = new URL(window.location.href)
    url.searchParams.set('tab', 'private')
    const returnTo = url.pathname + url.search
    const keepSelection = () => {
      if (!selection) return
      savePrivateBookingLoginDraft({
        pathname: url.pathname,
        timeSlots: selection.timeSlots,
        storeIds: selection.storeIds,
        openRequest: true,
      })
    }
    if (!isLoggedIn) {
      if (leavingForLoginRef.current) return
      leavingForLoginRef.current = true
      // 画面が残ったまま戻ってきた場合でも押せなくならないよう、少し後に解除する
      window.setTimeout(() => { leavingForLoginRef.current = false }, 1500)
      keepSelection()
      navigate(loginUrlWithIntent('login', returnTo, intentLabel))
      return
    }
    // プロフィール登録が済んでいなければ、ここで登録へ（点検 9）。登録後に戻ったら選択を戻す
    if (!(await requireCompleteProfile(returnTo))) {
      keepSelection()
      return
    }
    setShowPrivateBookingRequest(true)
  }, [navigate, requireCompleteProfile])

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

