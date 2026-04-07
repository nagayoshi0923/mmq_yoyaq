import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Loader2, Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

export type GroupMessageRow = {
  id: string
  message: string
  created_at: string
  member_id: string | null
}

const ACTION_LABELS: Record<string, string> = {
  staff_message: '店舗からのお知らせ',
  group_created: 'グループ作成',
  booking_requested: '予約申請',
  schedule_confirmed: '日程確定',
  booking_rejected: '申請却下',
  booking_cancelled: 'キャンセル',
  candidate_dates_added: '候補日程追加',
  pre_reading_notice: '事前読込',
  survey_notice: 'アンケート',
  individual_notice: '個別お知らせ',
  performance_cancelled: '公演キャンセル',
  member_joined: 'メンバー参加',
  character_assignment: '配役確定',
  character_method_selected: '配役方法選択',
}

function parseSystemPayload(raw: string): Record<string, unknown> | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    if (o.type === 'system') return o
  } catch {
    /* plain text */
  }
  return null
}

function formatDateTimeJa(iso: string) {
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function buildAnnouncementSummary(raw: string): {
  kind: string
  headline: string
  detail: string
} | null {
  const p = parseSystemPayload(raw)
  if (!p) return null

  const action = typeof p.action === 'string' ? p.action : ''
  const kind = ACTION_LABELS[action] || (action ? `システム（${action}）` : 'システム通知')

  const title = typeof p.title === 'string' ? p.title : ''
  const body = typeof p.body === 'string' ? p.body : ''
  const message = typeof p.message === 'string' ? p.message : ''

  let headline = title || kind
  let detail = body || message

  if (action === 'candidate_dates_added') {
    const count = typeof p.count === 'number' ? p.count : 0
    headline = title || '候補日程が追加されました'
    detail = body || `候補 ${count} 件`
  } else if (action === 'schedule_confirmed') {
    const d = typeof p.confirmedDate === 'string' ? p.confirmedDate : ''
    const slot = typeof p.confirmedTimeSlot === 'string' ? p.confirmedTimeSlot : ''
    const store = typeof p.storeName === 'string' ? p.storeName : ''
    const parts = [d && `日時: ${d} ${slot}`.trim(), store && `店舗: ${store}`].filter(Boolean)
    detail = [body, parts.join(' / ')].filter(Boolean).join('\n') || detail
  } else if (action === 'individual_notice') {
    const name = typeof p.target_member_name === 'string' ? p.target_member_name : '参加者'
    headline = title || `${name}さんへの個別お知らせ`
    detail = message || body
  } else if (action === 'member_joined') {
    const name = typeof p.memberName === 'string' ? p.memberName : 'メンバー'
    headline = `${name} が参加`
    detail = ''
  } else if (action === 'character_assignment') {
    headline = title || 'キャラクター配役が確定しました'
    detail = Array.isArray(p.body) ? (p.body as string[]).join('\n') : (body || '')
  }

  return { kind, headline, detail: detail.trim() }
}

interface PrivateGroupAnnouncementHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string | null
  scenarioTitle: string
}

/**
 * グループチャットに記録されたシステム系アナウンスの履歴（管理画面用）
 */
export function PrivateGroupAnnouncementHistoryDialog({
  open,
  onOpenChange,
  groupId,
  scenarioTitle,
}: PrivateGroupAnnouncementHistoryDialogProps) {
  const [rows, setRows] = useState<GroupMessageRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !groupId) {
      setRows([])
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('private_group_messages')
          .select('id, message, created_at, member_id')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false })
          .limit(200)

        if (error) throw error
        if (!cancelled) {
          const announcements = (data || []).filter((r) => parseSystemPayload(r.message) !== null)
          setRows(announcements)
        }
      } catch (e) {
        logger.error('アナウンス履歴の取得に失敗', e)
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, groupId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden gap-0 p-0 sm:p-0">
        <DialogHeader className="shrink-0 space-y-1.5 px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 shrink-0" />
            アナウンス履歴
          </DialogTitle>
          <DialogDescription className="text-left">
            {scenarioTitle} — グループに送信されたシステム通知・店舗からのお知らせの一覧です（新しい順）。
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 sm:px-6 sm:pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              読み込み中…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              まだアナウンス（システム通知）の記録がありません。
            </p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
              <ul className="space-y-3 pb-1">
                {rows.map((row) => {
                  const summary = buildAnnouncementSummary(row.message)
                  if (!summary) return null
                  return (
                    <li
                      key={row.id}
                      className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatDateTimeJa(row.created_at)}
                        </span>
                        <Badge variant="secondary" className="text-xs font-normal">
                          {summary.kind}
                        </Badge>
                      </div>
                      <p className="font-medium text-foreground">{summary.headline}</p>
                      {summary.detail ? (
                        <p className="text-muted-foreground whitespace-pre-wrap text-xs leading-relaxed line-clamp-6">
                          {summary.detail}
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
