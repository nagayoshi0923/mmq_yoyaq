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
  /** 料金が未確定（組織の独自休日を読み込み中・読み込めなかった）ときに金額の代わりに出す文。null なら金額を出す */
  feeUnknownText?: string | null
  initialParticipantCount?: number
  organizationSlug?: string  // 組織slug（パス方式用）
  onBack: () => void
  onComplete?: () => void
}

export interface CustomerInfo {
  name: string
  email: string
  phone: string
}

