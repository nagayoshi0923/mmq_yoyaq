/**
 * 貸切の「操作」メニューの中身（状態と立場で出し分け）と、赤い操作の確認文。
 * マイページの貸切カードとグループ画面の歯車で同じものを使う。
 * 仕様の正本: docs/product-spec/マイページ改修_2026-10.md「段階 2」
 */
import { formatJstMonthDay } from '@/utils/jstDate'

/** 申込の段階。申込前（人集め中・日程調整中）／店舗の返事待ち（申込済み）／確定後 */
export type PrivateBookingPhase = 'pre_request' | 'requested' | 'confirmed'

export type PrivateBookingMenuItemId =
  | 'copy_invite'
  | 'edit_dates'
  | 'edit_store'
  | 'manage_members'
  | 'cancel_handover'
  | 'answer_dates'
  | 'view_survey'
  | 'contact_store'
  | 'close_group'
  | 'withdraw'
  | 'cancel'
  | 'leave'

export interface PrivateBookingMenuItem {
  id: PrivateBookingMenuItemId
  label: string
  /** 赤い（取り消せない）操作 */
  danger: boolean
}

export interface PrivateBookingMenuContext {
  isOrganizer: boolean
  phase: PrivateBookingPhase
  /** グループがある（グループの無い旧い貸切予約は false） */
  hasGroup: boolean
  /** 紐づく申込・予約がある（取り下げ・キャンセルの対象） */
  hasReservation: boolean
  /** 公演前アンケートがある（確定後のみ意味がある） */
  hasSurvey: boolean
  /** 自分が未回答の候補日がある（メンバーのみ） */
  hasUnansweredDates: boolean
  /** 自分（主催者）が主催者の引き継ぎを依頼中（段階 3） */
  hasPendingHandover?: boolean
}

const LABELS: Record<PrivateBookingMenuItemId, string> = {
  copy_invite: '招待リンクをコピー',
  edit_dates: '候補日を追加・編集',
  edit_store: '希望店舗を変更',
  manage_members: 'メンバーを管理',
  cancel_handover: '引き継ぎの依頼を取り消す',
  answer_dates: '日程に回答する',
  view_survey: '事前配役アンケートを見る',
  contact_store: '店舗に問い合わせる',
  close_group: 'グループを閉じる',
  withdraw: '申込を取り下げる',
  cancel: 'キャンセル',
  leave: 'グループから抜ける',
}

const DANGER: ReadonlySet<PrivateBookingMenuItemId> = new Set(['close_group', 'withdraw', 'cancel', 'leave'])

/** グループと申込の状態から段階を決める。予約の状態はグループ行の更新遅れを補う */
export function privateBookingPhase(groupStatus: string | null | undefined, reservationStatus?: string | null): PrivateBookingPhase {
  if (groupStatus === 'confirmed' || ['confirmed', 'checked_in', 'completed'].includes(reservationStatus ?? '')) return 'confirmed'
  if (groupStatus === 'booking_requested' || ['pending', 'pending_gm', 'gm_confirmed', 'pending_store'].includes(reservationStatus ?? '')) return 'requested'
  return 'pre_request'
}

/** 問い合わせ本文などに入れる「いまの状態」 */
export function privateBookingStatusLabel(phase: PrivateBookingPhase, confirmedDate?: string | null): string {
  if (phase === 'confirmed') return confirmedDate ? `確定（${formatJstMonthDay(confirmedDate, true)} 開催）` : '確定'
  if (phase === 'requested') return '申込済み・店舗の返事待ち'
  return '申込前（人集め中・日程調整中）'
}

/** メニューの中身。並びは上から表示順。赤い操作は常に最後に 1 つだけ */
export function buildPrivateBookingMenu(ctx: PrivateBookingMenuContext): PrivateBookingMenuItem[] {
  const ids: PrivateBookingMenuItemId[] = []
  const add = (id: PrivateBookingMenuItemId, when = true) => { if (when) ids.push(id) }

  if (ctx.isOrganizer) {
    add('copy_invite', ctx.hasGroup)
    if (ctx.phase === 'pre_request') {
      add('edit_dates', ctx.hasGroup)
      add('edit_store', ctx.hasGroup)
    }
    add('manage_members', ctx.hasGroup)
    add('cancel_handover', ctx.hasGroup && ctx.hasPendingHandover === true)
    add('view_survey', ctx.phase === 'confirmed' && ctx.hasGroup && ctx.hasSurvey)
    add('contact_store')
    if (ctx.phase === 'pre_request') add('close_group', ctx.hasGroup)
    if (ctx.phase === 'requested') add('withdraw', ctx.hasReservation)
    if (ctx.phase === 'confirmed') add('cancel', ctx.hasReservation)
  } else {
    add('copy_invite', ctx.hasGroup)
    add('answer_dates', ctx.phase === 'pre_request' && ctx.hasUnansweredDates)
    add('view_survey', ctx.phase === 'confirmed' && ctx.hasSurvey)
    add('contact_store')
    add('leave', ctx.hasGroup)
  }
  return ids.map(id => ({ id, label: LABELS[id], danger: DANGER.has(id) }))
}

