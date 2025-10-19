/**
 * BookingConfirmation関連の型定義
 */

export interface BookingConfirmationProps {
  eventId: string
  scenarioTitle: string
  scenarioId: string
  storeId?: string
  eventDate: string
  startTime: string
  endTime: string
  storeName: string
  storeAddress?: string
  storeColor?: string
  maxParticipants: number
  currentParticipants: number
  participationFee: number
  initialParticipantCount?: number
  onBack: () => void
  onComplete?: () => void
}

export interface CustomerInfo {
  name: string
  email: string
  phone: string
}

