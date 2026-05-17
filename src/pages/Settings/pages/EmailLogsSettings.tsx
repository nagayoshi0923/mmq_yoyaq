import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search, ChevronDown, ChevronUp, ExternalLink, FileText, Filter } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { SectionTitle } from '@/components/settings/SectionTitle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

// ─── 型 ──────────────────────────────────────────────────────────────────────

type EmailLogStatus =
  | 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked'
  | 'bounced' | 'complained' | 'failed' | 'delivery_delayed'

type EmailLogType =
  | 'reservation_confirmed' | 'reservation_cancelled' | 'reservation_changed'
  | 'reservation_request'  | 'reminder' | 'gm_notification' | 'staff_invitation'
  | 'waitlist_confirmed'   | 'guest_pin' | 'performance_cancellation'
  | 'license_report'       | 'contact_inquiry' | 'other'

interface EmailLog {
  id: string
  organization_id: string | null
  reservation_id: string | null
  schedule_event_id: string | null
  email_type: EmailLogType
  to_email: string
  to_name: string | null
  subject: string
  body_text: string | null
  body_html: string | null
  provider: string
  provider_message_id: string | null
  status: EmailLogStatus
  error_message: string | null
  sent_at: string | null
  delivered_at: string | null
  opened_at: string | null
  bounced_at: string | null
  complained_at: string | null
  created_at: string
}

// ─── ラベル定義 ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<EmailLogStatus, string> = {
  queued:           '送信待',
  sent:             '送信済',
  delivered:        '配信済',
  opened:           '開封',
  clicked:          'クリック',
  bounced:          'バウンス',
  complained:       '苦情',
  failed:           '送信失敗',
  delivery_delayed: '遅延',
}

const TYPE_LABELS: Record<EmailLogType, string> = {
  reservation_confirmed:    '予約確認',
  reservation_cancelled:    'キャンセル',
  reservation_changed:      '変更確認',
  reservation_request:      '貸切リクエスト',
  reminder:                 'リマインド',
  gm_notification:          'GM通知',
  staff_invitation:         'スタッフ招待',
  waitlist_confirmed:       'キャンセル待ち',
  guest_pin:                'ゲストPIN',
  performance_cancellation: '公演中止',
  license_report:           'ライセンスレポート',
  contact_inquiry:          'お問い合わせ',
  other:                    'その他',
}

// ─── ヘルパー ────────────────────────────────────────────────────────────────

function maskEmail(email: string): string {
  if (!email.includes('@')) return '***'
  const [local, domain] = email.split('@')
  const masked = local.length > 2 ? local.slice(0, 2) + '***' : '***'
  return `${masked}@${domain}`
}

function formatJst(value: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(d)
}

function statusBadgeClass(status: EmailLogStatus): string {
  switch (status) {
    case 'delivered': return 'bg-green-100 text-green-800'
    case 'opened':    return 'bg-blue-100 text-blue-800'
    case 'clicked':   return 'bg-purple-100 text-purple-800'
    case 'sent':      return 'bg-sky-100 text-sky-800'
    case 'queued':    return 'bg-gray-100 text-gray-600'
    case 'bounced':
    case 'complained':
    case 'failed':    return 'bg-red-100 text-red-800'
    case 'delivery_delayed': return 'bg-yellow-100 text-yellow-800'
    default:          return 'bg-gray-100 text-gray-600'
  }
}

// ─── メインコンポーネント ──────────────────────────────────────────────────────

