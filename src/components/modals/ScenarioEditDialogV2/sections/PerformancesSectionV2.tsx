import { logger } from '@/utils/logger'
import React, { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { CalendarDays, Users, Coins, AlertCircle, MapPin, Copy, FileText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { storeApi } from '@/lib/api'
import { showToast } from '@/utils/toast'
import type { Store } from '@/types'
import { formatJstDateTime } from '@/utils/jstDate'

interface PerformanceDate {
  date: string
  category: string
  participants: number
  demoParticipants: number
  staffParticipants: number
  revenue: number
  licenseCost?: number
  startTime: string
  storeId: string | null
  isCancelled: boolean
}

interface ParticipationCost {
  time_slot: string
  amount: number
  type: 'percentage' | 'fixed'
}

interface PerformancesSectionV2Props {
  performanceDates: PerformanceDate[]
  participationCosts: ParticipationCost[]
  gmTestParticipationFee?: number
  scenarioParticipationFee?: number  // シナリオの基本参加費（フォールバック用）
  totalParticipants?: number  // API側で計算された累計参加者数（スタッフ除外）
  totalStaffParticipants?: number  // 累計スタッフ参加者数
  totalRevenue?: number  // 累計売上（API側で計算）
  totalLicenseCost?: number  // 累計ライセンス料（API側で計算）
  licenseAmount?: number  // 通常公演のライセンス単価
  gmTestLicenseAmount?: number  // GMテストのライセンス単価
  scenarioTitle?: string  // シナリオタイトル（ダウンロードファイル名用）
  futurePerformanceCount?: number  // 将来の公演予定数
  futureReservationCount?: number  // 将来の貸切予約数
}

// カテゴリの日本語表示（schedule_events.category の値と一致させる）
const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: '通常', color: 'bg-blue-100 text-blue-700' },
  private: { label: '貸切', color: 'bg-purple-100 text-purple-700' },
  gmtest: { label: 'GMテスト', color: 'bg-orange-100 text-orange-800' },
  testplay: { label: 'テストプレイ', color: 'bg-yellow-100 text-yellow-700' },
  offsite: { label: '出張', color: 'bg-green-100 text-green-700' },
  package: { label: 'パッケージ', color: 'bg-pink-100 text-pink-700' },
  venue_rental: { label: '場所貸し', color: 'bg-cyan-100 text-cyan-700' },
  venue_rental_free: { label: '場所貸無料', color: 'bg-teal-100 text-teal-700' },
  mtg: { label: 'MTG', color: 'bg-cyan-100 text-cyan-700' },
}

const isGmTestCategory = (category: string) => category === 'gmtest'

const resolveLicenseCost = (
  perf: PerformanceDate,
  licenseAmount: number,
  gmTestLicenseAmount: number
): number => {
  if (perf.isCancelled) return 0
  if (typeof perf.licenseCost === 'number' && perf.licenseCost > 0) {
    return perf.licenseCost
  }
  return isGmTestCategory(perf.category) ? gmTestLicenseAmount : licenseAmount
}

// 時間帯の日本語表示と色
const TIME_SLOT_LABELS: Record<string, { label: string; color: string }> = {
  朝: { label: '朝', color: 'bg-orange-100 text-orange-700' },
  昼: { label: '昼', color: 'bg-sky-100 text-sky-700' },
  夜: { label: '夜', color: 'bg-indigo-100 text-indigo-700' },
}

// start_timeから時間帯を判定
const getTimeSlot = (startTime: string): string => {
  if (!startTime) return '昼'
  const hour = parseInt(startTime.split(':')[0], 10)
  if (hour < 12) return '朝'
  if (hour < 17) return '昼'
  return '夜'
}

