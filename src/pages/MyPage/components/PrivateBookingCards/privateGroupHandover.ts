/**
 * 主催者の引き継ぎ（段階 3、案 B）の表示用の小さな部品。
 * 仕様の正本: docs/product-spec/マイページ改修_2026-10.md「段階 3」
 */
import { formatJstMonthDay, formatJstTime } from '@/utils/jstDate'

/** 進行中の引き継ぎ依頼（マイページのカード・メンバー管理シート・操作メニューで使う） */
export interface PrivateGroupHandoverInfo {
  id: string
  fromName: string
  toName: string
  toMemberId: string | null
  expiresAt: string
  /** 自分が宛先（新主催者になる人） */
  isRecipient: boolean
}

/** private_group_handover_mine の 1 行 */
export interface MyHandoverRow {
  id: string
  group_id: string
  from_name: string
  to_name: string
  to_member_id: string | null
  expires_at: string
  requested_at: string
  is_recipient: boolean
}

export function toHandoverInfo(row: Pick<MyHandoverRow, 'id' | 'from_name' | 'to_name' | 'to_member_id' | 'expires_at' | 'is_recipient'>): PrivateGroupHandoverInfo {
  return {
    id: row.id,
    fromName: row.from_name,
    toName: row.to_name,
    toMemberId: row.to_member_id,
    expiresAt: row.expires_at,
    isRecipient: row.is_recipient,
  }
}

/** 期限の表示「10/12(月) 21:00」 */
export function formatHandoverDeadline(expiresAt: string): string {
  return `${formatJstMonthDay(expiresAt, true)} ${formatJstTime(expiresAt)}`
}

/** 元主催者のカードのラベル */
export function handoverWaitingLabel(handover: PrivateGroupHandoverInfo): string {
  return `${handover.toName}さんの同意待ち（主催者の引き継ぎ）`
}

/** 「主催者にする」の確認文 */
export function handoverRequestConfirmText(name: string) {
  return {
    title: `${name}さんを主催者にしますか？`,
    message: `${name}さんに主催者の引き継ぎを依頼します。${name}さんが同意するまで、あなたが主催者のままです。依頼の期限は 72 時間です。`,
    confirmLabel: '引き継ぎを依頼する',
  }
}

/** 「依頼を取り消す」の確認文 */
export function handoverCancelConfirmText(name: string) {
  return {
    title: '引き継ぎの依頼を取り消しますか？',
    message: `${name}さんへの主催者の引き継ぎ依頼を取り消します。${name}さんにもお知らせが届きます。`,
    confirmLabel: '依頼を取り消す',
  }
}

/** 「引き継がない」の確認文 */
export function handoverDeclineConfirmText(fromName: string) {
  return {
    title: '主催者を引き継がずに断りますか？',
    message: `${fromName}さんからの主催者の引き継ぎ依頼を断ります。${fromName}さんが主催者のままです。${fromName}さんにもお知らせが届きます。`,
    confirmLabel: '引き継がない',
  }
}

/** メンバー管理シートで「主催者にする」を出す行か。会員（アカウントあり）の自分以外のメンバーだけ。依頼中は誰にも出さない */
export function canRequestHandoverTo(
  row: { id: string; role: 'organizer' | 'member' | 'guest' },
  myMemberId: string | null,
  handover: PrivateGroupHandoverInfo | null,
): boolean {
  return row.role === 'member' && row.id !== myMemberId && !handover
}