export type PrivateBookingDangerAction = 'close_group' | 'withdraw' | 'cancel' | 'leave'

export interface PrivateBookingImpact {
  /** 自分以外の参加メンバーの人数 */
  otherMembers: number
  /** 有効な候補日の件数 */
  candidateDates: number
  /** 確定した公演日（YYYY-MM-DD） */
  confirmedDate?: string | null
  /** 申込の段階（抜けるときに店舗へ伝わるかの文言に使う） */
  phase?: PrivateBookingPhase
}

export interface PrivateBookingConfirmText {
  title: string
  message: string
  confirmLabel: string
}

function notifyText(otherMembers: number): string {
  return otherMembers > 0 ? `メンバー ${otherMembers} 名に知らせます。` : 'ほかのメンバーはいません。'
}

/** 赤い操作の確認文。影響を数字で見せる */
export function privateBookingConfirmText(action: PrivateBookingDangerAction, impact: PrivateBookingImpact): PrivateBookingConfirmText {
  switch (action) {
    case 'close_group':
      return {
        title: 'グループを閉じますか？',
        message: `${notifyText(impact.otherMembers)}候補日 ${impact.candidateDates} 件と日程の回答は記録として残りますが、閉じたグループは元に戻せません。`,
        confirmLabel: 'グループを閉じる',
      }
    case 'withdraw':
      return {
        title: '申込を取り下げますか？',
        message: `店舗への申込を取り消し、グループも閉じます。${notifyText(impact.otherMembers)}日程確定前なのでキャンセル料はかかりません。取り下げは元に戻せません。`,
        confirmLabel: '申込を取り下げる',
      }
    case 'cancel': {
      const when = impact.confirmedDate ? `${formatJstMonthDay(impact.confirmedDate, true)}の` : ''
      return {
        title: '貸切をキャンセルしますか？',
        message: `${when}貸切をキャンセルし、グループも閉じます。${notifyText(impact.otherMembers)}キャンセルは元に戻せません。`,
        confirmLabel: 'キャンセルする',
      }
    }
    case 'leave':
      return {
        title: 'グループから抜けますか？',
        message: `あなたの日程の回答は消え、このグループのチャットや日程は見られなくなります。参加メンバーは ${impact.otherMembers + 1} 名から ${impact.otherMembers} 名になります。${leaveStoreNotice(impact.phase)}`,
        confirmLabel: 'グループから抜ける',
      }
  }
}

/** 申込済み・確定後にメンバーが抜ける・外れると、店舗に人数変更として伝わる */
export function leaveStoreNotice(phase: PrivateBookingPhase | undefined): string {
  return phase === 'requested' || phase === 'confirmed' ? '店舗に人数変更として伝わります。' : ''
}

/** メンバーを外す確認文。申込済み・確定後は店舗に人数変更として伝わる */
export function removeMemberConfirmText(name: string, phase: PrivateBookingPhase): PrivateBookingConfirmText {
  const store = leaveStoreNotice(phase)
  return {
    title: `${name}さんを外しますか？`,
    message: `${name}さんをグループから外しますか？ この方の日程回答は消えます。本人にはチャットで知らせます。${store}`,
    confirmLabel: '外す',
  }
}

export interface PrivateGroupInquiryInfo {
  organizationId: string | null
  /** 予約番号（申込前は無い） */
  reservationNumber: string | null
  title: string
  /** いまの状態（例「人集め中」「店舗の返事待ち」「確定 10/25(土)」） */
  statusLabel: string
  inviteCode: string | null
}

/** 問い合わせ本文の初期値。予約情報を先頭に入れ、その下にお客様が書く欄を空けておく */
export function buildInquiryMessage(info: PrivateGroupInquiryInfo): string {
  const lines = ['【予約情報】']
  if (info.reservationNumber) lines.push(`予約番号: ${info.reservationNumber}`)
  lines.push(`作品: ${info.title || '-'}`)
  lines.push(`状態: ${info.statusLabel}`)
  if (info.inviteCode) lines.push(`招待コード: ${info.inviteCode}`)
  lines.push('', '【お問い合わせ内容】', '')
  return lines.join('\n')
}
