import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface EmailDeliveryHistoryItem {
  id: string
  to: string[]
  from: string
  subject: string
  created_at: string
  last_event: string
}

const EVENT_LABELS: Record<string, string> = {
  sent: '送信済み',
  delivered: '配信済み',
  delivery_delayed: '配信遅延',
  bounced: 'バウンス',
  complained: '苦情',
  opened: '開封',
  clicked: 'クリック',
}

function formatJstDateTime(value: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getEventLabel(event: string): string {
  return EVENT_LABELS[event] || event || '不明'
}

function getEventBadgeClass(event: string): string {
  switch (event) {
    case 'delivered':
      return 'bg-green-100 text-green-800'
    case 'opened':
      return 'bg-blue-100 text-blue-800'
    case 'clicked':
      return 'bg-purple-100 text-purple-800'
    case 'bounced':
    case 'complained':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export function EmailDeliveryHistorySettings() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [emails, setEmails] = useState<EmailDeliveryHistoryItem[]>([])
  const [keyword, setKeyword] = useState('')

  const fetchHistory = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const { data, error } = await supabase.functions.invoke('list-resend-emails', {
        body: { limit: 100 },
      })

      if (error) throw error

      const items = Array.isArray(data?.emails) ? data.emails : []
      setEmails(items)
    } catch (error) {
      logger.error('メール配信履歴の取得エラー:', error)
      showToast.error('メール配信履歴の取得に失敗しました')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const filteredEmails = useMemo(() => {
    if (!keyword.trim()) return emails
    const q = keyword.trim().toLowerCase()
    return emails.filter((item) => {
      const toJoined = item.to.join(' ').toLowerCase()
      return (
        toJoined.includes(q) ||
        item.subject.toLowerCase().includes(q) ||
        item.from.toLowerCase().includes(q) ||
        item.last_event.toLowerCase().includes(q)
      )
    })
  }, [emails, keyword])

  return (
    <div className="space-y-6">
      <PageHeader
        title="メール配信履歴"
        description="Resendに記録されている送信先・件名・ステータスを確認できます"
      >
        <Button onClick={() => fetchHistory(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          更新
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>検索</CardTitle>
          <CardDescription>送信先メールアドレス・件名・ステータスで絞り込めます</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="pl-9"
              placeholder="例: gmail.com / 貸切予約 / delivered"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>履歴一覧（最新100件）</CardTitle>
          <CardDescription>開封判定（opened）は受信環境により誤差が出る場合があります</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
          ) : filteredEmails.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">該当する履歴がありません</div>
          ) : (
            <div className="space-y-3">
              {filteredEmails.map((item) => (
                <div key={item.id} className="border rounded-lg p-4 bg-white">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge className={getEventBadgeClass(item.last_event)}>
                      {getEventLabel(item.last_event)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatJstDateTime(item.created_at)}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm">
                      <span className="text-muted-foreground">To:</span>{' '}
                      {item.to.length > 0 ? item.to.join(', ') : '-'}
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">件名:</span> {item.subject || '-'}
                    </div>
                    <div className="text-xs text-muted-foreground break-all">Message ID: {item.id}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
