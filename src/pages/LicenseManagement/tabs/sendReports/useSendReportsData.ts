/**
 * 送信報告タブのデータ層フック（SendReports から抽出・挙動不変）。
 *
 * サーバーデータ（reportGroups / sentHistory / externalInputs / internalInputs / loading）と
 * その取得 loadData ＋ 初回・年月変更時の取得 effect を保持。loadData は元 SendReports の本体を逐語移植。
 * loadData は他の state を読まず、依存は引数（organizationId / selectedYear / selectedMonth / isLicenseManager）のみ。
 * 上書き入力・送信履歴・グループは handler 側でも更新するため setter を公開する。
 */
import { useState, useEffect } from 'react'
import { scenarioApi, salesApi, storeApi, authorApi } from '@/lib/api'
import { getAllExternalReports } from '@/lib/api/externalReportsApi'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'
import type { Author } from '@/types'
import { groupReportItems } from './grouping'
import type { ReportItem, ReportGroup, SentHistoryEntry } from './types'

export function useSendReportsData(
  organizationId: string,
  selectedYear: number,
  selectedMonth: number,
  isLicenseManager: boolean,
) {
  const [loading, setLoading] = useState(true)
  const [reportGroups, setReportGroups] = useState<ReportGroup[]>([])
  const [externalInputs, setExternalInputs] = useState<Record<string, number | undefined>>({})
  const [internalInputs, setInternalInputs] = useState<Record<string, number | undefined>>({})
  const [sentHistory, setSentHistory] = useState<Map<string, SentHistoryEntry>>(new Map())

  const loadData = async () => {
    try {
      setLoading(true)

      // 日付範囲計算
      const startDate = new Date(selectedYear, selectedMonth - 1, 1)
      const endDate = new Date(selectedYear, selectedMonth, 0)
      const startStr = startDate.toISOString().split('T')[0]
      const endStr = endDate.toISOString().split('T')[0]

      // データを並行取得
      const [scenarios, stores, performance, externalReports, historyData, manualExternalData, internalOverrideData, authorsData] = await Promise.all([
        scenarioApi.getAll(),
        storeApi.getAll(),
        salesApi.getScenarioPerformance(startStr, endStr),
        isLicenseManager
          ? getAllExternalReports({ status: 'approved', startDate: startStr, endDate: endStr }).catch(() => [])
          : Promise.resolve([]),
        // 送信履歴を取得
        supabase
          .from('license_report_history')
          .select('author_name, sent_at, total_events, total_license_cost, email_body, subject')
          .eq('year', selectedYear)
          .eq('month', selectedMonth)
          .then(res => res.data || []),
        // 手動入力の他社公演数を取得
        supabase
          .from('manual_external_performances')
          .select('scenario_id, performance_count, performance_type')
          .eq('year', selectedYear)
          .eq('month', selectedMonth)
          .then(res => res.data || []),
        // 自社公演数の手動上書きを取得
        supabase
          .from('manual_internal_performance_overrides')
          .select('scenario_key, performance_count')
          .eq('organization_id', organizationId)
          .eq('year', selectedYear)
          .eq('month', selectedMonth)
          .then(res => res.data || [], () => []),
        // 作者データを取得（メモ含む）
        authorApi.getAll().catch(() => [] as Author[])
      ])

      // 作者メモ・ライセンス組織名をMapに変換
      const authorNotesMap = new Map<string, string>()
      const authorOrgNameMap = new Map<string, string>()  // 作者名 → license_organization_name
      authorsData.forEach((author: Author) => {
        if (author.notes) {
          authorNotesMap.set(author.name, author.notes)
        }
        if (author.license_organization_name) {
          authorOrgNameMap.set(author.name, author.license_organization_name)
        }
      })

      // 手動入力値をexternalInputsに設定（キー = scenarioKey: id or id_gmtest）
      const manualInputs: Record<string, number> = {}
      manualExternalData.forEach((item: any) => {
        // 0 も「他社公演数=0の上書き」として保存される（7引数版RPC）。内部上書きと同様に
        // 0 も読み込まないと、0 にした他社公演数がリロードで自動値に戻ってしまう
        if (item.performance_count !== undefined && item.performance_count !== null) {
          const key = item.performance_type === 'gmtest'
            ? `${item.scenario_id}_gmtest`
            : item.scenario_id
          manualInputs[key] = item.performance_count
        }
      })
      setExternalInputs(manualInputs)

      // 自社公演数の上書き値を設定
      const internalOverrides: Record<string, number> = {}
      internalOverrideData.forEach((item: any) => {
        if (item.performance_count !== undefined) {
          internalOverrides[item.scenario_key] = item.performance_count
        }
      })
      setInternalInputs(internalOverrides)

      // 送信履歴をMapに変換
      const historyMap = new Map<string, { sentAt: string; totalEvents: number; totalCost: number; emailBody?: string; subject?: string }>()
      historyData.forEach((h: any) => {
        historyMap.set(h.author_name, {
          sentAt: h.sent_at,
          totalEvents: h.total_events,
          totalCost: h.total_license_cost,
          emailBody: h.email_body ?? undefined,
          subject: h.subject ?? undefined,
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
        // カスタムカテゴリ判定（プリセット以外 = license_rewards から単価を検索）
        const KNOWN_CATEGORIES = new Set(['open','private','gmtest','testplay','offsite','venue_rental','venue_rental_free','package','mtg','memo',''])
        const isCustomCategory = !KNOWN_CATEGORIES.has(perf.category || '') && !isGMTest
        const internalEvents = perf.events || 0
        const scenarioKey = isGMTest ? `${scenario.id}_gmtest`
          : isCustomCategory ? `${scenario.id}_${perf.category}`
          : scenario.id

        // 自社公演の単価（店舗の所有形態・カテゴリで判定）
        let internalLicenseAmount = 0
        if (isCustomCategory) {
          // カスタム: participation_costs の licenseAmount フィールドから検索
          const customCost = (scenario.participation_costs as Array<{ time_slot: string; licenseAmount?: number }> | undefined)
            ?.find(c => c.time_slot === perf.category)
          internalLicenseAmount = customCost?.licenseAmount ?? scenario.license_amount ?? 0
        } else if (isFranchise) {
          internalLicenseAmount = isGMTest
            ? (scenario.franchise_gm_test_license_amount || scenario.franchise_license_amount || scenario.gm_test_license_amount || scenario.license_amount || 0)
            : (scenario.franchise_license_amount || scenario.license_amount || 0)
        } else {
          internalLicenseAmount = isGMTest
            ? (scenario.gm_test_license_amount || 0)
            : (scenario.license_amount || scenario.license_rewards?.find(r => r.item === 'normal')?.amount || 0)
        }

        // 他社報告の単価（franchise_license_amount を使用）
        const externalLicenseAmount = isGMTest
          ? (scenario.franchise_gm_test_license_amount || scenario.franchise_license_amount || scenario.gm_test_license_amount || scenario.license_amount || 0)
          : (scenario.franchise_license_amount || scenario.license_amount || 0)

        // 他社報告数（カスタム以外）。GMテストも手動入力で対応
        const externalEvents = isCustomCategory ? 0 : (externalCountByScenario.get(scenarioKey) || externalCountByScenario.get(scenario.id) || 0)
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
            scenarioKey,
            scenarioTitle: isGMTest ? `${perf.title}（GMテスト）`
              : isCustomCategory ? `${perf.title}（${perf.category}）`
              : perf.title,
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
            scenarioKey: scenarioId,
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
        const PRESET_COST_SLOTS = new Set(['normal', 'gmtest', 'weekend', 'holiday', 'late_night'])
        scenarios
          .filter(s => s.author)  // 作者がいるシナリオ全て
          .forEach(scenario => {
            // カスタム行でも使うため外側で定義
            const externalLicenseAmount = scenario.franchise_license_amount || scenario.license_amount || 0

            // 通常行：まだ追加されていない場合のみ追加
            if (!itemsByScenario.has(scenario.id)) {
              const externalEvents = externalCountByScenario.get(scenario.id) || 0
              const externalLicenseCost = externalLicenseAmount * externalEvents

              itemsByScenario.set(scenario.id, {
                scenarioId: scenario.id,
                scenarioKey: scenario.id,
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
            }

            // GMテスト行（gm_test_license_amount が設定されている場合）
            // ※ 通常行の有無に関わらず独立してチェック
            const gmtestKey = `${scenario.id}_gmtest`
            if (!itemsByScenario.has(gmtestKey) && (scenario.gm_test_license_amount ?? 0) > 0) {
              itemsByScenario.set(gmtestKey, {
                scenarioId: scenario.id,
                scenarioKey: gmtestKey,
                scenarioTitle: `${scenario.title}（GMテスト）`,
                author: scenario.author,
                reportDisplayName: scenario.report_display_name || scenario.author,
                authorEmail: scenario.author_email || null,
                events: 0,
                internalEvents: 0,
                externalEvents: 0,
                licenseCost: 0,
                internalLicenseCost: 0,
                externalLicenseCost: 0,
                internalLicenseAmount: scenario.gm_test_license_amount || 0,
                externalLicenseAmount: scenario.franchise_gm_test_license_amount || scenario.gm_test_license_amount || 0,
                isGMTest: true,
                scenarioType: scenario.scenario_type || 'normal'
              })
            }

            // カスタム種別行（participation_costs の licenseAmount が設定されている項目）
            const seenCustomSlots = new Set<string>()
            ;(scenario.participation_costs as Array<{ time_slot: string; licenseAmount?: number }> | undefined)
              ?.forEach(cost => {
                if (!cost.time_slot) return
                if (PRESET_COST_SLOTS.has(cost.time_slot)) return
                if (seenCustomSlots.has(cost.time_slot)) return
                if ((cost.licenseAmount ?? 0) <= 0) return
                seenCustomSlots.add(cost.time_slot)
                const customKey = `${scenario.id}_${cost.time_slot}`
                if (itemsByScenario.has(customKey)) return
                itemsByScenario.set(customKey, {
                  scenarioId: scenario.id,
                  scenarioKey: customKey,
                  scenarioTitle: `${scenario.title}（${cost.time_slot}）`,
                  author: scenario.author,
                  reportDisplayName: scenario.report_display_name || scenario.author,
                  authorEmail: scenario.author_email || null,
                  events: 0,
                  internalEvents: 0,
                  externalEvents: 0,
                  licenseCost: 0,
                  internalLicenseCost: 0,
                  externalLicenseCost: 0,
                  internalLicenseAmount: cost.licenseAmount || 0,
                  externalLicenseAmount,
                  isGMTest: false,
                  scenarioType: scenario.scenario_type || 'normal'
                })
              })
          })
      }

      const items = Array.from(itemsByScenario.values())

      // グループ化（純関数 groupReportItems へ委譲）
      const groups = groupReportItems(items, authorNotesMap, authorOrgNameMap)

      // ソートして設定
      const sorted = groups.sort((a, b) => b.totalEvents - a.totalEvents)
      setReportGroups(sorted)

    } catch (error) {
      logger.error('データ取得エラー:', error)
      showToast.error('データ取得失敗')
    } finally {
      setLoading(false)
    }
  }

  // データ取得
  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedMonth, organizationId])

  return {
    loading,
    reportGroups,
    externalInputs,
    internalInputs,
    sentHistory,
    setReportGroups,
    setExternalInputs,
    setInternalInputs,
    setSentHistory,
    reload: loadData,
  }
}
