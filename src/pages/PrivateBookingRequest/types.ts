import type { ParticipationCost } from '../ScenarioDetailPage/utils/pricingUtils'
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
  participationCosts?: ParticipationCost[]
  maxParticipants: number
  /** 平日等の公演所要（分）。未指定時は表示・保存計算で180分相当の既定を用いる */
  scenarioDuration?: number
  /** 土日祝の公演所要（分） */
  weekendDuration?: number | null
  selectedTimeSlots: Array<{date: string, slot: TimeSlot}>
  selectedStoreIds: string[]
  stores: any[]
  scenarioAvailableStores?: string[] // シナリオ対応店舗ID（未設定=全店舗可）
  privateBookingTimeSlots?: string[] // 受付可能時間帯（未設定=全時間帯可）
  privateBookingTimeSlotsWeekend?: string[] | null // 土日・祝日の受付可能時間帯（未設定=全時間帯可。平日の設定は流用しない）
  /** 作品ごとの貸切開始時刻（未設定の枠は店舗の営業時間設定） */
  scenarioSlotStartTimes?: unknown
  organizationSlug?: string  // 組織slug（パス方式用）
  groupId?: string  // 貸切グループID（グループからの申請時のみ）
  onBack: () => void
  onComplete?: () => void
}

