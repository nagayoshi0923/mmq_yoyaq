/**
 * 送信報告タブ - 作者・会社への公演報告を統合
 * 
 * 報告先の判定ルール:
 * - author_email あり → 作者に報告（メール送信）
 * - author_email なし → 管理会社に報告
 */
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Search,
  Mail,
  Building2,
  Send,
  ChevronDown,
  ChevronUp,
  Loader2,
  JapaneseYen,
  Users,
  Calendar,
  ExternalLink,
  MailCheck,
  AlertCircle
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { ScenarioEditDialog } from '@/components/modals/ScenarioEditDialog'
import { scenarioApi, salesApi, storeApi } from '@/lib/api'
import { getAllExternalReports } from '@/lib/api/externalReportsApi'
import type { Scenario } from '@/types'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'

interface SendReportsProps {
  organizationId: string
  staffId: string
  isLicenseManager: boolean
}

// 報告データ
interface ReportItem {
  scenarioId: string
  scenarioTitle: string
  author: string
  authorEmail: string | null  // あれば作者へ、なければ会社へ
  events: number
  licenseCost: number
  licenseAmountPerEvent: number
  isGMTest?: boolean
  isExternal?: boolean
  externalOrgName?: string
}

// 作者ごとにグループ化
interface ReportGroup {
  authorName: string
  authorEmail: string | null  // 最も多く使われているメアド
  items: ReportItem[]
  totalEvents: number
  totalLicenseCost: number
  // 一部未登録の警告用
  itemsWithEmail: number
  itemsWithoutEmail: number
  hasPartialEmail: boolean  // 一部のみメアド登録
}

