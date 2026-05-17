import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Loader2, MessageSquare, CheckCircle2, X, Calendar, Users, ClipboardList, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

export type GroupMessageRow = {
  id: string
  message: string
  created_at: string
  member_id: string | null
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

function parsePayload(raw: string): Record<string, unknown> | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    if (o.type === 'system') return o
  } catch {
    /* plain text */
  }
  return null
}

interface SystemMsgProps {
  payload: Record<string, unknown>
  createdAt: string
  senderName: string
}

function SystemMessageCard({ payload, createdAt, senderName }: SystemMsgProps) {
  const action = typeof payload.action === 'string' ? payload.action : ''
  const title = typeof payload.title === 'string' ? payload.title : ''
  const body = typeof payload.body === 'string' ? payload.body : ''
  const message = typeof payload.message === 'string' ? payload.message : ''
  const ts = formatDateTimeJa(createdAt)

  // メンバー参加
  if (action === 'member_joined') {
    const name = typeof payload.memberName === 'string' ? payload.memberName : senderName
    return (
      <div className="flex justify-center my-2">
        <div className="bg-gray-100 rounded-full px-4 py-1.5">
          <p className="text-xs text-gray-600">
            <span className="font-medium">{name}</span> が参加しました
            <span className="ml-2 text-[10px] text-gray-400">{ts}</span>
          </p>
        </div>
      </div>
    )
  }

  // グループ作成
  if (action === 'group_created') {
    return (
      <div className="flex justify-center my-3">
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 w-full max-w-sm">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-3 h-3 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-purple-800">{title || 'グループ作成'}</p>
              <p className="text-[10px] text-muted-foreground">{ts}</p>
            </div>
          </div>
          {body && <p className="text-xs text-gray-600 mt-2">{body}</p>}
        </div>
      </div>
    )
  }

  // 予約申込
  if (action === 'booking_requested') {
    return (
      <div className="flex justify-center my-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 w-full max-w-sm">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-3 h-3 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-blue-800">{title || '予約申請'}</p>
              <p className="text-[10px] text-muted-foreground">{ts}</p>
            </div>
          </div>
          {body && <p className="text-xs text-gray-600 mt-2">{body}</p>}
        </div>
      </div>
    )
  }

  // 日程確定
  if (action === 'schedule_confirmed') {
    const confirmedDate = typeof payload.confirmedDate === 'string' ? payload.confirmedDate : ''
    const confirmedTimeSlot = typeof payload.confirmedTimeSlot === 'string' ? payload.confirmedTimeSlot : ''
    const storeName = typeof payload.storeName === 'string' ? payload.storeName : ''
    return (
      <div className="flex justify-center my-3">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 bg-green-600 rounded-full flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-3 h-3 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-green-800">{title || '日程確定'}</p>
              <p className="text-[10px] text-muted-foreground">{ts}</p>
            </div>
          </div>
          {confirmedDate && (
            <div className="bg-white rounded-lg p-2 border border-green-100 space-y-0.5">
              <p className="text-xs text-gray-900">
                <span className="text-gray-500">日時：</span>
                {confirmedDate.replace(/-/g, '/')} {confirmedTimeSlot}
              </p>
              {storeName && (
                <p className="text-xs text-gray-900">
                  <span className="text-gray-500">店舗：</span>
                  {storeName}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // 却下
  if (action === 'booking_rejected') {
    const rejectionReason = typeof payload.rejectionReason === 'string' ? payload.rejectionReason : ''
    return (
      <div className="flex justify-center my-3">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 w-full max-w-sm">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-red-600 rounded-full flex items-center justify-center shrink-0">
              <X className="w-3 h-3 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-red-800">{title || '申請却下'}</p>
              <p className="text-[10px] text-muted-foreground">{ts}</p>
            </div>
          </div>
          {body && <p className="text-xs text-gray-600 mt-2">{body}</p>}
          {rejectionReason && (
            <div className="mt-2 bg-white rounded border border-red-100 px-2 py-1.5">
              <p className="text-xs text-gray-700 whitespace-pre-wrap">{rejectionReason}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // キャンセル・公演キャンセル
  if (action === 'booking_cancelled' || action === 'performance_cancelled') {
    return (
      <div className="flex justify-center my-3">
        <div className="bg-gray-100 border border-gray-300 rounded-lg p-3 w-full max-w-sm">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-gray-600 rounded-full flex items-center justify-center shrink-0">
              <X className="w-3 h-3 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-800">{title || 'キャンセル'}</p>
              <p className="text-[10px] text-muted-foreground">{ts}</p>
            </div>
          </div>
          {body && <p className="text-xs text-gray-600 mt-2">{body}</p>}
        </div>
      </div>
    )
  }

  // 店舗からのお知らせ
  if (action === 'staff_message') {
    const text = body || message
    return (
      <div className="flex justify-center my-3">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 w-full max-w-sm">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-5 h-5 bg-amber-600 rounded-full flex items-center justify-center shrink-0">
              <span className="text-white text-[9px] leading-none">📢</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-amber-800">{title || '店舗からのお知らせ'}</p>
              <p className="text-[10px] text-muted-foreground">{ts}</p>
            </div>
          </div>
          {text && (
            <div className="bg-white rounded-lg p-2 border border-amber-100">
              <p className="text-xs text-gray-900 whitespace-pre-wrap break-words">{text}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // 事前読込通知
  if (action === 'pre_reading_notice') {
    return (
      <div className="flex justify-center my-3">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 bg-amber-600 rounded-full flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] font-bold">!</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-amber-800">事前読み込みについて</p>
              <p className="text-[10px] text-muted-foreground">{ts}</p>
            </div>
          </div>
          {message && (
            <div className="bg-white rounded-lg p-2 border border-amber-100">
              <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{message}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // アンケート通知
  if (action === 'survey_notice') {
    return (
      <div className="flex justify-center my-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
              <ClipboardList className="w-3 h-3 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-blue-800">アンケートのご協力のお願い</p>
              <p className="text-[10px] text-muted-foreground">{ts}</p>
            </div>
          </div>
          {message && (
            <div className="bg-white rounded-lg p-2 border border-blue-100">
              <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{message}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // 個別お知らせ
  if (action === 'individual_notice') {
    const targetName = typeof payload.target_member_name === 'string' ? payload.target_member_name : '参加者'
    return (
      <div className="flex justify-center my-3">
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] font-bold">!</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-indigo-800">{targetName}さんへの個別お知らせ</p>
              <p className="text-[10px] text-muted-foreground">{ts}</p>
            </div>
          </div>
          {message && (
            <div className="bg-white rounded-lg p-2 border border-indigo-100">
              <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{message}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // 候補日程追加
  if (action === 'candidate_dates_added') {
    const count = typeof payload.count === 'number' ? payload.count : 0
    return (
      <div className="flex justify-center my-3">
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 w-full max-w-sm">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center shrink-0">
              <Calendar className="w-3 h-3 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-purple-800">候補日程 {count} 件追加</p>
              <p className="text-[10px] text-muted-foreground">{ts} · {senderName}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 配役関連
  if (action === 'character_assignment' || action === 'character_method_selected') {
    const bodyText = Array.isArray(payload.body) ? (payload.body as string[]).join('\n') : body
    return (
      <div className="flex justify-center my-3">
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center shrink-0">
              <Users className="w-3 h-3 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-purple-800">
                {title || (action === 'character_assignment' ? 'キャラクター配役確定' : '配役方法選択')}
              </p>
              <p className="text-[10px] text-muted-foreground">{ts}</p>
            </div>
          </div>
          {bodyText && (
            <div className="bg-white rounded-lg p-2 border border-purple-100">
              <p className="text-xs text-gray-700 whitespace-pre-wrap">{bodyText}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // その他のシステムメッセージ（フォールバック）
  const fallbackText = title || body || message || action
  return (
    <div className="flex justify-center my-2">
      <div className="flex items-center gap-2 bg-muted/50 rounded-full px-3 py-1.5 max-w-[90%]">
        <AlertCircle className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">{fallbackText}</span>
        <span className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums">{ts}</span>
      </div>
    </div>
  )
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
            {scenarioTitle} — 読み取り専用
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
              <div className="space-y-1 pb-1">
                {grouped.map(group => (
                  <div key={group.dateKey}>
                    {/* 日付セパレーター */}
                    <div className="flex items-center gap-2 my-3">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs text-muted-foreground">{group.dateLabel}</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    <div className="space-y-1">
                      {group.messages.map(row => {
                        const payload = parsePayload(row.message)
                        const senderName = row.member_id
                          ? (memberNames.get(row.member_id) || '退出したメンバー')
                          : 'スタッフ'

                        if (payload) {
                          return (
                            <SystemMessageCard
                              key={row.id}
                              payload={payload}
                              createdAt={row.created_at}
                              senderName={senderName}
                            />
                          )
                        }

                        // テキストメッセージ
                        return (
                          <div key={row.id} className="flex gap-2 items-start">
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
                          </div>
                        )
                      })}
                    </div>
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
