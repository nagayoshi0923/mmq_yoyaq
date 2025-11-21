// 予約データ管理フック

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { reservationApi } from '@/lib/reservationApi'
import { logger } from '@/utils/logger'
import type { Reservation } from '@/types'
import type { ScheduleEvent, EmailContent } from '../types'

interface UseReservationsProps {
  event?: ScheduleEvent | null
  mode: 'add' | 'edit'
}

export function useReservations({ event, mode }: UseReservationsProps) {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loadingReservations, setLoadingReservations] = useState(false)
  const [expandedReservation, setExpandedReservation] = useState<string | null>(null)
  const [selectedReservations, setSelectedReservations] = useState<Set<string>>(new Set())
  
  // メール関連
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [isEmailConfirmOpen, setIsEmailConfirmOpen] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailContent, setEmailContent] = useState<EmailContent>({
    customerEmail: '',
    customerName: '',
    cancellationReason: '店舗都合によるキャンセル',
    scenarioTitle: '',
    eventDate: '',
    startTime: '',
    endTime: '',
    storeName: '',
    participantCount: 0,
    totalPrice: 0,
    reservationNumber: '',
    cancellationFee: 0
  })
  
  // キャンセル関連
  const [cancellingReservation, setCancellingReservation] = useState<Reservation | null>(null)
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)

  // 予約データの読み込み
  useEffect(() => {
    if (mode === 'edit' && event?.id) {
      loadReservations(event.id)
    }
  }, [mode, event?.id])

  const loadReservations = async (eventId: string) => {
    setLoadingReservations(true)
    try {
      const data = await reservationApi.getReservationsByEvent(eventId)
      setReservations(data || [])
    } catch (error) {
      logger.error('予約データ取得エラー:', error)
      setReservations([])
    } finally {
      setLoadingReservations(false)
    }
  }

  // 予約の展開/折りたたみ
  const toggleReservation = (reservationId: string) => {
    setExpandedReservation(prev => prev === reservationId ? null : reservationId)
  }

  // 予約の選択/選択解除
  const toggleReservationSelection = (reservationId: string) => {
    setSelectedReservations(prev => {
      const newSet = new Set(prev)
      if (newSet.has(reservationId)) {
        newSet.delete(reservationId)
      } else {
        newSet.add(reservationId)
      }
      return newSet
    })
  }

  // 一括メール送信の準備
  const prepareBulkEmail = () => {
    const selectedResData = reservations.filter(r => selectedReservations.has(r.id))
    if (selectedResData.length === 0) {
      alert('メールを送信する予約を選択してください')
      return
    }
    
    const recipients = selectedResData
      .map(r => r.customer?.email)
      .filter(email => email)
      .join(', ')
    
    setEmailSubject(`【MMQ】${event?.scenario || ''}の公演について`)
    setEmailBody('')
    setIsEmailModalOpen(true)
  }

  // 一括メール送信
  const sendBulkEmail = async () => {
    if (!emailSubject || !emailBody) {
      alert('件名と本文を入力してください')
      return
    }

    setSendingEmail(true)
    try {
      const selectedResData = reservations.filter(r => selectedReservations.has(r.id))
      const recipients = selectedResData
        .map(r => r.customer?.email)
        .filter(email => email) as string[]

      for (const email of recipients) {
        await supabase.functions.invoke('send-email', {
          body: {
            to: email,
            subject: emailSubject,
            body: emailBody
          }
        })
      }

      alert(`${recipients.length}件のメールを送信しました`)
      setIsEmailModalOpen(false)
      setEmailSubject('')
      setEmailBody('')
      setSelectedReservations(new Set())
    } catch (error) {
      logger.error('メール送信エラー:', error)
      alert('メール送信に失敗しました')
    } finally {
      setSendingEmail(false)
    }
  }

  // キャンセル確認ダイアログを開く
  const openCancelDialog = (reservation: Reservation) => {
    setCancellingReservation(reservation)
    setIsCancelDialogOpen(true)
  }

  // 予約をキャンセル
  const cancelReservation = async () => {
    if (!cancellingReservation) return

    try {
      await reservationApi.updateReservation(cancellingReservation.id, {
        status: 'cancelled',
        cancellation_reason: emailContent.cancellationReason
      })

      // メール送信プレビューを表示
      setEmailContent({
        ...emailContent,
        customerEmail: cancellingReservation.customer?.email || '',
        customerName: cancellingReservation.customer?.name || '',
        scenarioTitle: event?.scenario || '',
        eventDate: event?.date || '',
        startTime: event?.start_time || '',
        endTime: event?.end_time || '',
        participantCount: cancellingReservation.participant_count || 0,
        totalPrice: cancellingReservation.total_price || 0,
        reservationNumber: cancellingReservation.reservation_number || ''
      })
      
      setIsCancelDialogOpen(false)
      setIsEmailConfirmOpen(true)
    } catch (error) {
      logger.error('予約キャンセルエラー:', error)
      alert('予約のキャンセルに失敗しました')
    }
  }

  // キャンセルメール送信
  const sendCancellationEmail = async () => {
    setSendingEmail(true)
    try {
      await supabase.functions.invoke('send-cancellation-confirmation', {
        body: emailContent
      })

      alert('キャンセル通知メールを送信しました')
      setIsEmailConfirmOpen(false)
      setCancellingReservation(null)
      
      // 予約リストを再読み込み
      if (event?.id) {
        await loadReservations(event.id)
      }
    } catch (error) {
      logger.error('メール送信エラー:', error)
      alert('メール送信に失敗しました')
    } finally {
      setSendingEmail(false)
    }
  }

  return {
    reservations,
    loadingReservations,
    expandedReservation,
    selectedReservations,
    isEmailModalOpen,
    setIsEmailModalOpen,
    isEmailConfirmOpen,
    setIsEmailConfirmOpen,
    emailSubject,
    setEmailSubject,
    emailBody,
    setEmailBody,
    sendingEmail,
    emailContent,
    setEmailContent,
    cancellingReservation,
    isCancelDialogOpen,
    setIsCancelDialogOpen,
    toggleReservation,
    toggleReservationSelection,
    prepareBulkEmail,
    sendBulkEmail,
    openCancelDialog,
    cancelReservation,
    sendCancellationEmail,
    loadReservations
  }
}

