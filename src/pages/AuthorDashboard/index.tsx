/**
 * @page AuthorDashboard
 * @path #author-dashboard
 * @purpose 作者（シナリオ著者）向けのダッシュボード（メールアドレスベース）
 * @access ログインユーザー（メールアドレスに紐づく報告があれば閲覧可能）
 * 
 * 設計方針:
 * - 作者は登録不要。ログイン中のメールアドレスに紐づく報告を表示
 * - 報告者（会社）がシナリオに作者メールを登録 → 報告時に通知
 * - 同じメールアドレス宛の全報告が一覧で見れる
 */

import { logger } from '@/utils/logger'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  BookOpen, 
  Building2, 
  Calendar, 
  FileText,
  Info,
  TrendingUp,
  JapaneseYen
} from 'lucide-react'
import { authorApi } from '@/lib/api/authorApi'
import type { AuthorPerformanceReport, AuthorSummary } from '@/types'
import { AuthorReportList } from './components/AuthorReportList'

export default function AuthorDashboard() {
  const [email, setEmail] = useState<string | null>(null)
  const [summary, setSummary] = useState<AuthorSummary | null>(null)
  const [reports, setReports] = useState<AuthorPerformanceReport[]>([])
  const [scenarios, setScenarios] = useState<{ id: string; title: string; author: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    loadAuthorData()
  }, [])

  const loadAuthorData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const data = await authorApi.getCurrentAuthorDashboard()
      if (!data) {
        setError('ログインが必要です')
        return
      }
      
      setEmail(data.email)
      setSummary(data.summary)
      setReports(data.reports)
      setScenarios(data.scenarios)
    } catch (err) {
      logger.error('Failed to load author data:', err)
      setError('データの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">読み込み中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="text-destructive">{error}</div>
        <Button onClick={() => window.location.href = '/author-login'}>
          作者ログイン
        </Button>
      </div>
    )
  }

  if (!email || !summary) return null

  const hasNoReports = reports.length === 0 && scenarios.length === 0

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* ヘッダー */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">作者ダッシュボード</h1>
        <p className="text-muted-foreground">
          {email} 宛のシナリオ公演報告を確認できます
        </p>
      </div>

      {/* 報告がない場合のメッセージ */}
      {hasNoReports && (
        <Alert className="mb-8">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium mb-2">まだ公演報告がありません</p>
            <p className="text-sm text-muted-foreground">
              MMQを利用している会社があなたのシナリオを登録し、公演報告を提出すると、ここに表示されます。
              <br />
              シナリオに登録されるメールアドレスは <strong>{email}</strong> である必要があります。
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* タブナビゲーション */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            概要
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <FileText className="h-4 w-4" />
            公演報告
          </TabsTrigger>
          <TabsTrigger value="scenarios" className="gap-2">
            <BookOpen className="h-4 w-4" />
            シナリオ
          </TabsTrigger>
        </TabsList>

        {/* 概要タブ */}
        <TabsContent value="overview">
          {/* サマリーカード */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  登録シナリオ数
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{summary.total_scenarios}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  総公演回数
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{summary.total_performance_count}</div>
                <p className="text-sm text-muted-foreground">
                  報告 {summary.total_approved_reports} 件
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <JapaneseYen className="h-4 w-4" />
                  累計ライセンス料
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  ¥{summary.total_license_fee.toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  取引先会社数
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{summary.organizations_count}</div>
              </CardContent>
            </Card>
          </div>

          {/* 最近の報告 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                最近の公演報告
                {reports.length > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setActiveTab('reports')}
                  >
                    すべて見る
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reports.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  まだ公演報告がありません
                </p>
              ) : (
                <AuthorReportList reports={reports.slice(0, 5)} compact />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 公演報告タブ */}
        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>公演報告一覧</CardTitle>
              <CardDescription>
                各会社から報告された公演記録
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AuthorReportList 
                reports={reports} 
                onRefresh={loadAuthorData}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* シナリオタブ */}
        <TabsContent value="scenarios">
          <Card>
            <CardHeader>
              <CardTitle>登録シナリオ</CardTitle>
              <CardDescription>
                {email} がauthor_emailとして登録されているシナリオ
              </CardDescription>
            </CardHeader>
            <CardContent>
              {scenarios.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  登録されているシナリオがありません
                </p>
              ) : (
                <div className="space-y-3">
                  {scenarios.map(scenario => (
                    <div 
                      key={scenario.id}
                      className="flex items-center justify-between p-4 bg-muted/30 rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{scenario.title}</p>
                        <p className="text-sm text-muted-foreground">
                          作者: {scenario.author}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
