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
  /** 平日等の公演所要（分）。参考値。候補の終了時刻は DB の空き判定が返した値を使い、これで計算し直さない */
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
  /** 申込を送れたとき（成功画面を出すとき）に 1 回。呼び出し側の預かり（B29 の貸切タブの選択など）を消すのに使う */
  onSubmitted?: () => void
  /** 確認画面で希望店舗を選び直して確定したとき（URL の store を合わせる） */
  onStoreIdsChange?: (storeIds: string[]) => void
}

