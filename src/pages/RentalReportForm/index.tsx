/**
 * @page RentalReportForm
 * @path /{orgSlug}/rental-report
 * @purpose 他社向けレンタル公演回数報告フォーム（ログイン不要）
 * @access public（誰でもアクセス可能）
 */
import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Send,
  Loader2,
  CheckCircle,
  FileText,
  Calendar,
  Building2,
  Mail,
  ChevronLeft,
  ChevronRight,
  AlertCircle
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'

interface ManagedScenario {
  id: string
  scenario_master_id: string
  title: string
  author: string
  external_license_amount: number | null
}

interface RentalReportFormProps {
  organizationSlug: string
}

export function RentalReportForm({ organizationSlug }: RentalReportFormProps) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [scenarios, setScenarios] = useState<ManagedScenario[]>([])
  const [organizationName, setOrganizationName] = useState('')
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [entries, setEntries] = useState<Map<string, number>>(new Map())

  const [companyName, setCompanyName] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  const [reportDate, setReportDate] = useState(() => {
    const now = new Date()
    now.setMonth(now.getMonth() - 1)
    return now
  })
  const reportYear = reportDate.getFullYear()
  const reportMonth = reportDate.getMonth() + 1

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationSlug])

  const loadData = async () => {
    try {
      setLoading(true)

      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('slug', organizationSlug)
        .single()

      if (orgError || !orgData) {
        logger.error('組織取得エラー:', orgError)
        return
      }

      setOrganizationId(orgData.id)
      setOrganizationName(orgData.name)

      // ビューからシナリオ基本情報を取得
      // ビューの id = scenario_master_id, org_scenario_id = organization_scenarios.id
      const { data: viewData, error: viewError } = await supabase
        .from('organization_scenarios_with_master')
        .select('id, org_scenario_id, scenario_master_id, title, author')
        .eq('organization_id', orgData.id)
        .eq('scenario_type', 'managed')
        .eq('status', 'available')
        .order('author')
        .order('title')

      if (viewError) throw viewError

      // organization_scenarios から external_license_amount を取得
      const orgScenarioIds = (viewData || []).map((s: any) => s.org_scenario_id).filter(Boolean)
      const { data: orgScData } = orgScenarioIds.length > 0
        ? await supabase
            .from('organization_scenarios')
            .select('id, external_license_amount')
            .in('id', orgScenarioIds)
        : { data: [] }

      const extPriceMap = new Map<string, number>()
      ;(orgScData || []).forEach((item: any) => {
        if (item.external_license_amount) {
          extPriceMap.set(item.id, item.external_license_amount)
        }
      })

      const merged: ManagedScenario[] = (viewData || []).map((s: any) => ({
        id: s.id,
        scenario_master_id: s.scenario_master_id,
        title: s.title,
        author: s.author,
        external_license_amount: extPriceMap.get(s.org_scenario_id) || null
      }))

      setScenarios(merged)
    } catch (error) {
      logger.error('データ取得エラー:', error)
      showToast.error('データの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const updateCount = (scenarioId: string, count: number) => {
    const newEntries = new Map(entries)
    if (count > 0) {
      newEntries.set(scenarioId, count)
    } else {
      newEntries.delete(scenarioId)
    }
    setEntries(newEntries)
  }

  const changeMonth = (delta: number) => {
    const newDate = new Date(reportDate)
    newDate.setMonth(newDate.getMonth() + delta)
    setReportDate(newDate)
  }

  const stats = useMemo(() => {
    let totalScenarios = 0
    let totalCount = 0
    let totalAmount = 0

    entries.forEach((count, scenarioId) => {
      if (count > 0) {
        totalScenarios++
        totalCount += count
        const scenario = scenarios.find(s => s.id === scenarioId)
        totalAmount += (scenario?.external_license_amount || 0) * count
      }
    })

    return { totalScenarios, totalCount, totalAmount }
  }, [entries, scenarios])

  const handleSubmit = async () => {
    if (!companyName.trim()) {
      showToast.error('会社名・店舗名を入力してください')
      return
    }
    if (!contactEmail.trim() || !contactEmail.includes('@')) {
      showToast.error('有効なメールアドレスを入力してください')
      return
    }
    if (entries.size === 0) {
      showToast.error('公演回数を入力してください')
      return
    }

    const confirmed = confirm(
      `${reportYear}年${reportMonth}月のレンタル公演回数を報告しますか？\n\n` +
      `・会社名 / 店舗名: ${companyName}\n` +
      `・シナリオ数: ${stats.totalScenarios}件\n` +
      `・総公演回数: ${stats.totalCount}回\n` +
      `・合計金額: ¥${stats.totalAmount.toLocaleString()}`
    )
    if (!confirmed) return

    try {
      setSubmitting(true)

      const reports = Array.from(entries.entries())
        .filter(([, count]) => count > 0)
        .map(([scenarioId, count]) => ({
          scenario_id: scenarioId,
          organization_id: null,
          reporter_company_name: companyName.trim(),
          reporter_email: contactEmail.trim(),
          performance_date: `${reportYear}-${String(reportMonth).padStart(2, '0')}-01`,
          performance_count: count,
          status: 'pending',
          notes: `${reportYear}年${reportMonth}月分 レンタル公演報告（${organizationName}管理シナリオ）`
        }))

      const { error } = await supabase
        .from('external_performance_reports')
        .insert(reports)

      if (error) throw error

      setSubmitted(true)
      showToast.success('報告を送信しました')
    } catch (error) {
      logger.error('報告送信エラー:', error)
      showToast.error('報告の送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const groupedScenarios = useMemo(() => {
    const groups = new Map<string, ManagedScenario[]>()
    scenarios.forEach(scenario => {
      const author = scenario.author || '不明'
      if (!groups.has(author)) {
        groups.set(author, [])
      }
      groups.get(author)!.push(scenario)
    })
    return groups
  }, [scenarios])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!organizationId || scenarios.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-bold mb-2">報告対象のシナリオがありません</h2>
            <p className="text-muted-foreground">
              現在、報告可能なシナリオが見つかりませんでした。<br />
              URLが正しいかご確認ください。
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">報告を送信しました</h2>
            <p className="text-muted-foreground mb-6">
              ご報告ありがとうございます。<br />
              内容を確認後、反映いたします。
            </p>
            <Button onClick={() => {
              setSubmitted(false)
              setEntries(new Map())
            }}>
              続けて別の月を報告する
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-4 space-y-6">
        {/* ヘッダー */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-6 h-6" />
              レンタル公演回数報告
            </CardTitle>
            <CardDescription>
              {organizationName}からレンタルしているシナリオの月次公演回数をご報告ください。
            </CardDescription>
          </CardHeader>
        </Card>

        {/* 報告者情報 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              報告者情報
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="company">会社名 / 店舗名 <span className="text-destructive">*</span></Label>
                <Input
                  id="company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="例: ○○ミステリー"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="email">メールアドレス <span className="text-destructive">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="例: info@example.com"
                  className="mt-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 報告月 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              報告月
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" size="icon" onClick={() => changeMonth(-1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xl font-bold min-w-[150px] text-center">
                {reportYear}年{reportMonth}月
              </span>
              <Button variant="outline" size="icon" onClick={() => changeMonth(1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* シナリオ一覧 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">公演回数を入力</CardTitle>
            <CardDescription>
              該当月に公演したシナリオの回数を入力してください（公演していないシナリオは0のままで構いません）
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {Array.from(groupedScenarios.entries()).map(([author, authorScenarios]) => (
              <div key={author}>
                <h3 className="font-semibold text-sm text-muted-foreground mb-2 border-b pb-1">
                  {author}
                </h3>
                <div className="space-y-2">
                  {authorScenarios.map(scenario => {
                    const count = entries.get(scenario.id) || 0
                    const unitPrice = scenario.external_license_amount || 0

                    return (
                      <div
                        key={scenario.id}
                        className={`p-3 rounded-lg border ${
                          count > 0 ? 'bg-primary/5 border-primary/30' : 'bg-muted/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-sm">{scenario.title}</span>
                            {unitPrice > 0 && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                @¥{unitPrice.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-8 h-8 p-0"
                              onClick={() => updateCount(scenario.id, Math.max(0, count - 1))}
                              disabled={count === 0}
                            >
                              -
                            </Button>
                            <Input
                              type="number"
                              min="0"
                              value={count || ''}
                              onChange={(e) => updateCount(scenario.id, parseInt(e.target.value) || 0)}
                              className="w-16 text-center"
                              placeholder="0"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-8 h-8 p-0"
                              onClick={() => updateCount(scenario.id, count + 1)}
                            >
                              +
                            </Button>
                            <span className="text-sm text-muted-foreground w-8">回</span>
                          </div>
                        </div>
                        {count > 0 && unitPrice > 0 && (
                          <div className="mt-1 text-right text-sm font-medium text-primary">
                            {count}回 × ¥{unitPrice.toLocaleString()} = ¥{(count * unitPrice).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 送信 */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            {stats.totalScenarios > 0 && (
              <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">
                    報告対象: <strong>{stats.totalScenarios}件</strong> / 総公演回数: <strong>{stats.totalCount}回</strong>
                  </div>
                  {stats.totalAmount > 0 && (
                    <div className="text-lg font-bold">
                      合計: ¥{stats.totalAmount.toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button
                onClick={handleSubmit}
                disabled={submitting || stats.totalScenarios === 0}
                className="w-full sm:w-auto"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    送信中...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    報告を送信
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* フッター */}
        <p className="text-center text-xs text-muted-foreground pb-8">
          ご不明な点がございましたら、{organizationName}までお問い合わせください。
        </p>
      </div>
    </div>
  )
}
