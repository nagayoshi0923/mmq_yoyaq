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
  /** 平日等の公演所要（分）。未指定時は表示・保存計算で180分相当の既定を用いる */
  scenarioDuration?: number
  /** 土日祝の公演所要（分） */
  weekendDuration?: number | null
  selectedTimeSlots: Array<{date: string, slot: TimeSlot}>
  selectedStoreIds: string[]
  stores: any[]
  scenarioAvailableStores?: string[] // シナリオ対応店舗ID（未設定=全店舗可）
  organizationSlug?: string  // 組織slug（パス方式用）
  groupId?: string  // 貸切グループID（グループからの申請時のみ）
  onBack: () => void
  onComplete?: () => void
}

