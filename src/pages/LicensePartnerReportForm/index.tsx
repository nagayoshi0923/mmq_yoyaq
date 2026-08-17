/**
 * @page LicensePartnerReportForm
 * @path /partner-report/:token
 * @purpose 契約店舗専用の月次公演回数フォーム（ログイン不要・トークン必須）
 */
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'
import { ConfirmDialog } from '@/components/patterns/modal'
import { MonthSwitcher } from '@/components/patterns/calendar'

type FormItem = {
  scenario_master_id: string
  scenario_title: string
  author: string
  license_amount: number
  performance_count: number
}

type FormPayload = {
  partner_store_id: string
  partner_store_name: string
  year: number
  month: number
  items: FormItem[]
}

function previousMonthDate() {
  const now = new Date()
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1
  return new Date(year, month, 1, 12, 0, 0, 0)
}

export default function LicensePartnerReportForm({ token }: { token: string }) {
  const [currentDate, setCurrentDate] = useState(previousMonthDate)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [form, setForm] = useState<FormPayload | null>(null)
  const [counts, setCounts] = useState<Record<string, string>>({})

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setSubmitted(false)
      const { data, error } = await supabase.rpc('get_license_partner_report_form', {
        p_token: token,
        p_year: year,
        p_month: month,
      })
      if (cancelled) return
      if (error) {
        logger.error('契約店舗フォーム取得エラー:', error)
        setForm(null)
        setLoading(false)
        return
      }
      const payload = data as FormPayload | null
      setForm(payload)
      const next: Record<string, string> = {}
      for (const item of payload?.items ?? []) {
        next[item.scenario_master_id] = String(item.performance_count ?? 0)
      }
      setCounts(next)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [month, token, year])

  const grouped = useMemo(() => {
    const groups = new Map<string, FormItem[]>()
    for (const item of form?.items ?? []) {
      const author = item.author || '不明'
      const list = groups.get(author) ?? []
      list.push(item)
      groups.set(author, list)
    }
    return groups
  }, [form])

  const parsedCounts = useMemo(() => {
    return (form?.items ?? []).map(item => {
      const raw = counts[item.scenario_master_id] ?? '0'
      const value = Number(raw)
      return {
        scenario_master_id: item.scenario_master_id,
        title: item.scenario_title,
        performance_count: Number.isInteger(value) && value >= 0 ? value : NaN,
      }
    })
  }, [counts, form])

  const handleSubmit = () => {
    if (!form) return
    if (parsedCounts.some(item => Number.isNaN(item.performance_count))) {
      showToast.error('回数は0以上の整数で入力してください')
      return
    }
    setConfirmOpen(true)
  }

  const runSubmit = async () => {
    try {
      setSubmitting(true)
      const { data, error } = await supabase.rpc('submit_license_partner_monthly_report', {
        p_token: token,
        p_year: year,
        p_month: month,
        p_counts: parsedCounts.map(item => ({
          scenario_master_id: item.scenario_master_id,
          performance_count: item.performance_count,
        })),
      })
      if (error) throw error
      if (!data || data.success === false) {
        throw new Error('報告の送信に失敗しました')
      }
      setSubmitted(true)
      showToast.success('報告を送信しました')
    } catch (error) {
      logger.error('契約店舗報告送信エラー:', error)
      showToast.error('報告の送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!form) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <h2 className="mb-2 text-xl font-bold">この報告URLは使えません</h2>
            <p className="text-muted-foreground">
              リンクが古い、または店舗が停止されています。クインズワルツまでご連絡ください。
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="mx-auto mb-4 h-16 w-16 text-primary" />
            <h2 className="mb-2 text-xl font-bold">報告を送信しました</h2>
            <p className="mb-4 text-muted-foreground">
              {form.partner_store_name} の {year}年{month}月分を受け付けました。
            </p>
            <Button onClick={() => setSubmitted(false)}>続けて修正する</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-6 p-4">
        <Card>
          <CardHeader>
            <CardTitle>{form.partner_store_name} の公演回数報告</CardTitle>
            <CardDescription>
              契約作品だけが表示されます。対象月を選んで回数を入力してください。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthSwitcher value={currentDate} onChange={setCurrentDate} showToday quickJump />
          </CardContent>
        </Card>

        {form.items.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              この店舗に契約作品がまだありません。
            </CardContent>
          </Card>
        ) : (
          [...grouped.entries()].map(([author, items]) => (
            <Card key={author}>
              <CardHeader>
                <CardTitle className="text-base">{author}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.map(item => (
                  <div key={item.scenario_master_id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.scenario_title}</p>
                      <p className="text-sm text-muted-foreground">
                        単価 ¥{item.license_amount.toLocaleString()}
                      </p>
                    </div>
                    <Input
                      className="w-24"
                      inputMode="numeric"
                      value={counts[item.scenario_master_id] ?? '0'}
                      onChange={(event) => {
                        setCounts(prev => ({
                          ...prev,
                          [item.scenario_master_id]: event.target.value,
                        }))
                      }}
                    />
                    <span className="text-sm text-muted-foreground">回</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}

        <div className="flex justify-end">
          <Button disabled={form.items.length === 0 || submitting} onClick={handleSubmit}>
            {year}年{month}月分を送信
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`${year}年${month}月分を送信しますか？`}
        description={
          <ul className="space-y-1 text-sm">
            {parsedCounts.map(item => (
              <li key={item.scenario_master_id}>
                {item.title}: {item.performance_count}回
              </li>
            ))}
          </ul>
        }
        confirmLabel="送信する"
        isLoading={submitting}
        onConfirm={runSubmit}
      />
    </div>
  )
}
