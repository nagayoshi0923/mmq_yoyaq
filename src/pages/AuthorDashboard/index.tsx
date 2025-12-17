/**
 * @page AuthorDashboard
 * @path #author-dashboard
 * @purpose 作者（シナリオ著者）向けのダッシュボード
 * @access 作者ユーザーのみ
 * 
 * 機能:
 * - 自身のシナリオの公演回数確認
 * - 各組織からの公演報告一覧
 * - ライセンス収入の集計
 * - プロフィール編集
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { 
  BookOpen, 
  Building2, 
  Calendar, 
  FileText, 
  Settings, 
  TrendingUp,
  Users,
  JapaneseYen
} from 'lucide-react'
import { authorApi } from '@/lib/api/authorApi'
import type { Author, AuthorPerformanceReport, AuthorSummary } from '@/types'
import { AuthorReportList } from './components/AuthorReportList'
import { AuthorProfileSettings } from './components/AuthorProfileSettings'

export default function AuthorDashboard() {
  const [author, setAuthor] = useState<Author | null>(null)
  const [summary, setSummary] = useState<AuthorSummary | null>(null)
  const [reports, setReports] = useState<AuthorPerformanceReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    loadAuthorData()
  }, [])

  const loadAuthorData = async () => {
    try {
      setLoading(true)
      
      const currentAuthor = await authorApi.getCurrentAuthor()
      if (!currentAuthor) {
        setError('作者アカウントが見つかりません。登録が必要です。')
        return
      }
      
      setAuthor(currentAuthor)
      
      // サマリーと報告を並行して取得
      const [summaryData, reportsData] = await Promise.all([
        authorApi.getAuthorSummary(currentAuthor.id),
        authorApi.getAuthorReports(currentAuthor.id)
      ])
      
      setSummary(summaryData)
      setReports(reportsData)
    } catch (err) {
      console.error('Failed to load author data:', err)
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
        <Button onClick={() => window.location.hash = '#author-register'}>
          作者アカウントを登録
        </Button>
      </div>
    )
  }

  if (!author || !summary) return null

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* ヘッダー */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-2">
          <h1 className="text-3xl font-bold">
            {author.display_name || author.name}さんのダッシュボード
          </h1>
          {author.is_verified && (
            <Badge variant="secondary" className="bg-blue-500/10 text-blue-600">
              ✓ 認証済み
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground">
          シナリオの公演報告やライセンス収入を確認できます
        </p>
      </div>

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
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            設定
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

          {/* 今月のサマリー */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-lg">今月の実績</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-green-500/10">
                    <FileText className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">今月の報告件数</p>
                    <p className="text-2xl font-bold">{summary.this_month_reports} 件</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-amber-500/10">
                    <JapaneseYen className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">今月のライセンス料</p>
                    <p className="text-2xl font-bold">¥{summary.this_month_license_fee.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 最近の報告 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                最近の公演報告
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setActiveTab('reports')}
                >
                  すべて見る
                </Button>
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

        {/* 設定タブ */}
        <TabsContent value="settings">
          <AuthorProfileSettings 
            author={author} 
            onUpdate={(updated) => setAuthor(updated)}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

