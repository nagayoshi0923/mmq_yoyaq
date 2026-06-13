/**
 * 公演操作のうち、保存本体・移動コピー・中止削除に属さない小さな操作群。
 *
 * Phase 4-3 の分割では、巨大な useEventOperations の公開IFを維持したまま
 * 責務ごとにサブフックへ移していく。ここでは公開/仮状態トグル、メモ変換、
 * 参加者数の即時反映を扱う。
 */
import { useCallback, useState } from 'react'
import { scheduleApi } from '@/lib/api'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { createEventHistory, fetchEventSnapshot } from '@/lib/api/eventHistoryApi'
import type { ScheduleEvent } from '@/types/schedule'

interface UseEventMiscProps {
  setEvents: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>
  organizationId: string | null
  fetchSchedule?: () => Promise<void> | void
}

export function useEventMisc({ setEvents, organizationId, fetchSchedule }: UseEventMiscProps) {
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false)
  const [publishingEvent, setPublishingEvent] = useState<ScheduleEvent | null>(null)

  const handleToggleTentative = useCallback(async (event: ScheduleEvent) => {
    try {
      const newStatus = !event.is_tentative

      const tentativeOldSnapshot = organizationId
        ? await fetchEventSnapshot(event.id, organizationId)
        : null

      await scheduleApi.update(event.id, {
        is_tentative: newStatus
      })

      if (organizationId) {
        try {
          const tentativeNewSnapshot = await fetchEventSnapshot(event.id, organizationId)
          const cellTimeSlot =
            (tentativeNewSnapshot?.time_slot as string | null | undefined) ??
            (tentativeOldSnapshot?.time_slot as string | null | undefined) ??
            event.time_slot ??
            null
          void createEventHistory(
            event.id, organizationId, 'update',
            tentativeOldSnapshot ?? { is_tentative: event.is_tentative },
            tentativeNewSnapshot ?? { is_tentative: newStatus },
            { date: event.date, storeId: event.store_id || event.venue, timeSlot: cellTimeSlot }
          )
        } catch (historyError) {
          logger.error('履歴記録エラー（仮状態）:', historyError)
        }
      }

      setEvents(prev => prev.map(e =>
        e.id === event.id ? { ...e, is_tentative: newStatus } : e
      ))
    } catch (error) {
      logger.error('仮状態の更新エラー:', error)
      throw error
    }
  }, [setEvents, organizationId])

  const handleToggleReservation = useCallback(async (event: ScheduleEvent) => {
    if (event.is_private_request) {
      showToast.warning('貸切公演の公開状態は変更できません')
      return
    }

    const isPrivateBooking = event.id.startsWith('private-') ||
                            (event.id.includes('-') && event.id.split('-').length > 5)
    if (isPrivateBooking) {
      showToast.warning('貸切公演の公開状態は変更できません')
      return
    }

    try {
      const newStatus = !event.is_reservation_enabled

      const reservationOldSnapshot = organizationId
        ? await fetchEventSnapshot(event.id, organizationId)
        : null

      await scheduleApi.update(event.id, {
        is_reservation_enabled: newStatus
      })

      if (organizationId) {
        try {
          const reservationNewSnapshot = await fetchEventSnapshot(event.id, organizationId)
          const cellTimeSlot =
            (reservationNewSnapshot?.time_slot as string | null | undefined) ??
            (reservationOldSnapshot?.time_slot as string | null | undefined) ??
            event.time_slot ??
            null
          void createEventHistory(
            event.id, organizationId, newStatus ? 'publish' : 'unpublish',
            reservationOldSnapshot ?? { is_reservation_enabled: event.is_reservation_enabled },
            reservationNewSnapshot ?? { is_reservation_enabled: newStatus },
            { date: event.date, storeId: event.store_id || event.venue, timeSlot: cellTimeSlot }
          )
        } catch (historyError) {
          logger.error('履歴記録エラー（予約受付）:', historyError)
        }
      }

      setEvents(prev => prev.map(e =>
        e.id === event.id ? { ...e, is_reservation_enabled: newStatus } : e
      ))
    } catch (error) {
      logger.error('予約サイト公開状態の更新エラー:', error)
      showToast.error('予約サイト公開状態の更新に失敗しました')
    }
  }, [setEvents, organizationId])

  const handleConfirmPublishToggle = useCallback(async () => {
    if (!publishingEvent) return

    const isPrivateBooking = publishingEvent.is_private_request ||
                            publishingEvent.id.startsWith('private-') ||
                            (publishingEvent.id.includes('-') && publishingEvent.id.split('-').length > 5)
    if (isPrivateBooking) {
      showToast.warning('貸切公演の公開状態は変更できません')
      setIsPublishDialogOpen(false)
      setPublishingEvent(null)
      return
    }

    try {
      const newStatus = !publishingEvent.is_reservation_enabled

      await scheduleApi.update(publishingEvent.id, {
        is_reservation_enabled: newStatus
      })

      setEvents(prev => prev.map(e =>
        e.id === publishingEvent.id ? { ...e, is_reservation_enabled: newStatus } : e
      ))

      setIsPublishDialogOpen(false)
      setPublishingEvent(null)
    } catch (error) {
      logger.error('予約サイト公開状態の更新エラー:', error)
      showToast.error('予約サイト公開状態の更新に失敗しました')
    }
  }, [publishingEvent, setEvents])

  const handleParticipantChange = useCallback((eventId: string, newCount: number) => {
    setEvents(prevEvents =>
      prevEvents.map(event =>
        event.id === eventId
          ? { ...event, current_participants: newCount }
          : event
      )
    )
    logger.log('イベントの参加者数を即座に更新:', { eventId, newCount })
  }, [setEvents])

  return {
    isPublishDialogOpen,
    publishingEvent,
    setIsPublishDialogOpen,
    handleToggleTentative,
    handleToggleReservation,
    handleConfirmPublishToggle,
    handleParticipantChange,
  }
}