export function EmailLogsSettings() {
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [logs, setLogs]             = useState<EmailLog[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // フィルター
  const [keyword, setKeyword]         = useState('')
  const [filterType, setFilterType]   = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [dateFrom, setDateFrom]       = useState('')
  const [dateTo, setDateTo]           = useState('')

  const fetchLogs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      let query = supabase
        .from('email_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus)
      }
      if (filterType !== 'all') {
        query = query.eq('email_type', filterType)
      }
      if (dateFrom) {
        query = query.gte('created_at', `${dateFrom}T00:00:00+09:00`)
      }
      if (dateTo) {
        query = query.lte('created_at', `${dateTo}T23:59:59+09:00`)
      }

      const { data, error } = await query
      if (error) throw error
      setLogs((data ?? []) as EmailLog[])
    } catch (error) {
      logger.error('メールログの取得エラー:', error)
      showToast.error('メールログの取得に失敗しました')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [filterStatus, filterType, dateFrom, dateTo])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const filteredLogs = useMemo(() => {
    if (!keyword.trim()) return logs
    const q = keyword.trim().toLowerCase()
    return logs.filter((l) =>
      l.to_email.toLowerCase().includes(q) ||
      l.subject.toLowerCase().includes(q) ||
      (l.to_name ?? '').toLowerCase().includes(q) ||
      (l.provider_message_id ?? '').toLowerCase().includes(q)
    )
  }, [logs, keyword])

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader
        title="メール送信ログ"
        description="アプリが記録したメール送信ログ。送信日時・宛先・本文を確認できます"
      >
        <Button size="sm" onClick={() => fetchLogs(true)} disabled={refreshing}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
          更新
        </Button>
      </PageHeader>

      {/* フィルター */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Filter}
          label="フィルター / 検索"
          description="メールアドレス・件名・メール種別・ステータス・日付で絞り込めます"
        />
        <div className="space-y-3">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="pl-9"
              placeholder="メールアドレス・件名・Message IDで検索"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="メール種別" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての種別</SelectItem>
                {(Object.entries(TYPE_LABELS) as [EmailLogType, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのステータス</SelectItem>
                {(Object.entries(STATUS_LABELS) as [EmailLogStatus, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-36"
              />
              <span className="text-sm text-muted-foreground">〜</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-36"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ログ一覧 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={FileText}
          label="送信ログ（最新200件）"
          description="宛先は部分マスク表示。詳細を開くと件名・本文・エラー内容を確認できます。"
        />
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">該当するログがありません</div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((log) => (
              <div key={log.id} className="border rounded-lg bg-white overflow-hidden">
                {/* ヘッダー行 */}
                <button
                  type="button"
                  className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge className={statusBadgeClass(log.status)}>
                      {STATUS_LABELS[log.status] ?? log.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {TYPE_LABELS[log.email_type] ?? log.email_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatJst(log.created_at)}
                    </span>
                    {expandedId === log.id
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-sm">
                      <span className="text-muted-foreground">To:</span>{' '}
                      {maskEmail(log.to_email)}
                      {log.to_name && (
                        <span className="text-muted-foreground"> ({log.to_name})</span>
                      )}
                    </div>
                    <div className="text-sm font-medium truncate">{log.subject}</div>
                  </div>
                </button>

                {/* 詳細展開 */}
                {expandedId === log.id && (
                  <div className="border-t bg-gray-50 p-4 space-y-3 text-sm">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                      <dt className="text-muted-foreground font-medium">送信日時</dt>
                      <dd>{formatJst(log.sent_at)}</dd>
                      <dt className="text-muted-foreground font-medium">配信日時</dt>
                      <dd>{formatJst(log.delivered_at)}</dd>
                      <dt className="text-muted-foreground font-medium">開封日時</dt>
                      <dd>{formatJst(log.opened_at)}</dd>
                      {log.bounced_at && (
                        <>
                          <dt className="text-muted-foreground font-medium">バウンス日時</dt>
                          <dd className="text-red-600">{formatJst(log.bounced_at)}</dd>
                        </>
                      )}
                      {log.complained_at && (
                        <>
                          <dt className="text-muted-foreground font-medium">苦情日時</dt>
                          <dd className="text-red-600">{formatJst(log.complained_at)}</dd>
                        </>
                      )}
                      <dt className="text-muted-foreground font-medium">プロバイダ</dt>
                      <dd>{log.provider}</dd>
                      {log.provider_message_id && (
                        <>
                          <dt className="text-muted-foreground font-medium">Message ID</dt>
                          <dd className="font-mono text-xs break-all">{log.provider_message_id}</dd>
                        </>
                      )}
                      {log.error_message && (
                        <>
                          <dt className="text-muted-foreground font-medium">エラー</dt>
                          <dd className="text-red-600 break-all">{log.error_message}</dd>
                        </>
                      )}
                    </dl>

                    {/* 関連リンク */}
                    <div className="flex flex-wrap gap-2">
                      {log.reservation_id && (
                        <a
                          href={`?page=reservations&id=${log.reservation_id}`}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          予約を開く
                        </a>
                      )}
                    </div>

                    {/* 本文プレビュー */}
                    {log.body_text && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                          テキスト本文を表示
                        </summary>
                        <pre className="mt-2 p-3 bg-white border rounded text-xs whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
                          {log.body_text}
                        </pre>
                      </details>
                    )}
                    {log.body_html && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                          HTML本文を表示
                        </summary>
                        <div
                          className="mt-2 p-3 bg-white border rounded text-xs max-h-80 overflow-y-auto"
                          // biome-ignore lint/security/noDangerouslySetInnerHtml: 管理者のみが閲覧するため許容
                          dangerouslySetInnerHTML={{ __html: log.body_html }}
                        />
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
