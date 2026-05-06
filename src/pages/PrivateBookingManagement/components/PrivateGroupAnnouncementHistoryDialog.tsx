import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Loader2, MessageSquare } from 'lucide-react'
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
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatDateJa(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

function toDateKey(iso: string) {
  return iso.slice(0, 10)
}

function buildSystemSummary(raw: string): { kind: string; text: string } | null {
  const p = parseSystemPayload(raw)
  if (!p) return null

  const action = typeof p.action === 'string' ? p.action : ''
  const kind = ACTION_LABELS[action] || (action ? `システム（${action}）` : 'システム通知')

  const title = typeof p.title === 'string' ? p.title : ''
  const body = typeof p.body === 'string' ? p.body : ''
  const message = typeof p.message === 'string' ? p.message : ''

  let text = title || body || message || kind

  if (action === 'candidate_dates_added') {
    const count = typeof p.count === 'number' ? p.count : 0
    text = `候補日程 ${count} 件追加`
  } else if (action === 'schedule_confirmed') {
    const d = typeof p.confirmedDate === 'string' ? p.confirmedDate : ''
    const slot = typeof p.confirmedTimeSlot === 'string' ? p.confirmedTimeSlot : ''
    const store = typeof p.storeName === 'string' ? p.storeName : ''
    text = [d && `${d} ${slot}`.trim(), store].filter(Boolean).join(' / ') || title || '日程確定'
  } else if (action === 'individual_notice') {
    const name = typeof p.target_member_name === 'string' ? p.target_member_name : '参加者'
    text = `${name}さんへ: ${message || body}`
  } else if (action === 'member_joined') {
    const name = typeof p.memberName === 'string' ? p.memberName : 'メンバー'
    text = `${name} が参加`
  } else if (action === 'character_assignment') {
    text = Array.isArray(p.body) ? (p.body as string[]).join(' / ') : (title || '配役確定')
  } else if (action === 'staff_message') {
    text = body || message
  }

  return { kind, text: text.trim() }
}

interface PrivateGroupAnnouncementHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string | null
  scenarioTitle: string
}

export function PrivateGroupAnnouncementHistoryDialog({
  open,
  onOpenChange,
  groupId,
  scenarioTitle,
}: PrivateGroupAnnouncementHistoryDialogProps) {
  const [rows, setRows] = useState<GroupMessageRow[]>([])
  const [memberNames, setMemberNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !groupId) {
      setRows([])
      setMemberNames(new Map())
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [messagesResult, membersResult] = await Promise.all([
          supabase
            .from('private_group_messages')
            .select('id, message, created_at, member_id')
            .eq('group_id', groupId)
            .order('created_at', { ascending: true })
            .limit(500),
          supabase
            .from('private_group_members')
            .select('id, user_id, guest_name')
            .eq('group_id', groupId),
        ])

        if (messagesResult.error) throw messagesResult.error

        const members = membersResult.data || []
        const userIds = members.map(m => m.user_id).filter(Boolean) as string[]

        const nameMap = new Map<string, string>()

        if (userIds.length > 0) {
          const { data: customers } = await supabase
            .from('customers')
            .select('user_id, name, nickname')
            .in('user_id', userIds)
          ;(customers || []).forEach((c: any) => {
            nameMap.set(c.user_id, c.nickname || c.name || '')
          })
        }

        const memberNameMap = new Map<string, string>()
        members.forEach((m: any) => {
          const name = m.user_id
            ? (nameMap.get(m.user_id) || m.guest_name || '参加者')
            : (m.guest_name || 'ゲスト')
          memberNameMap.set(m.id, name)
        })

        if (!cancelled) {
          setRows(messagesResult.data || [])
          setMemberNames(memberNameMap)
        }
      } catch (e) {
        logger.error('グループログの取得に失敗', e)
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, groupId])

  useEffect(() => {
    if (!loading && rows.length > 0) {
      bottomRef.current?.scrollIntoView()
    }
  }, [loading, rows.length])

  // 日付ごとにグループ化
  const grouped: { dateKey: string; dateLabel: string; messages: GroupMessageRow[] }[] = []
  for (const row of rows) {
    const key = toDateKey(row.created_at)
    const last = grouped[grouped.length - 1]
    if (!last || last.dateKey !== key) {
      grouped.push({ dateKey: key, dateLabel: formatDateJa(row.created_at), messages: [row] })
    } else {
      last.messages.push(row)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden gap-0 p-0 sm:p-0">
        <DialogHeader className="shrink-0 space-y-1.5 px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 shrink-0" />
            グループログ
          </DialogTitle>
          <DialogDescription className="text-left">
            {scenarioTitle} — グループ内の全メッセージを時系列で表示します。
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
              まだメッセージがありません。
            </p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
              <div className="space-y-4 pb-1">
                {grouped.map(group => (
                  <div key={group.dateKey}>
                    {/* 日付セパレーター */}
                    <div className="flex items-center gap-2 my-3">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs text-muted-foreground">{group.dateLabel}</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    <ul className="space-y-2">
                      {group.messages.map(row => {
                        const sys = buildSystemSummary(row.message)

                        if (sys) {
                          // システムメッセージ
                          return (
                            <li key={row.id} className="flex justify-center">
                              <div className="flex items-center gap-2 bg-muted/50 rounded-full px-3 py-1.5 max-w-[90%]">
                                <Badge variant="secondary" className="text-[10px] font-normal shrink-0">
                                  {sys.kind}
                                </Badge>
                                <span className="text-xs text-muted-foreground truncate">{sys.text}</span>
                                <span className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums">
                                  {formatDateTimeJa(row.created_at)}
                                </span>
                              </div>
                            </li>
                          )
                        }

                        // テキストメッセージ
                        const senderName = row.member_id
                          ? (memberNames.get(row.member_id) || '退出したメンバー')
                          : 'スタッフ'

                        return (
                          <li key={row.id} className="flex gap-2 items-start">
                            <div className="flex-1 rounded-lg border bg-white px-3 py-2 text-sm">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-medium text-xs text-foreground">{senderName}</span>
                                <span className="text-[10px] text-muted-foreground tabular-nums">
                                  {formatDateTimeJa(row.created_at)}
                                </span>
                              </div>
                              <p className="text-foreground whitespace-pre-wrap break-words leading-relaxed">
                                {row.message}
                              </p>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
