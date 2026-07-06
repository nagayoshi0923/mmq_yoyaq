/**
 * 送信報告タブ - 作者・会社への公演報告を統合
 * 
 * 報告先の判定ルール:
 * - author_email あり → 作者に報告（メール送信）
 * - author_email なし → 管理会社に報告
 */
import { useState, useCallback, useRef } from 'react'
import { useSessionState } from '@/hooks/useSessionState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ListSkeleton, EmptyState } from '@/components/patterns/list'
import { ScenarioEditDialogV2 } from '@/components/modals/ScenarioEditDialogV2'
import { authorApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'
import { buildReportEmailText, buildSendEmailBody } from './sendReports/emailBody'
import { computePreviewItem } from './sendReports/reportItems'
import { compareReportGroups } from './sendReports/sorting'
import { useSendReportsData } from './sendReports/useSendReportsData'
import type { ReportItem, ReportGroup, EmailBodyEditTarget } from './sendReports/types'
import { EmailBodyEditDialog } from './sendReports/dialogs/EmailBodyEditDialog'
import { BulkEmailDialog } from './sendReports/dialogs/BulkEmailDialog'
import { DisplayNameDialog } from './sendReports/dialogs/DisplayNameDialog'
import { SendPreviewDialog } from './sendReports/dialogs/SendPreviewDialog'
import { ReportStatsCards } from './sendReports/components/ReportStatsCards'
import { ReportGroupCard } from './sendReports/components/ReportGroupCard'
import { ReportToolbar } from './sendReports/components/ReportToolbar'
import { ConfirmDialog } from '@/components/patterns/modal'

interface SendReportsProps {
  organizationId: string
  staffId: string
  isLicenseManager: boolean
}

// 表示モード
type ViewMode = 'all' | 'internal' | 'external'

export function SendReports({ organizationId, staffId, isLicenseManager }: SendReportsProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [isSending, setIsSending] = useState(false)
  
  // 表示モード切り替え（自社のみ/他社のみ/合計）
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  
  const [isSavingExternal, setIsSavingExternal] = useState(false)
  const [isSavingInternal, setIsSavingInternal] = useState(false)

  // 一括送信 確認ダイアログ
  const [batchSendTargets, setBatchSendTargets] = useState<ReportGroup[] | null>(null)
  
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
  const [newAuthorNotes, setNewAuthorNotes] = useState('')
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false)
  
  // 送信プレビューダイアログ
  const [isSendPreviewOpen, setIsSendPreviewOpen] = useState(false)
  const [sendPreviewTarget, setSendPreviewTarget] = useState<ReportGroup | null>(null)
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<Set<string>>(new Set())
  const [emailBodyText, setEmailBodyText] = useState('')
  const [sendPreviewTab, setSendPreviewTab] = useState<'scenarios' | 'body'>('scenarios')
  const [isBodyManuallyEdited, setIsBodyManuallyEdited] = useState(false)
  
  // ソート設定（sessionStorageで保持 - リロード後も維持）
  type SortKey = 'hasEvents' | 'name' | 'email' | 'events' | 'cost'
  const [sortKey, setSortKey] = useSessionState<SortKey>('licenseManagementSortKey', 'hasEvents')
  const [sortAsc, setSortAsc] = useSessionState<boolean>('licenseManagementSortAsc', false)
  
  const [isEmailBodyEditOpen, setIsEmailBodyEditOpen] = useState(false)
  const [emailBodyEditTarget, setEmailBodyEditTarget] = useState<EmailBodyEditTarget | null>(null)
  const [isSavingEmailBody, setIsSavingEmailBody] = useState(false)
  
  // コピー済み状態（作者名 → タイムアウトID）
  const [copiedAuthor, setCopiedAuthor] = useState<string | null>(null)
  
  // メール本文を生成（コピー用）。明細生成は sendReports/emailBody の純関数へ委譲。
  const generateEmailText = (group: ReportGroup) => {
    const paidItems = group.items
      .map(getPreviewItem)
      .filter(item => item.licenseCost > 0)
    return buildReportEmailText(group.authorName, paidItems, selectedYear, selectedMonth)
  }

  // 選択シナリオから送信用メール本文を生成。明細生成は純関数へ委譲。
  const generateEmailBodyForItems = (group: ReportGroup, selectedIds: Set<string>) => {
    const paidItems = group.items
      .filter(item => selectedIds.has(item.scenarioKey))
      .map(getPreviewItem)
      .filter(item => item.licenseCost > 0)
    return buildSendEmailBody(group.authorName, paidItems, selectedYear, selectedMonth)
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
  
  // 月選択（sessionStorageで保持 - ページリロード・タブ遷移後も維持）
  const [selectedYear, setSelectedYear] = useSessionState('licenseManagementYear', new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useSessionState('licenseManagementMonth', new Date().getMonth() + 1)

  // データ層（取得・サーバーデータ state・年月変更時の再取得 effect）はフックへ分離
  const {
    loading,
    reportGroups,
    externalInputs,
    internalInputs,
    sentHistory,
    setReportGroups,
    setExternalInputs,
    setInternalInputs,
    setSentHistory,
    reload,
  } = useSendReportsData(organizationId, selectedYear, selectedMonth, isLicenseManager)
  const currentDate = new Date(selectedYear, selectedMonth - 1, 1)
  const setCurrentDate = useCallback((date: Date) => {
    setSelectedYear(date.getFullYear())
    setSelectedMonth(date.getMonth() + 1)
  }, [setSelectedYear, setSelectedMonth])
  
  // 他社公演数の保存（debounce用 - シナリオごとに管理）
  const saveTimeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map())
  // 保存中のシナリオを追跡
  const savingScenarios = useRef<Set<string>>(new Set())
  
  // 他社公演数を保存（scenarioKey = scenarioId or scenarioId_gmtest）
  const saveExternalInput = useCallback(async (scenarioKey: string, count: number) => {
    if (savingScenarios.current.has(scenarioKey)) return

    // scenarioKey から scenarioId と performance_type を分解
    const isGMTestKey = scenarioKey.endsWith('_gmtest')
    const scenarioId = isGMTestKey ? scenarioKey.slice(0, -'_gmtest'.length) : scenarioKey
    const performanceType = isGMTestKey ? 'gmtest' : 'normal'

    try {
      savingScenarios.current.add(scenarioKey)
      setIsSavingExternal(true)

      const { data: { user } } = await supabase.auth.getUser()
      const authUserId = user?.id || null

      const { error } = await supabase.rpc('upsert_manual_external_performance', {
        p_organization_id: organizationId,
        p_scenario_id: scenarioId,
        p_year: selectedYear,
        p_month: selectedMonth,
        p_performance_count: count,
        p_updated_by: authUserId,
        p_performance_type: performanceType,
      })

      if (error) {
        logger.error('Failed to save manual_external_performance:', error)
        showToast.error('他社公演数の保存に失敗しました', getSafeErrorMessage(error))
      }
    } catch (error) {
      logger.error('Failed to save external input:', error)
      showToast.error('他社公演数の保存に失敗しました')
    } finally {
      savingScenarios.current.delete(scenarioKey)
      if (savingScenarios.current.size === 0) {
        setIsSavingExternal(false)
      }
    }
  }, [organizationId, selectedYear, selectedMonth])
  
  // 自社公演数の上書きを保存
  const saveInternalInput = useCallback(async (scenarioKey: string, count: number) => {
    if (savingScenarios.current.has(`internal_${scenarioKey}`)) return
    try {
      savingScenarios.current.add(`internal_${scenarioKey}`)
      setIsSavingInternal(true)
      const { data: { user } } = await supabase.auth.getUser()
      const authUserId = user?.id || null
      const { error } = await supabase.rpc('upsert_manual_internal_performance_override', {
        p_organization_id: organizationId,
        p_scenario_key: scenarioKey,
        p_year: selectedYear,
        p_month: selectedMonth,
        p_performance_count: count,
        p_updated_by: authUserId,
      })
      if (error) {
        logger.error('Failed to save internal override:', error)
        showToast.error('自社公演数の保存に失敗しました', getSafeErrorMessage(error))
      }
    } catch (error) {
      logger.error('Failed to save internal override:', error)
      showToast.error('自社公演数の保存に失敗しました')
    } finally {
      savingScenarios.current.delete(`internal_${scenarioKey}`)
      if (savingScenarios.current.size === 0) setIsSavingInternal(false)
    }
  }, [organizationId, selectedYear, selectedMonth])

  // 自社公演数の入力ハンドラ（debounce付き）
  const handleInternalInputChange = useCallback((scenarioKey: string, value: number | undefined) => {
    setInternalInputs(prev => ({ ...prev, [scenarioKey]: value }))
    // プレビュー表示中は、手入力込みの金額でチェックを自動追随（>0でON / 0でOFF）
    if (isSendPreviewOpen && sendPreviewTarget) {
      const item = sendPreviewTarget.items.find(i => i.scenarioKey === scenarioKey)
      if (item) {
        const preview = computePreviewItem(item, { ...internalInputs, [scenarioKey]: value }, externalInputs)
        setSelectedScenarioIds(prev => {
          const next = new Set(prev)
          if (preview.licenseCost > 0) next.add(scenarioKey)
          else next.delete(scenarioKey)
          return next
        })
      }
    }
    const existingTimer = saveTimeoutRefs.current.get(`internal_${scenarioKey}`)
    if (existingTimer) clearTimeout(existingTimer)
    const timer = setTimeout(() => {
      saveInternalInput(scenarioKey, value ?? 0)
      saveTimeoutRefs.current.delete(`internal_${scenarioKey}`)
    }, 500)
    saveTimeoutRefs.current.set(`internal_${scenarioKey}`, timer)
  }, [saveInternalInput, setInternalInputs, isSendPreviewOpen, sendPreviewTarget, internalInputs, externalInputs])

  // 他社公演数の入力ハンドラ（debounce付き。キー = scenarioKey）
  const handleExternalInputChange = useCallback((scenarioKey: string, value: number) => {
    setExternalInputs(prev => ({
      ...prev,
      [scenarioKey]: value
    }))

    // プレビュー表示中は、手入力込みの金額でチェックを自動追随（>0でON / 0でOFF）
    if (isSendPreviewOpen && sendPreviewTarget) {
      const item = sendPreviewTarget.items.find(i => i.scenarioKey === scenarioKey)
      if (item) {
        const preview = computePreviewItem(item, internalInputs, { ...externalInputs, [scenarioKey]: value })
        setSelectedScenarioIds(prev => {
          const next = new Set(prev)
          if (preview.licenseCost > 0) next.add(scenarioKey)
          else next.delete(scenarioKey)
          return next
        })
      }
    }

    const existingTimer = saveTimeoutRefs.current.get(scenarioKey)
    if (existingTimer) clearTimeout(existingTimer)

    const timer = setTimeout(() => {
      saveExternalInput(scenarioKey, value)
      saveTimeoutRefs.current.delete(scenarioKey)
    }, 500)
    saveTimeoutRefs.current.set(scenarioKey, timer)
  }, [saveExternalInput, setExternalInputs, isSendPreviewOpen, sendPreviewTarget, internalInputs, externalInputs])


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
    // 編集後の金額（手入力込み・getPreviewItem 基準）が0円以外のシナリオをデフォルト選択
    const defaultSelected = new Set(
      group.items
        .filter(item => getPreviewItem(item).licenseCost > 0)
        .map(item => item.scenarioKey)
    )
    setSelectedScenarioIds(defaultSelected)
    setEmailBodyText(generateEmailBodyForItems(group, defaultSelected))
    setSendPreviewTab('scenarios')
    setIsBodyManuallyEdited(false)
    setIsSendPreviewOpen(true)
  }

  // プレビュー用に編集後の値を計算するヘルパー
  // 計算コアは sendReports/reportItems の純関数へ委譲。状態（上書きマップ）のみここで注入。
  const getPreviewItem = (item: ReportItem) => computePreviewItem(item, internalInputs, externalInputs)

  // メール本文の編集保存
  const handleSaveEmailBody = async () => {
    if (!emailBodyEditTarget) return
    setIsSavingEmailBody(true)
    try {
      await supabase
        .from('license_report_history')
        .update({ email_body: emailBodyEditTarget.emailBody, subject: emailBodyEditTarget.subject })
        .eq('organization_id', organizationId)
        .eq('author_name', emailBodyEditTarget.authorName)
        .eq('year', selectedYear)
        .eq('month', selectedMonth)

      setSentHistory(prev => {
        const newMap = new Map(prev)
        const existing = newMap.get(emailBodyEditTarget.authorName)
        if (existing) {
          newMap.set(emailBodyEditTarget.authorName, {
            ...existing,
            emailBody: emailBodyEditTarget.emailBody,
            subject: emailBodyEditTarget.subject,
          })
        }
        return newMap
      })
      showToast.success('保存しました')
      setIsEmailBodyEditOpen(false)
      setEmailBodyEditTarget(null)
    } catch (error) {
      logger.error('メール本文の保存に失敗:', error)
      showToast.error('保存に失敗しました')
    } finally {
      setIsSavingEmailBody(false)
    }
  }

  // 送信実行
  const handleConfirmSend = async () => {
    if (!sendPreviewTarget) return

    const selectedItems = sendPreviewTarget.items
      .filter(item => selectedScenarioIds.has(item.scenarioKey))
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
          customTextBody: emailBodyText || undefined,
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

      const sentSubject = `【${selectedYear}年${selectedMonth}月】ライセンス料レポート - ${sendPreviewTarget.authorName}`
      const sentBody = emailBodyText || generateEmailBodyForItems(sendPreviewTarget, selectedScenarioIds)

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
          email_body: sentBody,
          subject: sentSubject,
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
          totalCost: totalLicenseCost,
          emailBody: sentBody,
          subject: sentSubject,
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
    const key = item.scenarioKey
    const newSet = new Set(selectedScenarioIds)
    if (newSet.has(key)) {
      newSet.delete(key)
    } else {
      newSet.add(key)
    }
    setSelectedScenarioIds(newSet)
  }

  // 一括送信
  const handleBatchSend = () => {
    const targets = filteredGroups.filter(g => g.authorEmail && selectedGroups.has(g.authorName))
    if (targets.length === 0) {
      showToast.warning('送信対象がありません')
      return
    }
    setBatchSendTargets(targets)
  }

  const runBatchSend = async () => {
    const targets = batchSendTargets
    if (!targets || targets.length === 0) return

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

        const batchSubject = `【${selectedYear}年${selectedMonth}月】ライセンス料レポート - ${group.authorName}`
        const batchBody = generateEmailBodyForItems(group, new Set(paidItems.map(item => item.scenarioKey)))

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
            email_body: batchBody,
            subject: batchSubject,
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
            totalCost: paidTotalLicenseCost,
            emailBody: batchBody,
            subject: batchSubject,
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
    setBatchSendTargets(null)

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
    .sort((a, b) => compareReportGroups(a, b, sortKey, sortAsc))

  // 表示モードに応じたイベント数・金額を取得するヘルパー。
  // 手動上書き（internalInputs/externalInputs）を getPreviewItem 経由で反映するため、
  // group の静的集計ではなく明細を都度プレビュー集計する（リスト操作が即ヘッダーに反映され、送信値とも一致）。
  const getDisplayEvents = (group: ReportGroup): number => {
    const items = group.items.map(getPreviewItem)
    switch (viewMode) {
      case 'internal': return items.reduce((sum, i) => sum + i.internalEvents, 0)
      case 'external': return items.reduce((sum, i) => sum + i.externalEvents, 0)
      default: return items.reduce((sum, i) => sum + i.events, 0)
    }
  }

  const getDisplayLicenseCost = (group: ReportGroup): number => {
    const items = group.items.map(getPreviewItem)
    switch (viewMode) {
      case 'internal': return items.reduce((sum, i) => sum + i.internalLicenseCost, 0)
      case 'external': return items.reduce((sum, i) => sum + i.externalLicenseCost, 0)
      default: return items.reduce((sum, i) => sum + i.licenseCost, 0)
    }
  }

  // 自社/他社の内訳（上書き反映）
  const getDisplayInternalEvents = (group: ReportGroup): number =>
    group.items.map(getPreviewItem).reduce((sum, i) => sum + i.internalEvents, 0)
  const getDisplayExternalEvents = (group: ReportGroup): number =>
    group.items.map(getPreviewItem).reduce((sum, i) => sum + i.externalEvents, 0)

  // 送信時スナップショット（license_report_history）と現在の集計の差分。
  // 送信後にスケジュールや手動上書きが変わると、報告済み金額と実値がズレるため、
  // 有料明細（licenseCost>0・送信時と同じ基準）で公演数・金額を比較し、どちらかが違えば差分とみなす。
  const getReportDrift = (
    group: ReportGroup,
  ): { events: number; cost: number; sentEvents: number; sentCost: number } | null => {
    const sent = sentHistory.get(group.authorName)
    if (!sent) return null
    const paid = group.items.map(getPreviewItem).filter(i => i.licenseCost > 0)
    const events = paid.reduce((sum, i) => sum + i.events, 0)
    const cost = paid.reduce((sum, i) => sum + i.licenseCost, 0)
    if (events === sent.totalEvents && cost === sent.totalCost) return null
    return { events, cost, sentEvents: sent.totalEvents, sentCost: sent.totalCost }
  }

  // 送信済みメールの確認・編集ダイアログを開く（送信済バッジ／差分バッジ共通）
  const handleOpenSentEmail = (group: ReportGroup) => {
    const h = sentHistory.get(group.authorName)
    if (!h) return
    setEmailBodyEditTarget({
      authorName: group.authorName,
      emailBody: h.emailBody ?? '',
      subject: h.subject ?? `【${selectedYear}年${selectedMonth}月】ライセンス料レポート - ${group.authorName}`,
    })
    setIsEmailBodyEditOpen(true)
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
    totalInternalEvents: filteredGroups.reduce((sum, g) => sum + getDisplayInternalEvents(g), 0),
    totalExternalEvents: filteredGroups.reduce((sum, g) => sum + getDisplayExternalEvents(g), 0),
    totalLicense: filteredGroups.reduce((sum, g) => sum + getDisplayLicenseCost(g), 0),
    totalInternalLicense: filteredGroups.reduce((sum, g) => sum + g.items.map(getPreviewItem).reduce((s, i) => s + i.internalLicenseCost, 0), 0),
    totalExternalLicense: filteredGroups.reduce((sum, g) => sum + g.items.map(getPreviewItem).reduce((s, i) => s + i.externalLicenseCost, 0), 0)
  }

  const getGroupKey = (group: ReportGroup) =>
    group.authorEmail ? `email:${group.authorEmail}` : `name:${group.originalAuthorName}`

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
    reload() // データ再読み込み
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

      // 各シナリオのauthor_emailを更新（scenario_masters に保存）
      const { error } = await supabase
        .from('scenario_masters')
        .update({ author_email: bulkEmail.trim() })
        .in('id', scenarioIds)

      if (error) throw error

      showToast.success('一括登録完了', `${scenarioIds.length}件のシナリオにメールアドレスを登録しました`)

      // 画面リロードなしでstateを直接更新
      const newEmail = bulkEmail.trim()
      setReportGroups(prev => prev.map(group => {
        if (group.authorName !== bulkEmailTarget.authorName) return group
        const updatedItems = group.items.map(item => ({ ...item, authorEmail: newEmail }))
        return {
          ...group,
          authorEmail: newEmail,
          items: updatedItems,
          itemsWithEmail: updatedItems.length,
          itemsWithoutEmail: 0,
          hasPartialEmail: false,
        }
      }))

      setIsBulkEmailDialogOpen(false)
      setBulkEmailTarget(null)
      setBulkEmail('')
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
    setNewAuthorNotes(group.authorNotes || '')
    setIsDisplayNameDialogOpen(true)
  }

  // 報告用表示名とメモを保存
  const handleSaveDisplayName = async () => {
    if (!displayNameTarget || !newDisplayName.trim()) {
      showToast.error('表示名を入力してください')
      return
    }

    try {
      setIsSavingDisplayName(true)

      const trimmedDisplayName = newDisplayName.trim()
      const notesValue = newAuthorNotes.trim() || null

      // グループ内の全ユニーク元作者に license_organization_name を保存
      // （同じメアド＝同じ会社として全員に同じ会社名を設定）
      // set_author_organization_name 専用RPC を使用（upsert_authorのキャッシュ問題を回避）
      const uniqueAuthors = [...new Set(displayNameTarget.items.map(item => item.author))]
      for (const authorName of uniqueAuthors) {
        const notes = authorName === displayNameTarget.originalAuthorName ? notesValue : undefined
        await authorApi.setOrganizationName(authorName, trimmedDisplayName, notes)
      }

      showToast.success('更新完了', '会社名（ライセンス組織名）を更新しました')

      // 画面リロードなしでグループ表示名を直接更新
      setReportGroups(prev => prev.map(group => {
        if (group.authorName !== displayNameTarget.authorName) return group
        return {
          ...group,
          authorName: trimmedDisplayName,
          authorNotes: notesValue,
        }
      }))

      setIsDisplayNameDialogOpen(false)
      setDisplayNameTarget(null)
      setNewDisplayName('')
      setNewAuthorNotes('')
    } catch (error) {
      logger.error('表示名更新エラー:', error)
      showToast.error('更新に失敗しました')
    } finally {
      setIsSavingDisplayName(false)
    }
  }

  if (loading) {
    return <ListSkeleton rows={4} variant="card" />
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


      {/* 送信済みメール確認・編集ダイアログ */}
      <EmailBodyEditDialog
        open={isEmailBodyEditOpen}
        onClose={() => { setIsEmailBodyEditOpen(false); setEmailBodyEditTarget(null) }}
        target={emailBodyEditTarget}
        setTarget={setEmailBodyEditTarget}
        year={selectedYear}
        month={selectedMonth}
        isSaving={isSavingEmailBody}
        onSave={handleSaveEmailBody}
      />

      {/* 一括メール登録ダイアログ */}
      <BulkEmailDialog
        open={isBulkEmailDialogOpen}
        onOpenChange={setIsBulkEmailDialogOpen}
        target={bulkEmailTarget}
        email={bulkEmail}
        setEmail={setBulkEmail}
        isSaving={isSavingEmail}
        onSave={handleBulkEmailSave}
      />

      {/* 報告用表示名・メモ編集ダイアログ */}
      <DisplayNameDialog
        open={isDisplayNameDialogOpen}
        onOpenChange={setIsDisplayNameDialogOpen}
        target={displayNameTarget}
        displayName={newDisplayName}
        setDisplayName={setNewDisplayName}
        authorNotes={newAuthorNotes}
        setAuthorNotes={setNewAuthorNotes}
        isSaving={isSavingDisplayName}
        onSave={handleSaveDisplayName}
      />

      {/* 送信プレビューダイアログ */}
      <SendPreviewDialog
        open={isSendPreviewOpen}
        onOpenChange={setIsSendPreviewOpen}
        target={sendPreviewTarget}
        year={selectedYear}
        month={selectedMonth}
        selectedScenarioIds={selectedScenarioIds}
        toggleScenarioSelection={toggleScenarioSelection}
        getPreviewItem={getPreviewItem}
        generateEmailBody={generateEmailBodyForItems}
        tab={sendPreviewTab}
        setTab={setSendPreviewTab}
        isBodyManuallyEdited={isBodyManuallyEdited}
        setIsBodyManuallyEdited={setIsBodyManuallyEdited}
        emailBodyText={emailBodyText}
        setEmailBodyText={setEmailBodyText}
        internalInputs={internalInputs}
        externalInputs={externalInputs}
        handleInternalInputChange={handleInternalInputChange}
        handleExternalInputChange={handleExternalInputChange}
        isSending={isSending}
        onConfirmSend={handleConfirmSend}
      />

      {/* 一括送信 確認ダイアログ */}
      <ConfirmDialog
        open={batchSendTargets !== null}
        onOpenChange={(open) => { if (!open) setBatchSendTargets(null) }}
        title={`${selectedYear}年${selectedMonth}月のレポートを一括送信しますか？`}
        description={
          batchSendTargets ? (
            <>
              送信先: {batchSendTargets.length}名 / 総公演数: {batchSendTargets.reduce((sum, g) => sum + g.totalEvents, 0)}回 / 総ライセンス料: ¥{batchSendTargets.reduce((sum, g) => sum + g.totalLicenseCost, 0).toLocaleString()}
              <br />
              送信先一覧: {batchSendTargets.map(g => g.authorName).join('、')}
            </>
          ) : undefined
        }
        confirmLabel="送信する"
        variant="default"
        onConfirm={runBatchSend}
      />

      {/* ヘッダー＋検索・ソート・表示モード */}
      <ReportToolbar
        currentDate={currentDate}
        onChangeMonth={setCurrentDate}
        isSaving={isSavingExternal || isSavingInternal}
        selectedCount={selectedGroups.size}
        onDeselectAll={deselectAll}
        onBatchSend={handleBatchSend}
        isSending={isSending}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortAsc={sortAsc}
        onToggleSortAsc={() => setSortAsc(!sortAsc)}
        isLicenseManager={isLicenseManager}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* 統計 */}
      <ReportStatsCards stats={stats} isLicenseManager={isLicenseManager} viewMode={viewMode} />

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
            <CardContent className="py-6">
              <EmptyState title="該当するデータがありません" />
            </CardContent>
          </Card>
        ) : (
          filteredGroups.map((group) => {
            const groupKey = getGroupKey(group)
            return (
              <ReportGroupCard
                key={groupKey}
                group={group}
                groupKey={groupKey}
                isExpanded={expandedGroups.has(groupKey)}
                isSelected={group.authorEmail ? selectedGroups.has(group.authorName) : false}
                sentAt={sentHistory.get(group.authorName)?.sentAt ?? null}
                copiedAuthor={copiedAuthor}
                isSending={isSending}
                internalInputs={internalInputs}
                externalInputs={externalInputs}
                viewMode={viewMode}
                isLicenseManager={isLicenseManager}
                getPreviewItem={getPreviewItem}
                getReportDrift={getReportDrift}
                getDisplayEvents={getDisplayEvents}
                getDisplayInternalEvents={getDisplayInternalEvents}
                getDisplayExternalEvents={getDisplayExternalEvents}
                getDisplayLicenseCost={getDisplayLicenseCost}
                isGroupZeroCostOnly={isGroupZeroCostOnly}
                onToggleSelect={toggleSelect}
                onToggleExpand={toggleExpand}
                onOpenDisplayNameDialog={handleOpenDisplayNameDialog}
                onOpenBulkEmailDialog={handleOpenBulkEmailDialog}
                onOpenSendPreview={handleOpenSendPreview}
                onCopyEmail={handleCopyEmail}
                onOpenSentEmail={handleOpenSentEmail}
                onEditScenario={handleEditScenario}
                onInternalInputChange={handleInternalInputChange}
                onExternalInputChange={handleExternalInputChange}
              />
            )
          })
        )}
      </div>
    </div>
  )
}

