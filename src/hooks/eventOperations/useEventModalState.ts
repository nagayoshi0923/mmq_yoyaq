/**
 * 公演モーダルとドラッグ開始状態をまとめるサブフック。
 *
 * 保存・移動・削除などの業務処理は持たず、画面状態と URL 復元だけを扱う。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { logger } from '@/utils/logger'
import { getTimeSlot } from '@/utils/scheduleUtils'
import { timeSlotEnToSchedule } from '@/lib/timeSlot'
import type { ScheduleEvent } from '@/types/schedule'

type TimeSlot = 'morning' | 'afternoon' | 'evening'

interface ModalInitialData {
  date: string
  venue: string
  time_slot: string
  suggestedStartTime?: string
}

interface UseEventModalStateProps {
  events: ScheduleEvent[]
}

export function useEventModalState({ events }: UseEventModalStateProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const initializedRef = useRef(false)

  const [isPerformanceModalOpen, setIsPerformanceModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [modalInitialData, setModalInitialData] = useState<ModalInitialData | undefined>(undefined)
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null)

  const [draggedEvent, setDraggedEvent] = useState<ScheduleEvent | null>(null)
  const [dropTarget, setDropTarget] = useState<{ date: string, venue: string, timeSlot: string } | null>(null)
  const [isMoveOrCopyDialogOpen, setIsMoveOrCopyDialogOpen] = useState(false)

  useEffect(() => {
    if (initializedRef.current || events.length === 0) return

    const eventId = searchParams.get('event')
    if (eventId) {
      const event = events.find(e => e.id === eventId)
      if (event) {
        setModalMode('edit')
        setEditingEvent(event)
        setModalInitialData(undefined)
        setIsPerformanceModalOpen(true)
        initializedRef.current = true
        logger.log('📝 URLから公演ダイアログを復元:', eventId)
      }
    } else {
      initializedRef.current = true
    }
  }, [events, searchParams])

  const handleAddPerformance = useCallback((date: string, venue: string, time_slot: TimeSlot) => {
    setModalMode('add')

    let suggestedStartTime: string | undefined = undefined
    const timeSlotJa = timeSlotEnToSchedule(time_slot)

    const sameSlotEvents = events.filter(e =>
      e.date === date &&
      e.venue === venue &&
      !e.is_cancelled &&
      e.time_slot === timeSlotJa
    )

    if (sameSlotEvents.length > 0) {
      const sortedEvents = [...sameSlotEvents].sort((a, b) => {
        const aEnd = a.end_time || '00:00'
        const bEnd = b.end_time || '00:00'
        return bEnd.localeCompare(aEnd)
      })

      const lastEndTime = sortedEvents[0].end_time
      if (lastEndTime) {
        const [endHour, endMinute] = lastEndTime.split(':').map(Number)
        const newHour = endHour + 1

        if (newHour < 24) {
          suggestedStartTime = `${String(newHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`
        }
      }
    }

    setModalInitialData({ date, venue, time_slot, suggestedStartTime })
    setEditingEvent(null)
    setIsPerformanceModalOpen(true)
  }, [events])

  const handleEditPerformance = useCallback((event: ScheduleEvent) => {
    setModalMode('edit')
    setEditingEvent(event)
    setModalInitialData(undefined)
    setIsPerformanceModalOpen(true)

    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      newParams.set('event', event.id)
      return newParams
    }, { replace: true })
  }, [setSearchParams])

  const handleCloseModal = useCallback(async () => {
    setIsPerformanceModalOpen(false)
    setModalInitialData(undefined)
    setEditingEvent(null)

    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      newParams.delete('event')
      return newParams
    }, { replace: true })
  }, [setSearchParams])

  const handleDrop = useCallback((
    droppedEvent: ScheduleEvent,
    targetDate: string,
    targetVenue: string,
    targetTimeSlot: TimeSlot
  ) => {
    const sourceTimeSlot = getTimeSlot(droppedEvent.start_time)
    if (droppedEvent.date === targetDate && droppedEvent.venue === targetVenue && sourceTimeSlot === targetTimeSlot) {
      return
    }

    setDraggedEvent(droppedEvent)
    setDropTarget({ date: targetDate, venue: targetVenue, timeSlot: targetTimeSlot })
    setIsMoveOrCopyDialogOpen(true)
  }, [])

  return {
    isPerformanceModalOpen,
    setIsPerformanceModalOpen,
    modalMode,
    setModalMode,
    modalInitialData,
    setModalInitialData,
    editingEvent,
    setEditingEvent,
    draggedEvent,
    setDraggedEvent,
    dropTarget,
    setDropTarget,
    isMoveOrCopyDialogOpen,
    setIsMoveOrCopyDialogOpen,
    handleAddPerformance,
    handleEditPerformance,
    handleCloseModal,
    handleDrop,
  }
}
