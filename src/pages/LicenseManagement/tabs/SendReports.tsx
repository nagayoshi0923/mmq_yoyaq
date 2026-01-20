/**
 * 送信報告タブ - 作者・会社への公演報告を統合
 * 
 * 報告先の判定ルール:
 * - author_email あり → 作者に報告（メール送信）
 * - author_email なし → 管理会社に報告
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  AlertCircle,
  Home,
  Building,
  Layers,
  Copy,
  Check
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
import { ScenarioEditDialogV2 } from '@/components/modals/ScenarioEditDialogV2'
import { scenarioApi, salesApi, storeApi, authorApi } from '@/lib/api'
import { getAllExternalReports } from '@/lib/api/externalReportsApi'
import type { Scenario, Author } from '@/types'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'
import { StickyNote } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface SendReportsProps {
  organizationId: string
  staffId: string
  isLicenseManager: boolean
}

// 報告データ
interface ReportItem {
  scenarioId: string
  scenarioTitle: string
  author: string  // 元の作者名
  reportDisplayName: string  // 報告用表示名（report_display_name || author）
  authorEmail: string | null  // あれば作者へ、なければ会社へ
  events: number  // 合計（internalEvents + externalEvents）
  internalEvents: number  // 自社公演数
  externalEvents: number  // 他社報告数
  licenseCost: number  // 合計金額
  internalLicenseCost: number  // 自社公演の金額
  externalLicenseCost: number  // 他社報告の金額
  internalLicenseAmount: number  // 自社公演の単価
  externalLicenseAmount: number  // 他社報告の単価（franchise_license_amount）
  isGMTest?: boolean
  scenarioType?: 'normal' | 'managed'  // 管理作品のみ他社表示
}

// 表示モード
type ViewMode = 'all' | 'internal' | 'external'

// 作者ごとにグループ化（報告用表示名でグループ化）
interface ReportGroup {
  authorName: string  // 報告用表示名（編集可能）
  originalAuthorName: string  // 元の作者名（参照用）
  authorEmail: string | null  // 最も多く使われているメアド
  authorNotes: string | null  // 作者メモ（authorsテーブルから）
  items: ReportItem[]
  totalEvents: number
  totalInternalEvents: number
  totalExternalEvents: number
  totalLicenseCost: number
  totalInternalLicenseCost: number
  totalExternalLicenseCost: number
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
  
  // 表示モード切り替え（自社のみ/他社のみ/合計）
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  
  // 他社報告入力用（シナリオIDごとの入力値）
  const [externalInputs, setExternalInputs] = useState<Record<string, number>>({})
  const [isSavingExternal, setIsSavingExternal] = useState(false)
  
  // シナリオ編集ダイアログ
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editScenarioId, setEditScenarioId] = useState<string | null>(null)
  
  // 一括メール登録ダイアログ
  const [isBulkEmailDialogOpen, setIsBulkEmailDialogOpen] = useState(false)
  const [bulkEmailTarget, setBulkEmailTarget] = useState<ReportGroup | null>(null)
  const [bulkEmail, setBulkEmail] = useState('')
  const [isSavingEmail, setIsSavingEmail] = useState(false)
  
  // 報告用表示名編集ダイアログ
  const [isDisplayNameDialogOpen, setIsDisplayNameDialogOpen] = useState(false)
  const [displayNameTarget, setDisplayNameTarget] = useState<ReportGroup | null>(null)
  const [newDisplayName, setNewDisplayName] = useState('')
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false)
  
  // 送信プレビューダイアログ
  const [isSendPreviewOpen, setIsSendPreviewOpen] = useState(false)
  const [sendPreviewTarget, setSendPreviewTarget] = useState<ReportGroup | null>(null)
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<Set<string>>(new Set())
  
  // ソート設定
  type SortKey = 'hasEvents' | 'name' | 'email' | 'events' | 'cost'
  const [sortKey, setSortKey] = useState<SortKey>('hasEvents')
  const [sortAsc, setSortAsc] = useState(false)  // 公演あり優先は降順
  
  // 送信履歴
  const [sentHistory, setSentHistory] = useState<Map<string, { sentAt: string; totalEvents: number; totalCost: number }>>(new Map())
  
  // コピー済み状態（作者名 → タイムアウトID）
  const [copiedAuthor, setCopiedAuthor] = useState<string | null>(null)
  
  // メール本文を生成
  const generateEmailText = (group: ReportGroup) => {
    const paidItems = group.items
      .map(getPreviewItem)
      .filter(item => item.licenseCost > 0)
    
    const totalEvents = paidItems.reduce((sum, item) => sum + item.events, 0)
    const totalLicenseCost = paidItems.reduce((sum, item) => sum + item.licenseCost, 0)
    
    // 振込予定日（翌月20日）
    const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1
    const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear
    const paymentDate = `${nextYear}年${nextMonth}月20日`
    
    // 通常公演と他店公演を分ける
    const normalItems = paidItems.filter(item => item.internalEvents > 0)
    const externalItems = paidItems.filter(item => item.externalEvents > 0)
    
    const normalText = normalItems.map(item => {
      const gmTestLabel = item.isGMTest ? '（GMテスト）' : ''
      const unitPrice = item.internalLicenseAmount || 0
      const cost = item.internalLicenseCost || 0
      return `・${item.scenarioTitle}${gmTestLabel}: ${item.internalEvents}回 × @¥${unitPrice.toLocaleString()}/回 = ¥${cost.toLocaleString()}`
    }).join('\n')
    
    const externalText = externalItems.length > 0 
      ? '\n\n【他店公演分】\n' + externalItems.map(item => {
          const unitPrice = item.externalLicenseAmount || 0
          const cost = item.externalLicenseCost || 0
          return `・${item.scenarioTitle}: ${item.externalEvents}回 × @¥${unitPrice.toLocaleString()}/回 = ¥${cost.toLocaleString()}`
        }).join('\n')
      : ''
    
    const scenariosText = normalText + externalText
    
    return `${group.authorName} 様

いつもお世話になっております。

${selectedYear}年${selectedMonth}月のライセンス料をご報告いたします。

■ 概要
総公演数: ${totalEvents}回
総ライセンス料: ¥${totalLicenseCost.toLocaleString()}

■ 詳細
${scenariosText}

■ お支払いについて
お支払い予定日: ${paymentDate}まで

請求書は queens.waltz@gmail.com 宛にお送りください。

何かご不明点がございましたら、お気軽にお問い合わせください。

よろしくお願いいたします。
`
  }
  
  // メール本文をコピー
  const handleCopyEmail = async (group: ReportGroup) => {
    const text = generateEmailText(group)
    try {
      await navigator.clipboard.writeText(text)
      setCopiedAuthor(group.authorName)
      setTimeout(() => setCopiedAuthor(null), 2000)
      showToast.success('メール本文をコピーしました')
    } catch (error) {
      logger.error('Failed to copy:', error)
      showToast.error('コピーに失敗しました')
    }
  }
  
  // 月選択
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const selectedYear = currentDate.getFullYear()
  const selectedMonth = currentDate.getMonth() + 1
  
  // 他社公演数の保存（debounce用 - シナリオごとに管理）
  const saveTimeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map())
  // 保存中のシナリオを追跡
  const savingScenarios = useRef<Set<string>>(new Set())
  
  // 他社公演数を保存（SELECT→INSERT/UPDATEパターン）
  const saveExternalInput = useCallback(async (scenarioId: string, count: number) => {
    // 既に保存中なら待機
    if (savingScenarios.current.has(scenarioId)) {
      return
    }
    
    try {
      savingScenarios.current.add(scenarioId)
      setIsSavingExternal(true)
      
      // まず既存レコードを確認
      const { data: existing, error: selectError } = await supabase
        .from('manual_external_performances')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('scenario_id', scenarioId)
        .eq('year', selectedYear)
        .eq('month', selectedMonth)
        .maybeSingle()
      
      if (selectError) {
        logger.error('Failed to check existing record:', selectError)
        showToast.error('他社公演数の保存に失敗しました', selectError.message)
        return
      }
      
      let saveError: Error | null = null
      
      // 認証ユーザーのIDを取得（usersテーブルのid）
      const { data: { user } } = await supabase.auth.getUser()
      const authUserId = user?.id || null
      
      if (count === 0) {
        // 0の場合は削除
        if (existing?.id) {
          const { error } = await supabase
            .from('manual_external_performances')
            .delete()
            .eq('id', existing.id)
          if (error) {
            logger.error('Failed to delete:', error)
            saveError = error
          }
        }
      } else if (existing?.id) {
        // 既存レコードがあれば更新
        const { error } = await supabase
          .from('manual_external_performances')
          .update({
            performance_count: count,
            updated_by: authUserId
          })
          .eq('id', existing.id)
        if (error) {
          logger.error('Failed to update:', error)
          saveError = error
        }
      } else {
        // なければ挿入
        const { error } = await supabase
          .from('manual_external_performances')
          .insert({
            organization_id: organizationId,
            scenario_id: scenarioId,
            year: selectedYear,
            month: selectedMonth,
            performance_count: count,
            updated_by: authUserId
          })
        if (error) {
          // 409 (unique violation) の場合、既存行がある前提でUPDATEにフォールバック
          logger.error('Failed to insert manual_external_performances:', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
            scenarioId,
            organizationId,
            year: selectedYear,
            month: selectedMonth,
            count,
          })
          const maybeConflict =
            error.code === '23505' ||
            String(error.message || '').includes('duplicate') ||
            String(error.details || '').includes('duplicate')

          if (maybeConflict) {
            const { error: updateError } = await supabase
              .from('manual_external_performances')
              .update({
                performance_count: count,
                updated_by: authUserId,
              })
              .eq('organization_id', organizationId)
              .eq('scenario_id', scenarioId)
              .eq('year', selectedYear)
              .eq('month', selectedMonth)

            if (updateError) {
              logger.error('Fallback update failed:', {
                code: updateError.code,
                message: updateError.message,
                details: updateError.details,
                hint: updateError.hint,
              })
              saveError = updateError
            }
          } else {
            saveError = error
          }
        }
      }
      
      if (saveError) {
        showToast.error('他社公演数の保存に失敗しました', saveError.message)
      }
    } catch (error) {
      logger.error('Failed to save external input:', error)
      showToast.error('他社公演数の保存に失敗しました')
    } finally {
      savingScenarios.current.delete(scenarioId)
      // 他に保存中がなければフラグをオフ
      if (savingScenarios.current.size === 0) {
        setIsSavingExternal(false)
      }
    }
  }, [organizationId, selectedYear, selectedMonth])
  
  // 他社公演数の入力ハンドラ（debounce付き - シナリオごと）
  const handleExternalInputChange = useCallback((scenarioId: string, value: number) => {
    // stateを即座に更新
    setExternalInputs(prev => ({
      ...prev,
      [scenarioId]: value
    }))
    
    // このシナリオの既存タイマーをクリア
    const existingTimer = saveTimeoutRefs.current.get(scenarioId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }
    
    // 500ms後に保存
    const timer = setTimeout(() => {
      saveExternalInput(scenarioId, value)
      saveTimeoutRefs.current.delete(scenarioId)
    }, 500)
    saveTimeoutRefs.current.set(scenarioId, timer)
  }, [saveExternalInput])

  // データ取得
  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const [scenarios, stores, performance, externalReports, historyData, manualExternalData, authorsData] = await Promise.all([
        scenarioApi.getAll(),
        storeApi.getAll(),
        salesApi.getScenarioPerformance(startStr, endStr),
        isLicenseManager 
          ? getAllExternalReports({ status: 'approved', startDate: startStr, endDate: endStr }).catch(() => [])
          : Promise.resolve([]),
        // 送信履歴を取得
        supabase
          .from('license_report_history')
          .select('author_name, sent_at, total_events, total_license_cost')
          .eq('year', selectedYear)
          .eq('month', selectedMonth)
          .then(res => res.data || []),
        // 手動入力の他社公演数を取得
        supabase
          .from('manual_external_performances')
          .select('scenario_id, performance_count')
          .eq('year', selectedYear)
          .eq('month', selectedMonth)
          .then(res => res.data || []),
        // 作者データを取得（メモ含む）
        authorApi.getAll().catch(() => [] as Author[])
      ])
      
      // 作者メモをMapに変換
      const authorNotesMap = new Map<string, string>()
      authorsData.forEach((author: Author) => {
        if (author.notes) {
          authorNotesMap.set(author.name, author.notes)
        }
      })

      // 手動入力値をexternalInputsに設定
      const manualInputs: Record<string, number> = {}
      manualExternalData.forEach((item: any) => {
        if (item.performance_count > 0) {
          manualInputs[item.scenario_id] = item.performance_count
        }
      })
      setExternalInputs(manualInputs)

      // 送信履歴をMapに変換
      const historyMap = new Map<string, { sentAt: string; totalEvents: number; totalCost: number }>()
      historyData.forEach((h: any) => {
        historyMap.set(h.author_name, {
          sentAt: h.sent_at,
          totalEvents: h.total_events,
          totalCost: h.total_license_cost
        })
      })
      setSentHistory(historyMap)

      // シナリオIDごとに他社報告数を集計
      const externalCountByScenario = new Map<string, number>()
      externalReports.forEach((report: any) => {
        const scenarioId = report.scenario_id
        const count = report.performance_count || 1
        externalCountByScenario.set(scenarioId, (externalCountByScenario.get(scenarioId) || 0) + count)
      })

      // 報告アイテムを収集（シナリオIDでマージ）
      const itemsByScenario = new Map<string, ReportItem>()

      // 自社公演を処理
      performance.forEach((perf: any) => {
        const scenario = scenarios.find(s => s.id === perf.id || s.title === perf.title)
        if (!scenario?.author) return

        const store = stores.find(s => s.id === perf.store_id)
        const isFranchise = store?.ownership_type === 'franchise'
        const isGMTest = perf.category === 'gmtest'
        const internalEvents = perf.events || 0
        const scenarioKey = isGMTest ? `${scenario.id}_gmtest` : scenario.id

        // 自社公演の単価（店舗の所有形態で判定）
        let internalLicenseAmount = 0
        if (isFranchise) {
          internalLicenseAmount = isGMTest 
            ? (scenario.franchise_gm_test_license_amount || scenario.franchise_license_amount || scenario.gm_test_license_amount || scenario.license_amount || 0)
            : (scenario.franchise_license_amount || scenario.license_amount || 0)
        } else {
          internalLicenseAmount = isGMTest 
            ? (scenario.gm_test_license_amount || 0)
            : (scenario.license_amount || 0)
        }

        // 他社報告の単価（franchise_license_amount を使用）
        const externalLicenseAmount = isGMTest 
          ? (scenario.franchise_gm_test_license_amount || scenario.franchise_license_amount || scenario.gm_test_license_amount || scenario.license_amount || 0)
          : (scenario.franchise_license_amount || scenario.license_amount || 0)

        // 他社報告数（GMテストでない場合のみ）
        const externalEvents = isGMTest ? 0 : (externalCountByScenario.get(scenario.id) || 0)
        const totalEvents = internalEvents + externalEvents
        
        const internalLicenseCost = internalLicenseAmount * internalEvents
        const externalLicenseCost = externalLicenseAmount * externalEvents
        const totalLicenseCost = internalLicenseCost + externalLicenseCost

        if (itemsByScenario.has(scenarioKey)) {
          const existing = itemsByScenario.get(scenarioKey)!
          existing.internalEvents += internalEvents
          existing.externalEvents = externalEvents
          existing.events = existing.internalEvents + existing.externalEvents
          existing.internalLicenseCost += internalLicenseCost
          existing.externalLicenseCost = externalLicenseCost
          existing.licenseCost = existing.internalLicenseCost + existing.externalLicenseCost
        } else {
          itemsByScenario.set(scenarioKey, {
            scenarioId: scenario.id,
            scenarioTitle: isGMTest ? `${perf.title}（GMテスト）` : perf.title,
            author: scenario.author,
            reportDisplayName: scenario.report_display_name || scenario.author,
            authorEmail: scenario.author_email || null,
            events: totalEvents,
            internalEvents,
            externalEvents,
            licenseCost: totalLicenseCost,
            internalLicenseCost,
            externalLicenseCost,
            internalLicenseAmount,
            externalLicenseAmount,
            isGMTest,
            scenarioType: scenario.scenario_type || 'normal'
          })
        }
      })

      // 他社報告のみのシナリオも追加（自社公演がないもの）
      if (isLicenseManager) {
        externalReports.forEach((report: any) => {
          const scenarioInfo = report.scenarios
          if (!scenarioInfo?.author) return

          const scenarioId = report.scenario_id
          if (itemsByScenario.has(scenarioId)) return // 既に存在

          const scenario = scenarios.find(s => s.id === scenarioId)
          const externalEvents = externalCountByScenario.get(scenarioId) || 0
          
          // 他社報告の単価（franchise_license_amount優先）
          const externalLicenseAmount = scenario?.franchise_license_amount || scenario?.license_amount || 0
          const externalLicenseCost = externalLicenseAmount * externalEvents

          itemsByScenario.set(scenarioId, {
            scenarioId,
            scenarioTitle: scenarioInfo.title,
            author: scenarioInfo.author,
            reportDisplayName: scenario?.report_display_name || scenarioInfo.author,
            authorEmail: scenario?.author_email || null,
            events: externalEvents,
            internalEvents: 0,
            externalEvents,
            licenseCost: externalLicenseCost,
            internalLicenseCost: 0,
            externalLicenseCost,
            internalLicenseAmount: scenario?.license_amount || 0,
            externalLicenseAmount,
            isGMTest: false,
            scenarioType: scenario?.scenario_type || 'normal'
          })
        })
      }

      // 全シナリオを表示（公演がなくても他社公演入力のため）
      if (isLicenseManager) {
        scenarios
          .filter(s => s.author)  // 作者がいるシナリオ全て
          .forEach(scenario => {
            // 既に追加されていればスキップ
            if (itemsByScenario.has(scenario.id)) return

            const externalEvents = externalCountByScenario.get(scenario.id) || 0
            const externalLicenseAmount = scenario.franchise_license_amount || scenario.license_amount || 0
            const externalLicenseCost = externalLicenseAmount * externalEvents

            itemsByScenario.set(scenario.id, {
              scenarioId: scenario.id,
              scenarioTitle: scenario.title,
              author: scenario.author,
              reportDisplayName: scenario.report_display_name || scenario.author,
              authorEmail: scenario.author_email || null,
              events: externalEvents,
              internalEvents: 0,
              externalEvents,
              licenseCost: externalLicenseCost,
              internalLicenseCost: 0,
              externalLicenseCost,
              internalLicenseAmount: scenario.license_amount || 0,
              externalLicenseAmount,
              isGMTest: false,
              scenarioType: scenario.scenario_type || 'normal'
            })
          })
      }

      const items = Array.from(itemsByScenario.values())

      // 報告用表示名でグループ化
      const groupMap = new Map<string, ReportGroup>()

      items.forEach(item => {
        const key = item.reportDisplayName  // 報告用表示名でグループ化
        
        if (groupMap.has(key)) {
          const group = groupMap.get(key)!
          group.items.push(item)
          group.totalEvents += item.events
          group.totalInternalEvents += item.internalEvents
          group.totalExternalEvents += item.externalEvents
          group.totalLicenseCost += item.licenseCost
          group.totalInternalLicenseCost += item.internalLicenseCost
          group.totalExternalLicenseCost += item.externalLicenseCost
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
            authorName: item.reportDisplayName,
            originalAuthorName: item.author,
            authorEmail: item.authorEmail,
            authorNotes: authorNotesMap.get(item.author) || null,
            items: [item],
            totalEvents: item.events,
            totalInternalEvents: item.internalEvents,
            totalExternalEvents: item.externalEvents,
            totalLicenseCost: item.licenseCost,
            totalInternalLicenseCost: item.internalLicenseCost,
            totalExternalLicenseCost: item.externalLicenseCost,
            itemsWithEmail: item.authorEmail ? 1 : 0,
            itemsWithoutEmail: item.authorEmail ? 0 : 1,
            hasPartialEmail: false
          })
        }
      })

      // 一部未登録フラグと作者メモを設定
      groupMap.forEach(group => {
        group.hasPartialEmail = group.itemsWithEmail > 0 && group.itemsWithoutEmail > 0
        // 元の作者名でメモを探す（まだ設定されていない場合）
        if (!group.authorNotes) {
          group.authorNotes = authorNotesMap.get(group.originalAuthorName) || null
        }
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

  // 送信プレビューを開く
  const handleOpenSendPreview = (group: ReportGroup) => {
    if (!group.authorEmail) {
      showToast.warning('メールアドレスが登録されていません')
      return
    }

    setSendPreviewTarget(group)
    // 編集後の金額が0円以外のシナリオをデフォルトで選択
    const defaultSelected = new Set(
      group.items
        .filter(item => {
          const extEvents = item.scenarioType === 'managed' && !item.isGMTest 
            ? (externalInputs[item.scenarioId] ?? item.externalEvents)
            : 0
          const totalCost = item.internalLicenseCost + (extEvents * item.externalLicenseAmount)
          return totalCost > 0
        })
        .map(item => item.scenarioId + (item.isGMTest ? '_gmtest' : ''))
    )
    setSelectedScenarioIds(defaultSelected)
    setIsSendPreviewOpen(true)
  }

  // プレビュー用に編集後の値を計算するヘルパー
  const getPreviewItem = (item: ReportItem) => {
    const externalEvents = item.scenarioType === 'managed' && !item.isGMTest
      ? (externalInputs[item.scenarioId] ?? item.externalEvents)
      : 0
    const externalLicenseCost = externalEvents * item.externalLicenseAmount
    const events = item.internalEvents + externalEvents
    const licenseCost = item.internalLicenseCost + externalLicenseCost
    return { ...item, externalEvents, externalLicenseCost, events, licenseCost }
  }

  // 送信実行
  const handleConfirmSend = async () => {
    if (!sendPreviewTarget) return

    const selectedItems = sendPreviewTarget.items
      .filter(item => selectedScenarioIds.has(item.scenarioId + (item.isGMTest ? '_gmtest' : '')))
      .map(getPreviewItem)

    if (selectedItems.length === 0) {
      showToast.warning('送信対象がありません')
      return
    }

    try {
      setIsSending(true)

      const totalEvents = selectedItems.reduce((sum, item) => sum + item.events, 0)
      const totalLicenseCost = selectedItems.reduce((sum, item) => sum + item.licenseCost, 0)

      const { error } = await supabase.functions.invoke('send-author-report', {
        body: {
          to: sendPreviewTarget.authorEmail,
          authorName: sendPreviewTarget.authorName,
          year: selectedYear,
          month: selectedMonth,
          totalEvents,
          totalLicenseCost,
          scenarios: selectedItems.map(item => ({
            title: item.scenarioTitle,
            events: item.events,
            internalEvents: item.internalEvents,
            externalEvents: item.externalEvents,
            internalLicenseAmount: item.internalLicenseAmount,
            externalLicenseAmount: item.externalLicenseAmount,
            internalLicenseCost: item.internalLicenseCost,
            externalLicenseCost: item.externalLicenseCost,
            licenseCost: item.licenseCost,
            isGMTest: item.isGMTest
          }))
        }
      })

      if (error) throw error

      // 送信履歴を保存
      await supabase
        .from('license_report_history')
        .upsert({
          organization_id: organizationId,
          author_name: sendPreviewTarget.authorName,
          author_email: sendPreviewTarget.authorEmail,
          year: selectedYear,
          month: selectedMonth,
          total_events: totalEvents,
          total_license_cost: totalLicenseCost,
          scenarios: selectedItems.map(item => ({
            title: item.scenarioTitle,
            events: item.events,
            licenseCost: item.licenseCost
          }))
        }, { onConflict: 'organization_id,author_name,year,month' })

      // 履歴を更新
      setSentHistory(prev => {
        const newMap = new Map(prev)
        newMap.set(sendPreviewTarget.authorName, {
          sentAt: new Date().toISOString(),
          totalEvents,
          totalCost: totalLicenseCost
        })
        return newMap
      })

      showToast.success('送信完了', `${sendPreviewTarget.authorName}に送信しました`)
      setIsSendPreviewOpen(false)
      setSendPreviewTarget(null)
    } catch (error) {
      logger.error('送信エラー:', error)
      showToast.error('送信失敗')
    } finally {
      setIsSending(false)
    }
  }

  // シナリオ選択トグル
  const toggleScenarioSelection = (item: ReportItem) => {
    const key = item.scenarioId + (item.isGMTest ? '_gmtest' : '')
    const newSet = new Set(selectedScenarioIds)
    if (newSet.has(key)) {
      newSet.delete(key)
    } else {
      newSet.add(key)
    }
    setSelectedScenarioIds(newSet)
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
    let success = 0, fail = 0, skipped = 0

    for (const group of targets) {
      try {
        // 0円のシナリオを除外（報告不要）- 編集後の値を考慮
        const paidItems = group.items
          .map(getPreviewItem)
          .filter(item => item.licenseCost > 0)
        
        if (paidItems.length === 0) {
          skipped++
          continue
        }

        const paidTotalEvents = paidItems.reduce((sum, item) => sum + item.events, 0)
        const paidTotalLicenseCost = paidItems.reduce((sum, item) => sum + item.licenseCost, 0)

        const { error } = await supabase.functions.invoke('send-author-report', {
          body: {
            to: group.authorEmail,
            authorName: group.authorName,
            year: selectedYear,
            month: selectedMonth,
            totalEvents: paidTotalEvents,
            totalLicenseCost: paidTotalLicenseCost,
            scenarios: paidItems.map(item => ({
              title: item.scenarioTitle,
              events: item.events,
              internalEvents: item.internalEvents,
              externalEvents: item.externalEvents,
              internalLicenseAmount: item.internalLicenseAmount,
              externalLicenseAmount: item.externalLicenseAmount,
              internalLicenseCost: item.internalLicenseCost,
              externalLicenseCost: item.externalLicenseCost,
              licenseCost: item.licenseCost,
              isGMTest: item.isGMTest
            }))
          }
        })
        if (error) throw error

        // 送信履歴を保存
        await supabase
          .from('license_report_history')
          .upsert({
            organization_id: organizationId,
            author_name: group.authorName,
            author_email: group.authorEmail,
            year: selectedYear,
            month: selectedMonth,
            total_events: paidTotalEvents,
            total_license_cost: paidTotalLicenseCost,
            scenarios: paidItems.map(item => ({
              title: item.scenarioTitle,
              events: item.events,
              licenseCost: item.licenseCost
            }))
          }, { onConflict: 'organization_id,author_name,year,month' })

        // 履歴を更新
        setSentHistory(prev => {
          const newMap = new Map(prev)
          newMap.set(group.authorName, {
            sentAt: new Date().toISOString(),
            totalEvents: paidTotalEvents,
            totalCost: paidTotalLicenseCost
          })
          return newMap
        })

        success++
      } catch {
        fail++
      }
    }

    setIsSending(false)
    setSelectedGroups(new Set())

    if (fail === 0 && skipped === 0) {
      showToast.success('一括送信完了', `${success}件に送信しました`)
    } else if (fail === 0) {
      showToast.success('一括送信完了', `${success}件送信、${skipped}件スキップ（0円のみ）`)
    } else {
      showToast.warning('一部送信失敗', `成功: ${success}, 失敗: ${fail}, スキップ: ${skipped}`)
    }
  }

  // フィルタリング
  const filteredGroups = reportGroups
    .filter(g => 
      g.authorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.items.some(item => item.scenarioTitle.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'hasEvents':
          // 公演あり（totalEvents > 0）を優先、同じなら名前順
          const aHas = a.totalEvents > 0 ? 1 : 0
          const bHas = b.totalEvents > 0 ? 1 : 0
          cmp = aHas !== bHas ? aHas - bHas : a.authorName.localeCompare(b.authorName, 'ja')
          break
        case 'name':
          cmp = a.authorName.localeCompare(b.authorName, 'ja')
          break
        case 'email':
          cmp = (a.authorEmail || 'zzz').localeCompare(b.authorEmail || 'zzz')
          break
        case 'events':
          cmp = a.totalEvents - b.totalEvents
          break
        case 'cost':
          cmp = a.totalLicenseCost - b.totalLicenseCost
          break
      }
      return sortAsc ? cmp : -cmp
    })

  // 表示モードに応じたイベント数・金額を取得するヘルパー
  const getDisplayEvents = (group: ReportGroup): number => {
    switch (viewMode) {
      case 'internal': return group.totalInternalEvents
      case 'external': return group.totalExternalEvents
      default: return group.totalEvents
    }
  }

  const getDisplayLicenseCost = (group: ReportGroup): number => {
    switch (viewMode) {
      case 'internal': return group.totalInternalLicenseCost
      case 'external': return group.totalExternalLicenseCost
      default: return group.totalLicenseCost
    }
  }

  const getItemDisplayEvents = (item: ReportItem): number => {
    switch (viewMode) {
      case 'internal': return item.internalEvents
      case 'external': return item.externalEvents
      default: return item.events
    }
  }

  const getItemDisplayLicenseCost = (item: ReportItem): number => {
    switch (viewMode) {
      case 'internal': return item.internalLicenseCost
      case 'external': return item.externalLicenseCost
      default: return item.licenseCost
    }
  }

  // 統計
  const stats = {
    totalGroups: filteredGroups.length,
    withEmail: filteredGroups.filter(g => g.authorEmail && g.itemsWithoutEmail === 0).length,
    partialEmail: filteredGroups.filter(g => g.hasPartialEmail).length,
    withoutEmail: filteredGroups.filter(g => !g.authorEmail).length,
    totalEvents: filteredGroups.reduce((sum, g) => sum + getDisplayEvents(g), 0),
    totalInternalEvents: filteredGroups.reduce((sum, g) => sum + g.totalInternalEvents, 0),
    totalExternalEvents: filteredGroups.reduce((sum, g) => sum + g.totalExternalEvents, 0),
    totalLicense: filteredGroups.reduce((sum, g) => sum + getDisplayLicenseCost(g), 0),
    totalInternalLicense: filteredGroups.reduce((sum, g) => sum + g.totalInternalLicenseCost, 0),
    totalExternalLicense: filteredGroups.reduce((sum, g) => sum + g.totalExternalLicenseCost, 0)
  }

  const getGroupKey = (group: ReportGroup) => group.authorName

  // グループが0円のみかどうか（編集後の値を考慮）
  const isGroupZeroCostOnly = (group: ReportGroup) => {
    return group.items.every(item => getPreviewItem(item).licenseCost === 0)
  }

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

  // 報告用表示名編集ダイアログを開く
  const handleOpenDisplayNameDialog = (group: ReportGroup) => {
    setDisplayNameTarget(group)
    setNewDisplayName(group.authorName)
    setIsDisplayNameDialogOpen(true)
  }

  // 報告用表示名を保存（同じ作者の全シナリオを更新）
  const handleSaveDisplayName = async () => {
    if (!displayNameTarget || !newDisplayName.trim()) {
      showToast.error('表示名を入力してください')
      return
    }

    try {
      setIsSavingDisplayName(true)

      // 元の作者名と同じ場合はNULLにリセット
      const displayNameValue = newDisplayName.trim() === displayNameTarget.originalAuthorName 
        ? null 
        : newDisplayName.trim()

      // 同じ作者名を持つ全シナリオを更新（月をまたいでも反映されるように）
      const { data: updatedScenarios, error } = await supabase
        .from('scenarios')
        .update({ report_display_name: displayNameValue })
        .eq('author', displayNameTarget.originalAuthorName)
        .select('id')

      if (error) throw error

      const count = updatedScenarios?.length || 0
      showToast.success('更新完了', `${count}件のシナリオの表示名を更新しました`)
      setIsDisplayNameDialogOpen(false)
      setDisplayNameTarget(null)
      setNewDisplayName('')
      loadData() // データ再読み込み
    } catch (error) {
      logger.error('表示名更新エラー:', error)
      showToast.error('更新に失敗しました')
    } finally {
      setIsSavingDisplayName(false)
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
      <ScenarioEditDialogV2
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

      {/* 報告用表示名編集ダイアログ */}
      <Dialog open={isDisplayNameDialogOpen} onOpenChange={setIsDisplayNameDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>報告用表示名の編集</DialogTitle>
            <DialogDescription>
              作者名を変更せずに、報告用の表示名を設定できます
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>元の作者名</Label>
              <div className="p-2 bg-muted rounded text-sm">
                {displayNameTarget?.originalAuthorName}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">報告用表示名</Label>
              <Input
                id="displayName"
                placeholder="報告用の表示名を入力"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                元の作者名と同じ場合はリセットされます
              </p>
            </div>

            <div className="space-y-2">
              <Label>対象シナリオ ({displayNameTarget?.items.length || 0}件)</Label>
              <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                {displayNameTarget?.items.map((item, idx) => (
                  <div key={idx} className="text-sm">
                    • {item.scenarioTitle}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDisplayNameDialogOpen(false)}
              disabled={isSavingDisplayName}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleSaveDisplayName}
              disabled={isSavingDisplayName || !newDisplayName.trim()}
            >
              {isSavingDisplayName ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  更新中...
                </>
              ) : (
                '保存'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 送信プレビューダイアログ */}
      <Dialog open={isSendPreviewOpen} onOpenChange={setIsSendPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>レポート送信プレビュー</DialogTitle>
            <DialogDescription>
              {sendPreviewTarget?.authorName} ({sendPreviewTarget?.authorEmail}) へ
              {selectedYear}年{selectedMonth}月のレポートを送信
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* 送信内容サマリー */}
            <div className="flex gap-4 p-3 bg-muted rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {sendPreviewTarget?.items
                    .filter(item => selectedScenarioIds.has(item.scenarioId + (item.isGMTest ? '_gmtest' : '')))
                    .map(getPreviewItem)
                    .reduce((sum, item) => sum + item.events, 0) || 0}
                </div>
                <div className="text-xs text-muted-foreground">公演数</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  ¥{(sendPreviewTarget?.items
                    .filter(item => selectedScenarioIds.has(item.scenarioId + (item.isGMTest ? '_gmtest' : '')))
                    .map(getPreviewItem)
                    .reduce((sum, item) => sum + item.licenseCost, 0) || 0).toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">ライセンス料</div>
              </div>
            </div>

            {/* シナリオ一覧（チェックボックス付き） */}
            <div className="space-y-2">
              <Label>送信するシナリオを選択</Label>
              <div className="max-h-60 overflow-y-auto border rounded-md divide-y">
                {sendPreviewTarget?.items.map((item, idx) => {
                  const key = item.scenarioId + (item.isGMTest ? '_gmtest' : '')
                  const isSelected = selectedScenarioIds.has(key)
                  const previewItem = getPreviewItem(item)
                  const isZeroCost = previewItem.licenseCost === 0

                  return (
                    <div 
                      key={idx}
                      className={`p-3 ${isZeroCost ? 'bg-muted/30' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleScenarioSelection(item)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span 
                              className={`text-sm truncate cursor-pointer hover:underline ${isZeroCost ? 'text-muted-foreground' : ''}`}
                              onClick={() => toggleScenarioSelection(item)}
                            >
                              {item.scenarioTitle}
                            </span>
                            {item.isGMTest && (
                              <Badge variant="outline" className="text-xs shrink-0">GMテスト</Badge>
                            )}
                            {isZeroCost && (
                              <Badge variant="secondary" className="text-xs shrink-0">0円</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* 詳細行：自社・他社・合計 */}
                      <div className="mt-2 ml-7 flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1">
                          <Home className="w-3 h-3 text-blue-500" />
                          <span>{item.internalEvents}回</span>
                          <span className="text-muted-foreground">@¥{item.internalLicenseAmount.toLocaleString()}</span>
                        </div>
                        {item.scenarioType === 'managed' && !item.isGMTest && (
                          <div className="flex items-center gap-1">
                            <Building className="w-3 h-3 text-green-500" />
                            <Input
                              type="number"
                              min={0}
                              className="w-16 h-6 text-xs px-1"
                              value={externalInputs[item.scenarioId] ?? item.externalEvents}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0
                                setExternalInputs(prev => ({
                                  ...prev,
                                  [item.scenarioId]: val
                                }))
                              }}
                            />
                            <span className="text-muted-foreground">@¥{item.externalLicenseAmount.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="ml-auto font-medium">
                          = ¥{previewItem.licenseCost.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                ※ 0円のシナリオはデフォルトで除外されています
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSendPreviewOpen(false)}
              disabled={isSending}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleConfirmSend}
              disabled={isSending || selectedScenarioIds.size === 0}
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  送信中...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  送信する ({selectedScenarioIds.size}件)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <MonthSwitcher value={currentDate} onChange={setCurrentDate} />
          {isSavingExternal && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>保存中...</span>
            </div>
          )}
        </div>
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

      {/* 検索・ソート・表示モード切り替え */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="作者名・シナリオ名で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        {/* ソート切り替え */}
        <Select 
          value={sortKey} 
          onValueChange={(value) => setSortKey(value as SortKey)}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hasEvents">公演あり優先</SelectItem>
            <SelectItem value="name">名前順</SelectItem>
            <SelectItem value="email">メアド順</SelectItem>
            <SelectItem value="events">公演数順</SelectItem>
            <SelectItem value="cost">金額順</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSortAsc(!sortAsc)}
          title={sortAsc ? '昇順' : '降順'}
        >
          {sortAsc ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
        
        {/* 表示モード切り替え */}
        {isLicenseManager && (
          <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
            <Button
              variant={viewMode === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('all')}
              className="gap-1"
            >
              <Layers className="w-4 h-4" />
              <span className="hidden sm:inline">合計</span>
            </Button>
            <Button
              variant={viewMode === 'internal' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('internal')}
              className="gap-1"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">自社</span>
            </Button>
            <Button
              variant={viewMode === 'external' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('external')}
              className="gap-1"
            >
              <Building className="w-4 h-4" />
              <span className="hidden sm:inline">他社</span>
            </Button>
          </div>
        )}
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
            <div className="text-sm text-muted-foreground flex flex-col">
              <span>総公演数</span>
              {isLicenseManager && viewMode === 'all' && (
                <span className="text-xs">
                  (自社{stats.totalInternalEvents} / 他社{stats.totalExternalEvents})
                </span>
              )}
            </div>
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
            // 編集後の合計公演数を計算（externalInputsを考慮）
            const editedTotalEvents = group.items.reduce((sum, item) => sum + getPreviewItem(item).events, 0)
            const hasNoEvents = editedTotalEvents === 0

            return (
              <Card key={key} className={`${isSelected ? 'ring-2 ring-primary' : ''} ${hasNoEvents ? 'opacity-50' : ''}`}>
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
                          <button
                            className="font-semibold hover:text-primary hover:underline transition-colors text-left"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenDisplayNameDialog(group)
                            }}
                            title="クリックして表示名を編集"
                          >
                            {group.authorName}
                          </button>
                          {group.authorName !== group.originalAuthorName && (
                            <Badge variant="secondary" className="text-xs">
                              編集済
                            </Badge>
                          )}
                          {sentHistory.has(group.authorName) && (
                            <Badge className="text-xs bg-green-100 text-green-800 hover:bg-green-100">
                              ✓ 送信済 {new Date(sentHistory.get(group.authorName)!.sentAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                            </Badge>
                          )}
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
                          {/* 作者メモ */}
                          {group.authorNotes && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge 
                                    variant="outline" 
                                    className="text-xs text-amber-600 cursor-help hover:bg-amber-50 transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <StickyNote className="w-3 h-3 mr-1" />
                                    メモ
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs whitespace-pre-wrap">
                                  <p className="text-sm">{group.authorNotes}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span>
                            {getDisplayEvents(group)}公演
                            {isLicenseManager && viewMode === 'all' && (
                              <span className="text-xs ml-1">
                                (自社{group.totalInternalEvents}/他社{group.totalExternalEvents})
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-1">
                            <JapaneseYen className="w-3 h-3" />
                            {getDisplayLicenseCost(group).toLocaleString()}
                          </span>
                          <span>{group.items.length}シナリオ</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isGroupZeroCostOnly(group) && (
                          <Badge variant="secondary" className="text-xs">
                            報告不要
                          </Badge>
                        )}
                        {!isGroupZeroCostOnly(group) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCopyEmail(group)
                            }}
                            title="メール本文をコピー"
                          >
                            {copiedAuthor === group.authorName ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                        {group.authorEmail && !isGroupZeroCostOnly(group) && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isSending}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenSendPreview(group)
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
                      {/* ヘッダー行（ライセンス管理者のみ） */}
                      {isLicenseManager && (
                        <div className="flex items-center justify-between py-1 px-3 text-xs text-muted-foreground border-b">
                          <span>シナリオ名</span>
                          <div className="flex items-center gap-2 text-right">
                            <span className="w-24">自社</span>
                            <span className="w-24">他社</span>
                            <span className="w-24">合計</span>
                          </div>
                        </div>
                      )}
                      
                      {group.items.map((item, idx) => (
                        <div 
                          key={idx}
                          className={`flex items-center justify-between py-2 px-3 rounded ${
                            item.licenseCost === 0 
                              ? 'bg-muted/20 opacity-60' 
                              : 'bg-muted/30'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              className="text-sm text-left hover:underline hover:text-primary transition-colors"
                              onClick={() => handleEditScenario(item.scenarioId)}
                            >
                              {item.scenarioTitle}
                            </button>
                            {item.isGMTest && (
                              <Badge variant="outline" className="text-xs">GMテスト</Badge>
                            )}
                            {item.licenseCost === 0 && (
                              <Badge variant="secondary" className="text-xs text-muted-foreground">
                                報告不要
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            {isLicenseManager ? (
                              <>
                                {/* 自社（回数 × 単価 = 金額） */}
                                <div className="w-24 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Home className="w-3 h-3 text-blue-500" />
                                    <span>{item.internalEvents}回</span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    @¥{item.internalLicenseAmount.toLocaleString()}
                                  </div>
                                  <div className="font-medium text-blue-600">
                                    ¥{item.internalLicenseCost.toLocaleString()}
                                  </div>
                                </div>
                                {/* 他社（回数 × 単価 = 金額）- 管理作品のみ表示・編集可能 */}
                                {item.scenarioType === 'managed' && !item.isGMTest ? (
                                  <div className="w-28 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Building className="w-3 h-3 text-green-500" />
                                      <Input
                                        type="number"
                                        min={0}
                                        className="w-14 h-6 text-xs text-right px-1"
                                        value={externalInputs[item.scenarioId] ?? item.externalEvents}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value) || 0
                                          handleExternalInputChange(item.scenarioId, val)
                                        }}
                                      />
                                      <span className="text-xs">回</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      @¥{item.externalLicenseAmount.toLocaleString()}
                                    </div>
                                    <div className="font-medium text-green-600">
                                      ¥{((externalInputs[item.scenarioId] ?? item.externalEvents) * item.externalLicenseAmount).toLocaleString()}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="w-28 text-right text-muted-foreground text-xs">
                                    -
                                  </div>
                                )}
                                {/* 合計 */}
                                <div className="w-24 text-right">
                                  {(() => {
                                    const extEvents = item.scenarioType === 'managed' && !item.isGMTest 
                                      ? (externalInputs[item.scenarioId] ?? item.externalEvents)
                                      : 0
                                    const extCost = extEvents * item.externalLicenseAmount
                                    const totalEvents = item.internalEvents + extEvents
                                    const totalCost = item.internalLicenseCost + extCost
                                    return (
                                      <>
                                        <div className="font-medium">{totalEvents}回</div>
                                        <div className="text-xs text-muted-foreground">&nbsp;</div>
                                        <div className="font-bold">
                                          ¥{totalCost.toLocaleString()}
                                        </div>
                                      </>
                                    )
                                  })()}
                                </div>
                              </>
                            ) : (
                              <>
                                <span>{item.internalEvents}回</span>
                                <span className="text-muted-foreground">
                                  @¥{item.internalLicenseAmount.toLocaleString()}
                                </span>
                                <span className="font-medium">
                                  ¥{item.internalLicenseCost.toLocaleString()}
                                </span>
                              </>
                            )}
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