export function PerformancesSectionV2({ 
  performanceDates, 
  participationCosts: _participationCosts,
  gmTestParticipationFee: _gmTestParticipationFee = 0,
  scenarioParticipationFee: _scenarioParticipationFee = 0,
  totalParticipants: apiTotalParticipants = 0,
  totalStaffParticipants: apiTotalStaffParticipants = 0,
  totalRevenue: apiTotalRevenue = 0,
  totalLicenseCost: apiTotalLicenseCost = 0,
  licenseAmount = 0,
  gmTestLicenseAmount = 0,
  scenarioTitle = 'シナリオ',
  futurePerformanceCount = 0,
  futureReservationCount = 0
}: PerformancesSectionV2Props) {
  const [stores, setStores] = useState<Store[]>([])
  const [includeParticipants, setIncludeParticipants] = useState(true)
  const [includeRevenue, setIncludeRevenue] = useState(true)
  const [includeLicense, setIncludeLicense] = useState(true)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  // 店舗情報を取得
  useEffect(() => {
    const fetchStores = async () => {
      try {
        const data = await storeApi.getAll()
        setStores(data)
      } catch (error) {
        logger.error('Failed to fetch stores:', error)
      }
    }
    fetchStores()
  }, [])

  // 店舗IDから店舗名を取得
  const getStoreName = (storeId: string | null): string => {
    if (!storeId) return '-'
    const store = stores.find(s => s.id === storeId)
    return store?.short_name || store?.name || '-'
  }

  // 日付をフォーマット
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    const weekday = weekdays[date.getDay()]
    return { year, month, day, weekday }
  }

  // 年ごとにグループ化
  const groupedByYear = performanceDates.reduce((acc, perf) => {
    const { year } = formatDate(perf.date)
    if (!acc[year]) {
      acc[year] = []
    }
    acc[year].push(perf)
    return acc
  }, {} as Record<number, PerformanceDate[]>)

  // 年を降順でソート
  const sortedYears = Object.keys(groupedByYear).map(Number).sort((a, b) => b - a)

  // 有効な公演（中止を除外）
  const activePerformances = performanceDates.filter(p => !p.isCancelled)

  // 期間でフィルタリング
  const filteredPerformances = activePerformances.filter(perf => {
    if (startDate && perf.date < startDate) return false
    if (endDate && perf.date > endDate) return false
    return true
  })

  // 期間でフィルタリングされた公演を年ごとにグループ化
  const filteredGroupedByYear = filteredPerformances.reduce((acc, perf) => {
    const { year } = formatDate(perf.date)
    if (!acc[year]) {
      acc[year] = []
    }
    acc[year].push(perf)
    return acc
  }, {} as Record<number, PerformanceDate[]>)

  const filteredSortedYears = Object.keys(filteredGroupedByYear).map(Number).sort((a, b) => b - a)

  // 期間内の累計を計算
  const filteredTotalParticipants = filteredPerformances.reduce((sum, p) => sum + p.participants, 0)
  const filteredTotalStaffParticipants = filteredPerformances.reduce((sum, p) => sum + p.staffParticipants, 0)
  const filteredTotalRevenue = filteredPerformances.reduce((sum, p) => sum + (p.revenue || 0), 0)
  const filteredTotalLicenseCost = filteredPerformances.reduce(
    (sum, p) => sum + resolveLicenseCost(p, licenseAmount, gmTestLicenseAmount),
    0
  )

  // 全期間のライセンス内訳（通常 / GMテスト）
  const normalActiveCount = activePerformances.filter(p => !isGmTestCategory(p.category)).length
  const gmTestActiveCount = activePerformances.filter(p => isGmTestCategory(p.category)).length
  const normalLicenseTotal = activePerformances
    .filter(p => !isGmTestCategory(p.category))
    .reduce((sum, p) => sum + resolveLicenseCost(p, licenseAmount, gmTestLicenseAmount), 0)
  const gmTestLicenseTotal = activePerformances
    .filter(p => isGmTestCategory(p.category))
    .reduce((sum, p) => sum + resolveLicenseCost(p, licenseAmount, gmTestLicenseAmount), 0)
  const computedTotalLicenseCost = normalLicenseTotal + gmTestLicenseTotal
  const displayTotalLicenseCost = apiTotalLicenseCost > 0 ? apiTotalLicenseCost : computedTotalLicenseCost

  // 期間フィルタ時の内訳
  const filteredNormalCount = filteredPerformances.filter(p => !isGmTestCategory(p.category)).length
  const filteredGmTestCount = filteredPerformances.filter(p => isGmTestCategory(p.category)).length

  // 期間でフィルタリングされた全公演（中止含む）を取得
  const filteredAllPerformances = performanceDates.filter(perf => {
    if (startDate && perf.date < startDate) return false
    if (endDate && perf.date > endDate) return false
    return true
  })

  // 月毎にグループ化（年-月をキーにする）
  const groupedByMonth = filteredAllPerformances.reduce((acc, perf) => {
    const { year, month } = formatDate(perf.date)
    const key = `${year}-${month}`
    if (!acc[key]) {
      acc[key] = { year, month, performances: [], cancelled: 0 }
    }
    acc[key].performances.push(perf)
    if (perf.isCancelled) {
      acc[key].cancelled++
    }
    return acc
  }, {} as Record<string, { year: number; month: string; performances: PerformanceDate[]; cancelled: number }>)

  // 月をソート（年-月で降順）
  const sortedMonths = Object.keys(groupedByMonth).sort((a, b) => {
    const [yearA, monthA] = a.split('-').map(Number)
    const [yearB, monthB] = b.split('-').map(Number)
    if (yearA !== yearB) return yearB - yearA
    return monthB - monthA
  })

  // テキスト形式でクリップボードにコピー
  const handleCopy = async () => {
    const lines: string[] = []
    
    // ヘッダー
    lines.push(`公演実績: ${scenarioTitle}`)
    if (startDate || endDate) {
      const startStr = startDate ? startDate.replace(/-/g, '/') : '開始'
      const endStr = endDate ? endDate.replace(/-/g, '/') : '終了'
      lines.push(`期間: ${startStr} 〜 ${endStr}`)
    }
    lines.push(`生成日時: ${formatJstDateTime(new Date())}`)
    lines.push('')
    lines.push(`公演回数: ${filteredPerformances.length}回（通常${filteredNormalCount}回 / GMテスト${filteredGmTestCount}回）`)
    if (includeParticipants) {
      lines.push(`累計参加者: ${filteredTotalParticipants.toLocaleString()}名`)
      if (filteredTotalStaffParticipants > 0) {
        lines.push(`（内スタッフ: ${filteredTotalStaffParticipants}名）`)
      }
    }
    if (includeRevenue) {
      lines.push(`累計売上: ¥${filteredTotalRevenue.toLocaleString()}`)
    }
    if (includeLicense) {
      lines.push(`合計ライセンス: ¥${filteredTotalLicenseCost.toLocaleString()}`)
      lines.push(`  通常: ${filteredNormalCount}回 × @¥${licenseAmount.toLocaleString()} = ¥${filteredPerformances
        .filter(p => !isGmTestCategory(p.category))
        .reduce((sum, p) => sum + resolveLicenseCost(p, licenseAmount, gmTestLicenseAmount), 0)
        .toLocaleString()}`)
      lines.push(`  GMテスト: ${filteredGmTestCount}回 × @¥${gmTestLicenseAmount.toLocaleString()} = ¥${filteredPerformances
        .filter(p => isGmTestCategory(p.category))
        .reduce((sum, p) => sum + resolveLicenseCost(p, licenseAmount, gmTestLicenseAmount), 0)
        .toLocaleString()}`)
    }
    lines.push('')
    
    // 月毎の公演回数
    if (sortedMonths.length > 0) {
      lines.push('月毎の公演回数:')
      sortedMonths.forEach(key => {
        const { year, month, performances, cancelled } = groupedByMonth[key]
        const activeCount = performances.length - cancelled
        const gmCount = performances.filter(p => !p.isCancelled && isGmTestCategory(p.category)).length
        const normalCount = activeCount - gmCount
        lines.push(`  ${year}年${month}月: ${activeCount}回（通常${normalCount}/GMテスト${gmCount}）${cancelled > 0 ? `/${cancelled}回中止` : ''}`)
      })
      lines.push('')
    }
    
    lines.push('='.repeat(60))
    lines.push('')

    // 年ごとの公演リスト（フィルタリング済み）
    filteredSortedYears.forEach((year) => {
      lines.push(`${year}年 (${filteredGroupedByYear[year].length}回)`)
      lines.push('-'.repeat(60))
      
      filteredGroupedByYear[year].forEach((perf) => {
        const { year: perfYear, month, day, weekday } = formatDate(perf.date)
        const categoryInfo = CATEGORY_LABELS[perf.category] || CATEGORY_LABELS.open
        const timeSlot = getTimeSlot(perf.startTime)
        const timeSlotInfo = TIME_SLOT_LABELS[timeSlot] || TIME_SLOT_LABELS['昼']
        const storeName = getStoreName(perf.storeId)
        
        // 日付とカテゴリ
        let line = `${perfYear}/${month}/${day}(${weekday}) ${timeSlotInfo.label} ${categoryInfo.label}`
        
        // 店舗
        line += ` [${storeName}]`
        
        // 中止マーク
        if (perf.isCancelled) {
          line += ' 【中止】'
        }
        
        // 参加者（オプション）
        if (includeParticipants && !perf.isCancelled) {
          line += ` 参加者:${perf.participants}名`
          if (perf.staffParticipants > 0) {
            line += `(内スタッフ${perf.staffParticipants})`
          }
        }
        
        // 売上（オプション）
        if (includeRevenue && !perf.isCancelled) {
          const displayRevenue = perf.revenue || 0
          line += ` 売上:¥${displayRevenue.toLocaleString()}`
        }

        // ライセンス（オプション）
        if (includeLicense && !perf.isCancelled) {
          const cost = resolveLicenseCost(perf, licenseAmount, gmTestLicenseAmount)
          line += ` ライセンス:¥${cost.toLocaleString()}`
        }
        
        lines.push(line)
      })
      
      lines.push('')
    })
    
    // クリップボードにコピー
    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      showToast.success('クリップボードにコピーしました')
    } catch (error) {
      logger.error('クリップボードへのコピーに失敗しました:', error)
      showToast.error('クリップボードへのコピーに失敗しました')
    }
  }

  if (performanceDates.length === 0) {
    return (
      <div className="space-y-4">
        <div className="scenario-edit-card">
          <div className="pt-2">
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">公演実績がありません</p>
              <p className="text-sm">このシナリオはまだ公演されていません</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ダウンロード設定とボタン */}
      <div className="scenario-edit-card">
        <p className="scenario-edit-card__title">
          <CalendarDays className="h-3.5 w-3.5" />公演実績フィルター
        </p>
          {/* 期間指定 */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-[56px] shrink-0 text-right">期間</span>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-7 text-xs w-[140px]"
                placeholder="開始日"
              />
              <span className="text-sm text-muted-foreground">〜</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-7 text-xs w-[140px]"
                placeholder="終了日"
              />
              {(startDate || endDate) && (
                <Button
                  onClick={() => {
                    setStartDate('')
                    setEndDate('')
                  }}
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                >
                  クリア
                </Button>
              )}
            </div>
          </div>
          
          {/* 出力オプションとコピーボタン */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="include-participants"
                  checked={includeParticipants}
                  onCheckedChange={(checked) => setIncludeParticipants(checked === true)}
                />
                <Label htmlFor="include-participants" className="text-sm cursor-pointer">
                  参加者数を出力
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="include-revenue"
                  checked={includeRevenue}
                  onCheckedChange={(checked) => setIncludeRevenue(checked === true)}
                />
                <Label htmlFor="include-revenue" className="text-sm cursor-pointer">
                  売上を出力
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="include-license"
                  checked={includeLicense}
                  onCheckedChange={(checked) => setIncludeLicense(checked === true)}
                />
                <Label htmlFor="include-license" className="text-sm cursor-pointer">
                  ライセンスを出力
                </Label>
              </div>
            </div>
            <Button
              onClick={handleCopy}
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={filteredPerformances.length === 0}
            >
              <Copy className="w-4 h-4" />
              クリップボードにコピー
            </Button>
          </div>
      </div>

      {/* ── サマリー ── */}
      <div className="scenario-edit-card">
        <p className="scenario-edit-card__title">
          <Users className="h-3.5 w-3.5" />サマリー
        </p>
          <div className="flex items-center gap-6 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">公演回数:</span>
              <span className="text-lg font-bold">{activePerformances.length}回</span>
              <span className="text-xs text-muted-foreground">
                （通常{normalActiveCount} / GMテスト{gmTestActiveCount}）
              </span>
              {performanceDates.length !== activePerformances.length && (
                <span className="text-xs text-muted-foreground">
                  （中止{performanceDates.length - activePerformances.length}回）
                </span>
              )}
              {(futurePerformanceCount > 0 || futureReservationCount > 0) && (
                <span className="text-xs text-blue-600">
                  （予定{futurePerformanceCount + futureReservationCount}回）
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">累計参加者:</span>
              <span className="text-lg font-bold">
                {apiTotalParticipants.toLocaleString()}名
              </span>
              {apiTotalStaffParticipants > 0 && (
                <span className="text-xs text-blue-600">
                  （内スタッフ{apiTotalStaffParticipants}）
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">累計売上:</span>
              <span className="text-lg font-bold">
                ¥{apiTotalRevenue.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="pt-2 border-t space-y-1">
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">合計ライセンス:</span>
              <span className="text-lg font-bold">
                ¥{displayTotalLicenseCost.toLocaleString()}
              </span>
            </div>
            <div className="text-xs text-muted-foreground pl-6 space-y-0.5">
              <div>
                通常: {normalActiveCount}回 × @¥{licenseAmount.toLocaleString()} = ¥{normalLicenseTotal.toLocaleString()}
              </div>
              <div>
                GMテスト: {gmTestActiveCount}回 × @¥{gmTestLicenseAmount.toLocaleString()} = ¥{gmTestLicenseTotal.toLocaleString()}
              </div>
            </div>
          </div>
      </div>

      {/* 年ごとの公演リスト */}
      {sortedYears.map((year) => {
        // その年の公演を月ごとにグループ化
        const yearPerformances = groupedByYear[year]
        const monthlyStats = yearPerformances.reduce((acc, perf) => {
          const { month } = formatDate(perf.date)
          const key = `${year}-${month}`
          if (!acc[key]) {
            acc[key] = { month, total: 0, cancelled: 0, gmtest: 0 }
          }
          acc[key].total++
          if (perf.isCancelled) {
            acc[key].cancelled++
          } else if (isGmTestCategory(perf.category)) {
            acc[key].gmtest++
          }
          return acc
        }, {} as Record<string, { month: string; total: number; cancelled: number; gmtest: number }>)
        
        const yearSortedMonths = Object.keys(monthlyStats).sort((a, b) => {
          const monthA = parseInt(a.split('-')[1])
          const monthB = parseInt(b.split('-')[1])
          return monthB - monthA // 降順
        })

        const yearGmTestCount = yearPerformances.filter(p => !p.isCancelled && isGmTestCategory(p.category)).length
        const yearActiveCount = yearPerformances.filter(p => !p.isCancelled).length

        return (
          <div key={year} className="scenario-edit-card">
            <p className="scenario-edit-card__title">
              <CalendarDays className="h-3.5 w-3.5" />
              {year}年（{yearPerformances.length}回
              {yearActiveCount > 0 && (
                <span className="font-normal">
                  ・通常{yearActiveCount - yearGmTestCount}/GMテスト{yearGmTestCount}
                </span>
              )}
              ）
            </p>
            <div>
              {/* 月毎の集計 */}
              {yearSortedMonths.length > 0 && (
                <div className="mb-3 pb-2 border-b text-xs">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                    {yearSortedMonths.map(key => {
                      const { month, total, cancelled, gmtest } = monthlyStats[key]
                      const active = total - cancelled
                      const normal = active - gmtest
                      return (
                        <span key={key}>
                          {month}月: <span className="font-medium text-foreground">{active}回</span>
                          <span className="ml-1">
                            （通常{normal}/GMテスト{gmtest}）
                          </span>
                          {cancelled > 0 && (
                            <span className="text-orange-600">/{cancelled}回中止</span>
                          )}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                {yearPerformances.map((perf, index) => {
                const { month, day, weekday } = formatDate(perf.date)
                const categoryInfo = CATEGORY_LABELS[perf.category] || CATEGORY_LABELS.open
                const timeSlot = getTimeSlot(perf.startTime)
                const timeSlotInfo = TIME_SLOT_LABELS[timeSlot] || TIME_SLOT_LABELS['昼']
                // perf.revenue にはDBに保存されている実際の売上が入っている
                const displayRevenue = perf.revenue || 0
                const displayLicense = resolveLicenseCost(perf, licenseAmount, gmTestLicenseAmount)
                
                return (
                  <div 
                    key={`${perf.date}-${index}`}
                    className={`flex items-center gap-3 py-2 px-3 rounded-md transition-colors flex-wrap ${
                      perf.isCancelled 
                        ? 'bg-red-50 hover:bg-red-100 opacity-70' 
                        : isGmTestCategory(perf.category)
                          ? 'bg-orange-50/60 hover:bg-orange-50'
                          : 'bg-muted/30 hover:bg-muted/50'
                    }`}
                  >
                    {/* 日付 */}
                    <div className="flex items-center gap-1.5 min-w-[80px]">
                      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className={`font-mono text-sm ${perf.isCancelled ? 'line-through text-muted-foreground' : ''}`}>
                        {month}/{day}
                        <span className="text-muted-foreground ml-0.5">({weekday})</span>
                      </span>
                    </div>
                    
                    {/* 中止バッジ */}
                    {perf.isCancelled && (
                      <Badge 
                        variant="destructive" 
                        className="text-xs min-w-[40px] justify-center"
                      >
                        中止
                      </Badge>
                    )}
                    
                    {/* 時間帯 */}
                    <Badge 
                      variant="secondary" 
                      className={`${timeSlotInfo.color} text-xs min-w-[32px] justify-center`}
                    >
                      {timeSlotInfo.label}
                    </Badge>
                    
                    {/* カテゴリ */}
                    <Badge 
                      variant="secondary" 
                      className={`${categoryInfo.color} text-xs min-w-[56px] justify-center`}
                    >
                      {categoryInfo.label}
                    </Badge>
                    
                    {/* 店舗 */}
                    <div className="flex items-center gap-1 min-w-[60px] text-sm text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5" />
                      <span className="truncate">{getStoreName(perf.storeId)}</span>
                    </div>
                    
                    {/* 参加者（中止の場合は非表示） */}
                    {!perf.isCancelled && (
                      <div className="flex items-center gap-1 min-w-[70px] text-sm">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>
                          {perf.participants}名
                          {perf.staffParticipants > 0 && (
                            <span className="text-blue-600 text-xs ml-0.5">
                              （内スタッフ{perf.staffParticipants}）
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    
                    {/* 売上（中止の場合は非表示） */}
                    {!perf.isCancelled && (
                      <div className="flex items-center gap-1 min-w-[80px] text-sm">
                        <Coins className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>¥{displayRevenue.toLocaleString()}</span>
                      </div>
                    )}

                    {/* ライセンス（中止の場合は非表示） */}
                    {!perf.isCancelled && (
                      <div className="flex items-center gap-1 min-w-[90px] text-sm text-muted-foreground">
                        <FileText className="w-3.5 h-3.5" />
                        <span>L¥{displayLicense.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )
              })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
