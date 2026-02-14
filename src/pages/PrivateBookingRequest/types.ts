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
  scenarioAvailableStores?: string[] // シナリオ対応店舗ID（未設定=全店舗可）
  organizationSlug?: string  // 組織slug（パス方式用）
  onBack: () => void
  onComplete?: () => void
}

