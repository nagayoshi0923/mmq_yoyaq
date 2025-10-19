/**
 * PrivateBookingRequest関連の型定義
 */

export interface TimeSlot {
  label: string
  startTime: string
  endTime: string
}

export interface PrivateBookingRequestProps {
  scenarioTitle: string
  scenarioId: string
  participationFee: number
  maxParticipants: number
  selectedTimeSlots: Array<{date: string, slot: TimeSlot}>
  selectedStoreIds: string[]
  stores: any[]
  onBack: () => void
  onComplete?: () => void
}