export function SendReports({ organizationId, staffId, isLicenseManager }: SendReportsProps) {
  const [loading, setLoading] = useState(true)
  const [reportGroups, setReportGroups] = useState<ReportGroup[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [isSending, setIsSending] = useState(false)
  
  // シナリオ編集ダイアログ
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editScenarioId, setEditScenarioId] = useState<string | null>(null)
  
  // 一括メール登録ダイアログ
  const [isBulkEmailDialogOpen, setIsBulkEmailDialogOpen] = useState(false)
  const [bulkEmailTarget, setBulkEmailTarget] = useState<ReportGroup | null>(null)
  const [bulkEmail, setBulkEmail] = useState('')
  const [isSavingEmail, setIsSavingEmail] = useState(false)
  
  // 月選択
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const selectedYear = currentDate.getFullYear()
  const selectedMonth = currentDate.getMonth() + 1

  // データ取得
  useEffect(() => {
    loadData()
  }, [selectedYear, selectedMonth, organizationId])

  const loadData = async () => {
    try {
      setLoading(true)

      // 日付範囲計算
      const startDate = new Date(selectedYear, selectedMonth - 1, 1)
      const endDate = new Date(selectedYear, selectedMonth, 0)
      const startStr = startDate.toISOString().split('T')[0]
      const endStr = endDate.toISOString().split('T')[0]

      // データを並行取得
      const [scenarios, stores, performance, externalReports] = await Promise.all([
        scenarioApi.getAll(),
        storeApi.getAll(),
        salesApi.getScenarioPerformance(startStr, endStr),
        isLicenseManager 
          ? getAllExternalReports({ status: 'approved', startDate: startStr, endDate: endStr }).catch(() => [])
          : Promise.resolve([])
      ])

      // 報告アイテムを収集
      const items: ReportItem[] = []

      // 自社公演を処理
      performance.forEach((perf: any) => {
        const scenario = scenarios.find(s => s.id === perf.id || s.title === perf.title)
        if (!scenario?.author) return

        const store = stores.find(s => s.id === perf.store_id)
        const isFranchise = store?.ownership_type === 'franchise'
        const isGMTest = perf.category === 'gmtest'
        const events = perf.events || 0

        let licenseAmount = 0
        if (isFranchise) {
          licenseAmount = isGMTest 
            ? (scenario.franchise_gm_test_license_amount || scenario.franchise_license_amount || scenario.gm_test_license_amount || scenario.license_amount || 0)
            : (scenario.franchise_license_amount || scenario.license_amount || 0)
        } else {
          licenseAmount = isGMTest 
            ? (scenario.gm_test_license_amount || 0)
            : (scenario.license_amount || 0)
        }

        items.push({
          scenarioId: scenario.id,
          scenarioTitle: isGMTest ? `${perf.title}（GMテスト）` : perf.title,
          author: scenario.author,
          authorEmail: scenario.author_email || null,
          events,
          licenseCost: licenseAmount * events,
          licenseAmountPerEvent: licenseAmount,
          isGMTest
        })
      })

      // 外部報告を処理（ライセンス管理者のみ）
      if (isLicenseManager) {
        externalReports.forEach((report: any) => {
          const scenarioInfo = report.scenarios
          if (!scenarioInfo?.author) return

          const scenario = scenarios.find(s => s.id === report.scenario_id)
          const events = report.performance_count || 1
          const licenseAmount = scenario?.license_amount || 0
          const orgName = report.organizations?.name || '外部'

          items.push({
            scenarioId: report.scenario_id,
            scenarioTitle: `${scenarioInfo.title}（${orgName}）`,
            author: scenarioInfo.author,
            authorEmail: scenario?.author_email || null,
            events,
            licenseCost: licenseAmount * events,
            licenseAmountPerEvent: licenseAmount,
            isExternal: true,
            externalOrgName: orgName
          })
        })
      }

      // 作者名でグループ化
      const groupMap = new Map<string, ReportGroup>()

      items.forEach(item => {
        const key = item.author  // 作者名でグループ化
        
        if (groupMap.has(key)) {
          const group = groupMap.get(key)!
          group.items.push(item)
          group.totalEvents += item.events
          group.totalLicenseCost += item.licenseCost
          if (item.authorEmail) {
            group.itemsWithEmail++
            // 最も多く使われているメアドを採用（初回設定優先）
            if (!group.authorEmail) {
              group.authorEmail = item.authorEmail
            }
          } else {
            group.itemsWithoutEmail++
          }
        } else {
          groupMap.set(key, {
            authorName: item.author,
            authorEmail: item.authorEmail,
            items: [item],
            totalEvents: item.events,
            totalLicenseCost: item.licenseCost,
            itemsWithEmail: item.authorEmail ? 1 : 0,
            itemsWithoutEmail: item.authorEmail ? 0 : 1,
            hasPartialEmail: false
          })
        }
      })

      // 一部未登録フラグを設定
      groupMap.forEach(group => {
        group.hasPartialEmail = group.itemsWithEmail > 0 && group.itemsWithoutEmail > 0
      })

      // ソートして設定
      const sorted = Array.from(groupMap.values()).sort((a, b) => b.totalEvents - a.totalEvents)
      setReportGroups(sorted)

    } catch (error) {
      logger.error('データ取得エラー:', error)
      showToast.error('データ取得失敗')
    } finally {
      setLoading(false)
    }
  }

  // 展開/折りたたみ
  const toggleExpand = (key: string) => {
    const newSet = new Set(expandedGroups)
    if (newSet.has(key)) {
      newSet.delete(key)
    } else {
      newSet.add(key)
    }
    setExpandedGroups(newSet)
  }

  // 選択
  const toggleSelect = (authorName: string) => {
    const newSet = new Set(selectedGroups)
    if (newSet.has(authorName)) {
      newSet.delete(authorName)
    } else {
      newSet.add(authorName)
    }
    setSelectedGroups(newSet)
  }

  // 全選択（メール送信可能なもののみ）
  const selectAll = () => {
    const emailGroups = filteredGroups.filter(g => g.authorEmail)
    setSelectedGroups(new Set(emailGroups.map(g => g.authorName)))
  }

  // 選択解除
  const deselectAll = () => {
    setSelectedGroups(new Set())
  }

  // 送信
  const handleSend = async (group: ReportGroup) => {
    if (!group.authorEmail) {
      showToast.warning('メールアドレスが登録されていません')
      return
    }

    // 確認ダイアログ
    const confirmed = confirm(
      `${group.authorName} (${group.authorEmail}) に\n` +
      `${selectedYear}年${selectedMonth}月のレポートを送信しますか？\n\n` +
      `・公演数: ${group.totalEvents}回\n` +
      `・ライセンス料: ¥${group.totalLicenseCost.toLocaleString()}`
    )
    if (!confirmed) return

    try {
      setIsSending(true)

      const { error } = await supabase.functions.invoke('send-author-report', {
        body: {
          to: group.authorEmail,
          authorName: group.authorName,
          year: selectedYear,
          month: selectedMonth,
          totalEvents: group.totalEvents,
          totalLicenseCost: group.totalLicenseCost,
          scenarios: group.items.map(item => ({
            title: item.scenarioTitle,
            events: item.events,
            licenseAmountPerEvent: item.licenseAmountPerEvent,
            licenseCost: item.licenseCost,
            isGMTest: item.isGMTest
          }))
        }
      })

      if (error) throw error
      showToast.success('送信完了', `${group.authorName}に送信しました`)
    } catch (error) {
      logger.error('送信エラー:', error)
      showToast.error('送信失敗')
    } finally {
      setIsSending(false)
    }
  }

  // 一括送信
  const handleBatchSend = async () => {
    const targets = filteredGroups.filter(g => g.authorEmail && selectedGroups.has(g.authorName))
    if (targets.length === 0) {
      showToast.warning('送信対象がありません')
      return
    }

    const totalEvents = targets.reduce((sum, g) => sum + g.totalEvents, 0)
    const totalLicense = targets.reduce((sum, g) => sum + g.totalLicenseCost, 0)
    
    const confirmed = confirm(
      `${selectedYear}年${selectedMonth}月のレポートを一括送信しますか？\n\n` +
      `・送信先: ${targets.length}名\n` +
      `・総公演数: ${totalEvents}回\n` +
      `・総ライセンス料: ¥${totalLicense.toLocaleString()}\n\n` +
      `送信先一覧:\n${targets.map(g => `  - ${g.authorName}`).join('\n')}`
    )
    if (!confirmed) return

    setIsSending(true)
    let success = 0, fail = 0

    for (const group of targets) {
      try {
        const { error } = await supabase.functions.invoke('send-author-report', {
          body: {
            to: group.authorEmail,
            authorName: group.authorName,
            year: selectedYear,
            month: selectedMonth,
            totalEvents: group.totalEvents,
            totalLicenseCost: group.totalLicenseCost,
            scenarios: group.items.map(item => ({
              title: item.scenarioTitle,
              events: item.events,
              licenseAmountPerEvent: item.licenseAmountPerEvent,
              licenseCost: item.licenseCost,
              isGMTest: item.isGMTest
            }))
          }
        })
        if (error) throw error
        success++
      } catch {
        fail++
      }
    }

    setIsSending(false)
    setSelectedGroups(new Set())

    if (fail === 0) {
      showToast.success('一括送信完了', `${success}件に送信しました`)
    } else {
      showToast.warning('一部送信失敗', `成功: ${success}, 失敗: ${fail}`)
    }
  }

  // フィルタリング
  const filteredGroups = reportGroups.filter(g => 
    g.authorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.items.some(item => item.scenarioTitle.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  // 統計
  const stats = {
    totalGroups: filteredGroups.length,
    withEmail: filteredGroups.filter(g => g.authorEmail && g.itemsWithoutEmail === 0).length,
    partialEmail: filteredGroups.filter(g => g.hasPartialEmail).length,
    withoutEmail: filteredGroups.filter(g => !g.authorEmail).length,
    totalEvents: filteredGroups.reduce((sum, g) => sum + g.totalEvents, 0),
    totalLicense: filteredGroups.reduce((sum, g) => sum + g.totalLicenseCost, 0)
  }

  const getGroupKey = (group: ReportGroup) => group.authorName

  // シナリオ編集
  const handleEditScenario = (scenarioId: string) => {
    setEditScenarioId(scenarioId)
    setIsEditDialogOpen(true)
  }

  // シナリオ編集完了後
  const handleScenarioSaved = () => {
    setIsEditDialogOpen(false)
    setEditScenarioId(null)
    loadData() // データ再読み込み
  }

  // 一括メール登録ダイアログを開く
  const handleOpenBulkEmailDialog = (group: ReportGroup) => {
    setBulkEmailTarget(group)
    // 既存のメアドがあれば初期値として設定
    setBulkEmail(group.authorEmail || '')
    setIsBulkEmailDialogOpen(true)
  }

  // 一括メール登録を実行
  const handleBulkEmailSave = async () => {
    if (!bulkEmailTarget || !bulkEmail.trim()) {
      showToast.error('メールアドレスを入力してください')
      return
    }

    if (!bulkEmail.includes('@') || !bulkEmail.includes('.')) {
      showToast.error('有効なメールアドレスを入力してください')
      return
    }

    try {
      setIsSavingEmail(true)

      // 対象シナリオのIDを抽出（重複を除去）
      const scenarioIds = [...new Set(bulkEmailTarget.items.map(item => item.scenarioId))]

      // 各シナリオのauthor_emailを更新
      const { error } = await supabase
        .from('scenarios')
        .update({ author_email: bulkEmail.trim() })
        .in('id', scenarioIds)

      if (error) throw error

      showToast.success('一括登録完了', `${scenarioIds.length}件のシナリオにメールアドレスを登録しました`)
      setIsBulkEmailDialogOpen(false)
      setBulkEmailTarget(null)
      setBulkEmail('')
      loadData() // データ再読み込み
    } catch (error) {
      logger.error('一括メール登録エラー:', error)
      showToast.error('登録に失敗しました')
    } finally {
      setIsSavingEmail(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* シナリオ編集ダイアログ */}
      <ScenarioEditDialog
        isOpen={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false)
          setEditScenarioId(null)
        }}
        scenarioId={editScenarioId}
        onSaved={handleScenarioSaved}
      />

      {/* 一括メール登録ダイアログ */}
      <Dialog open={isBulkEmailDialogOpen} onOpenChange={setIsBulkEmailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>作者メールアドレス一括登録</DialogTitle>
            <DialogDescription>
              {bulkEmailTarget?.authorName} のシナリオにメールアドレスを一括登録します
              {bulkEmailTarget?.authorEmail && (
                <span className="block mt-1 text-green-600">
                  現在の登録: {bulkEmailTarget.authorEmail}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="bulk-email">メールアドレス</Label>
              <Input
                id="bulk-email"
                type="email"
                placeholder="author@example.com"
                value={bulkEmail}
                onChange={(e) => setBulkEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>対象シナリオ ({bulkEmailTarget?.items.length || 0}件)</Label>
              <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                {bulkEmailTarget?.items.map((item, idx) => (
                  <div key={idx} className="text-sm flex items-center gap-2">
                    <span className={item.authorEmail ? 'text-muted-foreground' : 'text-orange-600 font-medium'}>
                      • {item.scenarioTitle}
                    </span>
                    {!item.authorEmail && (
                      <span className="text-xs text-orange-500">未登録</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsBulkEmailDialogOpen(false)}
              disabled={isSavingEmail}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleBulkEmailSave}
              disabled={isSavingEmail || !bulkEmail.trim()}
            >
              {isSavingEmail ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  登録中...
                </>
              ) : (
                '一括登録'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <MonthSwitcher value={currentDate} onChange={setCurrentDate} />
        <div className="flex items-center gap-2">
          {selectedGroups.size > 0 && (
            <Button variant="outline" size="sm" onClick={deselectAll}>
              選択解除
            </Button>
          )}
          <Button
            onClick={handleBatchSend}
            disabled={isSending || selectedGroups.size === 0}
          >
            <MailCheck className="w-4 h-4 mr-2" />
            {isSending ? '送信中...' : `一括送信 (${selectedGroups.size}件)`}
          </Button>
        </div>
      </div>

      {/* 検索 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="作者名・シナリオ名で検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-2xl font-bold">{stats.totalGroups}</div>
            <div className="text-sm text-muted-foreground">作者数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Mail className="w-5 h-5 mx-auto mb-1 text-green-500" />
            <div className="text-2xl font-bold">{stats.withEmail}</div>
            <div className="text-sm text-muted-foreground">送信可</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertCircle className="w-5 h-5 mx-auto mb-1 text-yellow-500" />
            <div className="text-2xl font-bold">{stats.partialEmail}</div>
            <div className="text-sm text-muted-foreground">一部未登録</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Building2 className="w-5 h-5 mx-auto mb-1 text-orange-500" />
            <div className="text-2xl font-bold">{stats.withoutEmail}</div>
            <div className="text-sm text-muted-foreground">未登録</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-2xl font-bold">{stats.totalEvents}</div>
            <div className="text-sm text-muted-foreground">総公演数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <JapaneseYen className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-2xl font-bold">¥{stats.totalLicense.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">総額</div>
          </CardContent>
        </Card>
      </div>

      {/* 一括選択ボタン */}
      {stats.withEmail > 0 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            メール可をすべて選択
          </Button>
        </div>
      )}

      {/* 報告先一覧 */}
      <div className="space-y-3">
        {filteredGroups.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              該当するデータがありません
            </CardContent>
          </Card>
        ) : (
          filteredGroups.map((group) => {
            const key = getGroupKey(group)
            const isExpanded = expandedGroups.has(key)
            const isSelected = group.authorEmail ? selectedGroups.has(group.authorName) : false

            return (
              <Card key={key} className={isSelected ? 'ring-2 ring-primary' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    {/* チェックボックス（メールありのみ） */}
                    {group.authorEmail && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(group.authorName)}
                      />
                    )}

                    {/* メイン情報 */}
                    <div 
                      className="flex-1 flex items-center justify-between cursor-pointer"
                      onClick={() => toggleExpand(key)}
                    >
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{group.authorName}</span>
                          {group.authorEmail ? (
                            <Badge 
                              variant="outline" 
                              className="text-xs text-green-600 cursor-pointer hover:bg-green-50 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpenBulkEmailDialog(group)
                              }}
                            >
                              <Mail className="w-3 h-3 mr-1" />
                              {group.authorEmail}
                            </Badge>
                          ) : (
                            <Badge 
                              variant="secondary" 
                              className="text-xs text-orange-600 cursor-pointer hover:bg-orange-100 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpenBulkEmailDialog(group)
                              }}
                            >
                              <Building2 className="w-3 h-3 mr-1" />
                              メアド未登録
                            </Badge>
                          )}
                          {/* 一部未登録の警告 */}
                          {group.hasPartialEmail && (
                            <Badge 
                              variant="destructive" 
                              className="text-xs cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpenBulkEmailDialog(group)
                              }}
                            >
                              ⚠️ {group.itemsWithoutEmail}件未登録
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span>{group.totalEvents}公演</span>
                          <span className="flex items-center gap-1">
                            <JapaneseYen className="w-3 h-3" />
                            {group.totalLicenseCost.toLocaleString()}
                          </span>
                          <span>{group.items.length}シナリオ</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {group.authorEmail && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isSending}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSend(group)
                            }}
                          >
                            <Send className="w-4 h-4 mr-1" />
                            送信
                          </Button>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 詳細 */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-2">
                      {group.items.map((item, idx) => (
                        <div 
                          key={idx}
                          className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded"
                        >
                          <div className="flex items-center gap-2">
                            <button
                              className="text-sm text-left hover:underline hover:text-primary transition-colors"
                              onClick={() => handleEditScenario(item.scenarioId)}
                            >
                              {item.scenarioTitle}
                            </button>
                            {item.isExternal && (
                              <Badge variant="secondary" className="text-xs">
                                <ExternalLink className="w-3 h-3 mr-1" />
                                外部
                              </Badge>
                            )}
                            {item.isGMTest && (
                              <Badge variant="outline" className="text-xs">GMテスト</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span>{item.events}回</span>
                            <span className="text-muted-foreground">
                              @¥{item.licenseAmountPerEvent.toLocaleString()}
                            </span>
                            <span className="font-medium">
                              ¥{item.licenseCost.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}

