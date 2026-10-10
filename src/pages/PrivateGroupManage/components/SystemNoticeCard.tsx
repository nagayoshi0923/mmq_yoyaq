/**
 * 貸切グループのチャットのお知らせ（システムメッセージ）のうち、表示だけのもの。
 * GroupChat.tsx から見た目を変えずに切り出した（個別お知らせ・配役は GroupChat.tsx に残す）。
 */
import { Button } from '@/components/ui/button'
import { Calendar, CheckCircle2, X, ClipboardList } from 'lucide-react'
import type { PrivateGroupMessage } from '@/types'
import type { CandidateNoticeDate, SystemMessage } from './groupChatMessages'
import { renderMessageWithLinks } from './renderMessageWithLinks'

export const SIMPLE_SYSTEM_MESSAGE_ACTIONS: ReadonlySet<SystemMessage['action']> = new Set(['candidate_dates_added', 'schedule_confirmed', 'pre_reading_notice', 'survey_notice', 'group_created', 'member_joined', 'member_removed', 'booking_requested', 'booking_rejected', 'booking_cancelled', 'staff_message', 'organizer_handover'])

export interface SystemNoticeCardProps {
  systemMsg: SystemMessage
  msg: PrivateGroupMessage
  systemMsgTitles: { candidate_dates_added: string; pre_reading_notice: string; survey_notice: string; performance_cancelled: string }
  getMemberName: (memberId: string | null) => string
  formatDateTime: (dateStr: string) => string
  formatCandidateDate: (dateStr: string, timeSlot: string) => string
  onGoToSchedule?: () => void
  canOpenSurvey: boolean
  onOpenSurvey: () => void
  /** 候補日追加のお知らせの候補日（その後外されたものに印つき）。無ければお知らせのまま出す */
  candidateDates?: CandidateNoticeDate[]
}

