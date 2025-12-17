import { useState, useCallback, useEffect } from 'react'
import { salesApi, scenarioApi, storeApi } from '@/lib/api'
import { getAllExternalReports } from '@/lib/api/externalReportsApi'
import { logger } from '@/utils/logger'
import type { MonthlyAuthorData, AuthorPerformance } from '../types'

/**
 * 作者レポートデータ取得フック
 */
export function useAuthorReportData(year: number, month: number, storeId: string) {
  const [monthlyData, setMonthlyData] = useState<MonthlyAuthorData[]>([])
  const [loading, setLoading] = useState(false)

  /**
   * 月の日付範囲を取得
   */
  const getMonthRange = useCallback((year: number, month: number) => {
    const startLocal = new Date(year, month - 1, 1, 0, 0, 0, 0)
    const endLocal = new Date(year, month, 0, 23, 59, 59, 999)

    const fmt = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })

    const startStr = fmt.format(startLocal)
    const endStr = fmt.format(endLocal)

    logger.log('計算された日付範囲:', { startStr, endStr })

    return { startStr, endStr }
  }, [])

  /**
   * データ取得と集計
   */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)

      const { startStr, endStr } = getMonthRange(year, month)

      // データを並行取得（外部公演報告も含む）
      const [scenariosData, storesData, performanceData, externalReportsData] = await Promise.all([
        scenarioApi.getAll(),
        storeApi.getAll(),
        salesApi.getScenarioPerformance(startStr, endStr, storeId === 'all' ? undefined : storeId),
        // 承認済みの外部公演報告を取得
        getAllExternalReports({
          status: 'approved',
          startDate: startStr,
          endDate: endStr
        }).catch(() => []) // エラー時は空配列（テーブル未作成時など）
      ])

      logger.log('取得データ:', {
        scenariosData: scenariosData.length,
        storesData: storesData.length,
        performanceData: performanceData.length,
        externalReportsData: externalReportsData.length,
        performanceDataSample: performanceData.slice(0, 3)
      })

      // 作者別データを集計
      const authorMap = new Map<string, AuthorPerformance>()

      performanceData.forEach((perf) => {
        // シナリオ検索
        let scenario = scenariosData.find(s => s.id === perf.id)
        if (!scenario) {
          scenario = scenariosData.find(s => s.title === perf.title)
        }

        if (!scenario || !scenario.author) {
          return
        }

        // 店舗検索（フランチャイズ判定用）
        const store = storesData.find(s => s.id === perf.store_id)
        const isFranchiseStore = store?.ownership_type === 'franchise'

        const author = scenario.author
        const events = perf.events as number
        const isGMTest = perf.category === 'gmtest'
        const avgParticipants = 6
        const participationFee = isGMTest 
          ? (scenario.gm_test_participation_fee || scenario.participation_fee || 0)
          : (scenario.participation_fee || 0)
        const revenue = participationFee * avgParticipants * events
        const duration = scenario.duration || 0
        const totalDuration = duration * events

        // ライセンス金額を取得（優先順位: 他店用 → 他店GMテスト用 → 通常）
        let licenseAmountPerEvent = 0

        if (isFranchiseStore) {
          // フランチャイズ店舗の場合
          // フランチャイズ料金が設定されていない（null/undefined/0）場合は内部用を使用
          if (isGMTest) {
            // 他店GMテスト用 → 他店通常用 → 通常GMテスト用 → 通常
            licenseAmountPerEvent = 
              (scenario.franchise_gm_test_license_amount != null && scenario.franchise_gm_test_license_amount !== 0) ? scenario.franchise_gm_test_license_amount :
              (scenario.franchise_license_amount != null && scenario.franchise_license_amount !== 0) ? scenario.franchise_license_amount :
              (scenario.gm_test_license_amount != null && scenario.gm_test_license_amount !== 0) ? scenario.gm_test_license_amount :
              scenario.license_amount ?? 0
          } else {
            // 他店通常用 → 通常
            licenseAmountPerEvent = 
              (scenario.franchise_license_amount != null && scenario.franchise_license_amount !== 0) 
                ? scenario.franchise_license_amount 
                : (scenario.license_amount ?? 0)
          }
        } else {
          // 直営店舗の場合（従来通り）
          if (isGMTest) {
            licenseAmountPerEvent = scenario.gm_test_license_amount ?? 0
          } else {
            licenseAmountPerEvent = scenario.license_amount ?? 0
          }
        }

        const totalLicenseCost = licenseAmountPerEvent * events
        const displayTitle = isGMTest ? `${perf.title}（GMテスト）` : perf.title

        if (authorMap.has(author)) {
          const existing = authorMap.get(author)!
          existing.totalEvents += events
          existing.totalRevenue += revenue
          existing.totalLicenseCost += totalLicenseCost
          existing.totalDuration += totalDuration

          const scenarioIndex = existing.scenarios.findIndex(s => s.title === displayTitle)
          if (scenarioIndex >= 0) {
            existing.scenarios[scenarioIndex].events += events
            existing.scenarios[scenarioIndex].revenue += revenue
            existing.scenarios[scenarioIndex].licenseCost += totalLicenseCost
            existing.scenarios[scenarioIndex].totalDuration += totalDuration
          } else {
            existing.scenarios.push({
              title: displayTitle,
              events,
              revenue,
              licenseCost: totalLicenseCost,
              licenseAmountPerEvent,
              duration,
              totalDuration,
              isGMTest
            })
          }
        } else {
          authorMap.set(author, {
            author,
            totalEvents: events,
            totalRevenue: revenue,
            totalLicenseCost,
            totalDuration,
            scenarios: [{
              title: displayTitle,
              events,
              revenue,
              licenseCost: totalLicenseCost,
              licenseAmountPerEvent,
              duration,
              totalDuration,
              isGMTest
            }]
          })
        }
      })

      // ========================================
      // 外部公演報告（他社からの報告）を集計に追加
      // ========================================
      externalReportsData.forEach((report: any) => {
        // scenarioデータを取得
        const scenarioInfo = report.scenarios
        if (!scenarioInfo) return

        const author = scenarioInfo.author
        if (!author) return

        const scenario = scenariosData.find(s => s.id === report.scenario_id)
        const events = report.performance_count || 1
        const licenseAmountPerEvent = scenario?.license_amount ?? 0
        const totalLicenseCost = licenseAmountPerEvent * events
        const duration = scenario?.duration || 0
        const totalDuration = duration * events
        
        // 外部報告は収益計算しない（参加費情報がないため）
        const revenue = 0
        
        // 外部報告であることを示すラベル付きタイトル
        const organizationName = report.organizations?.name || '外部'
        const displayTitle = `${scenarioInfo.title}（${organizationName}）`

        if (authorMap.has(author)) {
          const existing = authorMap.get(author)!
          existing.totalEvents += events
          existing.totalRevenue += revenue
          existing.totalLicenseCost += totalLicenseCost
          existing.totalDuration += totalDuration

          const scenarioIndex = existing.scenarios.findIndex(s => s.title === displayTitle)
          if (scenarioIndex >= 0) {
            existing.scenarios[scenarioIndex].events += events
            existing.scenarios[scenarioIndex].revenue += revenue
            existing.scenarios[scenarioIndex].licenseCost += totalLicenseCost
            existing.scenarios[scenarioIndex].totalDuration += totalDuration
          } else {
            existing.scenarios.push({
              title: displayTitle,
              events,
              revenue,
              licenseCost: totalLicenseCost,
              licenseAmountPerEvent,
              duration,
              totalDuration,
              isGMTest: false,
              isExternal: true  // 外部報告フラグ
            })
          }
        } else {
          authorMap.set(author, {
            author,
            totalEvents: events,
            totalRevenue: revenue,
            totalLicenseCost,
            totalDuration,
            scenarios: [{
              title: displayTitle,
              events,
              revenue,
              licenseCost: totalLicenseCost,
              licenseAmountPerEvent,
              duration,
              totalDuration,
              isGMTest: false,
              isExternal: true  // 外部報告フラグ
            }]
          })
        }
      })

      const authorsArray = Array.from(authorMap.values())
        .sort((a, b) => b.totalEvents - a.totalEvents)

      const monthName = `${year}年${month}月`
      logger.log('作者データ集計結果（外部報告含む）:', authorsArray)
      setMonthlyData([{
        month: monthName,
        authors: authorsArray
      }])
    } catch (error) {
      logger.error('データ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }, [year, month, storeId, getMonthRange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    monthlyData,
    loading,
    refresh: fetchData
  }
}

