/**
 * @page ExternalReportForm
 * @path #report-form
 * @purpose 外部からの公演報告フォーム（ログイン不要）
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
  ChevronRight
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'

interface ManagedScenario {
  id: string
  title: string
  author: string
  license_amount: number
}

interface ReportEntry {
  scenarioId: string
  count: number
}

export default function ExternalReportForm() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [scenarios, setScenarios] = useState<ManagedScenario[]>([])
  const [entries, setEntries] = useState<Map<string, number>>(new Map())
  
  // 報告者情報
  const [companyName, setCompanyName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  
  // 報告月
  const [reportDate, setReportDate] = useState(() => new Date())
  const reportYear = reportDate.getFullYear()
  const reportMonth = reportDate.getMonth() + 1

  // 管理シナリオを取得
  useEffect(() => {
    loadScenarios()
  }, [])

  const loadScenarios = async () => {
    try {
      setLoading(true)
      
      // 管理シナリオを取得（scenario_type: 'managed' または is_shared: true）
      const { data, error } = await supabase
        .from('scenarios')
        .select('id, title, author, license_amount')
        .or('scenario_type.eq.managed,is_shared.eq.true')
        .order('author')
        .order('title')

      if (error) throw error
      
      setScenarios(data || [])
    } catch (error) {
      logger.error('シナリオ取得エラー:', error)
      // フォールバック：全シナリオを取得
      try {
        const { data, error: fallbackError } = await supabase
          .from('scenarios')
          .select('id, title, author, license_amount')
          .order('author')
          .order('title')
        
        if (fallbackError) throw fallbackError
        setScenarios(data || [])
      } catch (fallbackError) {
        logger.error('フォールバック取得エラー:', fallbackError)
        showToast.error('シナリオの読み込みに失敗しました')
      }
    } finally {
      setLoading(false)
    }
  }

  // 回数を更新
  const updateCount = (scenarioId: string, count: number) => {
    const newEntries = new Map(entries)
    if (count > 0) {
      newEntries.set(scenarioId, count)
    } else {
      newEntries.delete(scenarioId)
    }
    setEntries(newEntries)
  }

  // 月を変更
  const changeMonth = (delta: number) => {
    const newDate = new Date(reportDate)
    newDate.setMonth(newDate.getMonth() + delta)
    setReportDate(newDate)
  }

  // 報告対象の統計
  const stats = useMemo(() => {
    let totalScenarios = 0
    let totalCount = 0
    let totalLicense = 0

    entries.forEach((count, scenarioId) => {
      if (count > 0) {
        totalScenarios++
        totalCount += count
        const scenario = scenarios.find(s => s.id === scenarioId)
        if (scenario) {
          totalLicense += (scenario.license_amount || 0) * count
        }
      }
    })

    return { totalScenarios, totalCount, totalLicense }
  }, [entries, scenarios])

  // 送信
  const handleSubmit = async () => {
    // バリデーション
    if (!companyName.trim()) {
      showToast.error('会社名を入力してください')
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

    // 確認
    const confirmed = confirm(
      `${reportYear}年${reportMonth}月の公演報告を送信しますか？\n\n` +
      `・会社名: ${companyName}\n` +
      `・シナリオ数: ${stats.totalScenarios}件\n` +
      `・総公演回数: ${stats.totalCount}回\n` +
      `・推定ライセンス料: ¥${stats.totalLicense.toLocaleString()}`
    )
    if (!confirmed) return

    try {
      setSubmitting(true)

      // 各シナリオの報告を作成
      const reports = Array.from(entries.entries()).map(([scenarioId, count]) => ({
        scenario_id: scenarioId,
        organization_id: null, // 外部報告なので組織IDなし
        reporter_company_name: companyName.trim(),
        reporter_email: contactEmail.trim(),
        performance_date: `${reportYear}-${String(reportMonth).padStart(2, '0')}-01`,
        performance_count: count,
        status: 'pending',
        notes: `${reportYear}年${reportMonth}月分の報告`
      }))

      const { error } = await supabase
        .from('external_performance_reports')
        .insert(reports)

      if (error) throw error

      setSubmitted(true)
      showToast.success('報告を送信しました', '承認後に反映されます')
    } catch (error) {
      logger.error('報告送信エラー:', error)
      showToast.error('報告の送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  // 作者ごとにグループ化
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

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">報告を送信しました</h2>
            <p className="text-muted-foreground mb-4">
              ご報告ありがとうございます。<br />
              承認後にライセンス料の集計に反映されます。
            </p>
            <Button onClick={() => window.location.reload()}>
              新しい報告を送信
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* ヘッダー */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-6 h-6" />
              公演報告フォーム
            </CardTitle>
            <CardDescription>
              シナリオを使用して公演を行った場合は、以下のフォームからご報告ください。
              報告は承認後にライセンス料の集計に反映されます。
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
                <Label htmlFor="company">会社名 / 団体名 *</Label>
                <Input
                  id="company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="例: ○○プロダクション"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="email">メールアドレス *</Label>
                <Input
                  id="email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="例: contact@example.com"
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
            <CardTitle className="text-base">
              シナリオ一覧
            </CardTitle>
            <CardDescription>
              公演したシナリオの回数を入力してください
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
                    return (
                      <div 
                        key={scenario.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          count > 0 ? 'bg-primary/5 border-primary/30' : 'bg-muted/30'
                        }`}
                      >
                        <div className="flex-1">
                          <span className="font-medium">{scenario.title}</span>
                          {scenario.license_amount > 0 && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              ¥{scenario.license_amount.toLocaleString()}/回
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
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
                            value={count}
                            onChange={(e) => updateCount(scenario.id, parseInt(e.target.value) || 0)}
                            className="w-16 text-center"
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
                    )
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 送信 */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                {stats.totalScenarios > 0 ? (
                  <>
                    報告対象: <strong>{stats.totalScenarios}件</strong> / 
                    公演回数: <strong>{stats.totalCount}回</strong> / 
                    推定ライセンス料: <strong>¥{stats.totalLicense.toLocaleString()}</strong>
                  </>
                ) : (
                  '公演回数を入力してください'
                )}
              </div>
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
      </div>
    </div>
  )
}