export function SystemNoticeCard({ systemMsg, msg, systemMsgTitles, getMemberName, formatDateTime, formatCandidateDate, onGoToSchedule, canOpenSurvey, onOpenSurvey, candidateDates }: SystemNoticeCardProps) {
  // システムメッセージ（候補日追加通知）
  if (systemMsg && systemMsg.action === 'candidate_dates_added') {
    const dates: CandidateNoticeDate[] = candidateDates ?? (systemMsg.dates ?? []).map(d => ({ ...d, deleted: false }))
    return (
      <div key={msg.id} className="flex justify-center my-4">
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
              <Calendar className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-purple-800">
                {systemMsgTitles.candidate_dates_added}（{systemMsg.count}件）
              </p>
              <p className="text-xs text-muted-foreground">
                {getMemberName(msg.member_id)} • {formatDateTime(msg.created_at)}
              </p>
            </div>
          </div>
          {/* 後から候補日を外しても空の白い箱にしない（外したものは「削除済み」、全部外れたら箱を出さない） */}
          {dates.some(d => !d.deleted) && (
            <div className="bg-white rounded-lg p-3 mb-3 space-y-1 border border-purple-100" data-testid="candidate-notice-dates">
              {dates.slice(0, 5).map((d, i) => (
                <div key={i} className={`text-sm ${d.deleted ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {formatCandidateDate(d.date, d.time_slot)}{d.deleted && '（削除済み）'}
                </div>
              ))}
              {dates.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  他 {dates.length - 5} 件
                </p>
              )}
            </div>
          )}
          {onGoToSchedule && (
            <Button
              onClick={onGoToSchedule}
              size="sm"
              variant="outline"
              className="w-full border-purple-300 text-purple-700 hover:bg-purple-50"
            >
              <Calendar className="w-4 h-4 mr-1.5" />
              日程を確認・回答する
            </Button>
          )}
        </div>
      </div>
    )
  }

  // システムメッセージ（日程確定通知）
  if (systemMsg && systemMsg.action === 'schedule_confirmed') {
    return (
      <div key={msg.id} className="flex justify-center my-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-800">
                {systemMsg.title || '日程が確定いたしました'}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(msg.created_at)}
              </p>
            </div>
          </div>
          {systemMsg.confirmedDate && (
            <div className="bg-white rounded-lg p-3 space-y-1 border border-green-100">
              <div className="text-sm text-gray-900">
                <span className="text-gray-500">日時：</span>
                {formatCandidateDate(systemMsg.confirmedDate, systemMsg.confirmedTimeSlot || '')}
              </div>
              {systemMsg.storeName && (
                <div className="text-sm text-gray-900">
                  <span className="text-gray-500">店舗：</span>
                  {systemMsg.storeName}
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-gray-600 mt-2">
            {systemMsg.body || 'ご予約ありがとうございます。当日のご来店をお待ちしております。'}
          </p>
        </div>
      </div>
    )
  }

  // システムメッセージ（事前読み込み通知）
  if (systemMsg && systemMsg.action === 'pre_reading_notice') {
    return (
      <div key={msg.id} className="flex justify-center my-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 bg-amber-600 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">!</span>
            </div>
            <div>
              <p className="text-sm font-medium text-amber-800">
                {systemMsgTitles.pre_reading_notice}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(msg.created_at)}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-amber-100 overflow-hidden">
            <p className="text-sm text-gray-700 whitespace-pre-wrap break-all">
              {renderMessageWithLinks(systemMsg.message || '')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // システムメッセージ（アンケート回答のお願い）
  if (systemMsg && systemMsg.action === 'survey_notice') {
    return (
      <div key={msg.id} className="flex justify-center my-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
              <ClipboardList className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-800">
                {systemMsgTitles.survey_notice}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(msg.created_at)}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-blue-100 space-y-3 overflow-hidden">
            <p className="text-sm text-gray-700 whitespace-pre-wrap break-all">
              {renderMessageWithLinks(systemMsg.message || '')}
            </p>
            {canOpenSurvey && (
              <Button
                onClick={onOpenSurvey}
                className="w-full bg-blue-600 hover:bg-blue-700"
                size="sm"
              >
                <ClipboardList className="w-4 h-4 mr-2" />
                アンケートに回答する
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // システムメッセージ（グループ作成）
  if (systemMsg && systemMsg.action === 'group_created') {
    return (
      <div key={msg.id} className="flex justify-center my-4">
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 w-full max-w-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-purple-800">
                {systemMsg.title || '貸切リクエストグループを作成しました'}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(msg.created_at)}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            {systemMsg.body || '招待リンクを共有して、参加メンバーを招待してください。'}
          </p>
          {(systemMsg.note || !systemMsg.body) && (
            <p className="text-xs text-gray-500 mt-1">
              {systemMsg.note || '※ 全員を招待していなくても日程確定は可能ですが、当日は参加人数全員でお越しください。'}
            </p>
          )}
        </div>
      </div>
    )
  }

  // システムメッセージ（メンバー参加）
  if (systemMsg && systemMsg.action === 'member_joined') {
    // memberId が保存されていれば動的に名前を解決（ニックネーム更新・退出に追従）
    // 退出済みメンバーは「退出したメンバー」と表示される
    const displayName = systemMsg.memberId
      ? getMemberName(systemMsg.memberId)
      : (systemMsg.memberName || '退出したメンバー')
    return (
      <div key={msg.id} className="flex justify-center my-2">
        <div className="bg-gray-100 rounded-full px-4 py-1.5">
          <p className="text-xs text-gray-600">
            <span className="font-medium">{displayName}</span> が参加しました
          </p>
        </div>
      </div>
    )
  }

  // システムメッセージ（主催者がメンバーを外した。外れた人の行は無いので保存した名前を出す）
  if (systemMsg && systemMsg.action === 'member_removed') {
    return (
      <div key={msg.id} className="flex justify-center my-2">
        <div className="bg-muted rounded-full px-4 py-1.5">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">{systemMsg.memberName || 'メンバー'}</span> さんがグループから外れました
          </p>
        </div>
      </div>
    )
  }

  // システムメッセージ（予約申込）
  if (systemMsg && systemMsg.action === 'booking_requested') {
    return (
      <div key={msg.id} className="flex justify-center my-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 w-full max-w-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-800">
                {systemMsg.title || '貸切リクエストを送信しました'}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(msg.created_at)}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            {systemMsg.body || '店舗より日程確定のご連絡をいたしますので、しばらくお待ちください。'}
          </p>
        </div>
      </div>
    )
  }

  // システムメッセージ（却下通知）
  if (systemMsg && systemMsg.action === 'booking_rejected') {
    return (
      <div key={msg.id} className="flex justify-center my-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 w-full max-w-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center">
              <X className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-red-800">
                {systemMsg.title || '日程リクエストが却下されました'}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(msg.created_at)}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-2 whitespace-pre-wrap">
            {systemMsg.body || '店舗の都合がつかず、ご希望の日程でのご予約をお受けすることができませんでした。お手数ですが、別の候補日を選択のうえ再度お申し込みください。'}
          </p>
          {systemMsg.rejectionReason && (
            <div className="mt-2 bg-white rounded border border-red-100 px-3 py-2">
              <p className="text-xs text-gray-700 whitespace-pre-wrap">{systemMsg.rejectionReason}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // システムメッセージ（キャンセル通知）
  if (systemMsg && systemMsg.action === 'booking_cancelled') {
    return (
      <div key={msg.id} className="flex justify-center my-4">
        <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 w-full max-w-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center">
              <X className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">
                {systemMsg.title || 'ご予約がキャンセルされました'}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(msg.created_at)}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            {systemMsg.body || '誠に申し訳ございませんが、やむを得ない事情によりご予約がキャンセルとなりました。'}
          </p>
        </div>
      </div>
    )
  }

  // システムメッセージ（主催者の引き継ぎ: 成立・お断り・取り消し・期限切れ）
  if (systemMsg && systemMsg.action === 'organizer_handover') {
    const accepted = systemMsg.result === 'accepted'
    return (
      <div key={msg.id} className="flex justify-center my-3" data-testid="organizer-handover-notice">
        <div className={`${accepted ? 'bg-purple-50 border-purple-200' : 'bg-muted border-border'} border rounded-lg p-3 w-full max-w-sm`}>
          <p className={`text-sm font-medium ${accepted ? 'text-purple-800' : 'text-foreground'}`}>
            {systemMsg.title || '主催者の引き継ぎ'}
          </p>
          <p className="text-xs text-muted-foreground">{formatDateTime(msg.created_at)}</p>
          {systemMsg.body && <p className="text-xs text-foreground mt-1.5 whitespace-pre-wrap">{systemMsg.body}</p>}
        </div>
      </div>
    )
  }

  // システムメッセージ（店舗からのお知らせ）
  if (systemMsg && systemMsg.action === 'staff_message') {
    return (
      <div key={msg.id} className="flex justify-center my-3">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 w-full max-w-sm">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 bg-amber-600 rounded-full flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] leading-none">📢</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-amber-800">
                {systemMsg.title || '店舗からのお知らせ'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {formatDateTime(msg.created_at)}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-lg p-2.5 mt-2 border border-amber-100 overflow-hidden">
            <p className="text-sm text-gray-900 whitespace-pre-wrap break-all leading-relaxed">
              {renderMessageWithLinks(systemMsg.body || '')}
            </p>
          </div>
          <p className="mt-2 px-0.5 text-[10px] text-muted-foreground leading-snug">
            ※ 返信は店舗に届きません。ご連絡は「店舗に問い合わせる」からお願いします。
          </p>
        </div>
      </div>
    )
  }
  return null
}
