import React, { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import { DateRangePopover } from '@/components/ui/date-range-popover'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { CalendarCheck, TrendingUp, Clock, Users, ChevronUp, ChevronDown, ChevronsUpDown, SlidersHorizontal, X, Info, Lightbulb } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useOpenEventAnalysis } from '../hooks/useOpenEventAnalysis'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

interface Store {
  id: string
  name: string
  short_name: string
  region?: string
}

interface OpenEventAnalysisProps {
  stores: Store[]
  selectedStoreIds: string[]
  onStoreIdsChange: (storeIds: string[]) => void
}

const BAR_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => `${ctx.parsed.y.toFixed(1)}%`
      }
    }
  },
  scales: {
    y: {
      min: 0,
      max: 100,
      ticks: { callback: (v: any) => `${v}%` }
    }
  }
}

export const OpenEventAnalysis: React.FC<OpenEventAnalysisProps> = ({
  stores,
  selectedStoreIds,
  onStoreIdsChange
}) => {
  const {
    loading,
    period,
    dateRange,
    includeGmTest,
    stats,
    monthlyBreakdown,
    weekdayBreakdown,
    timeSlotBreakdown,
    scenarioBreakdown,
    recommendations,
    loadOpenEventData
  } = useOpenEventAnalysis()

  useEffect(() => {
    if (stores.length > 0) {
      loadOpenEventData(period, selectedStoreIds)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores.length, selectedStoreIds])

  const handlePeriodChange = (newPeriod: string) => {
    loadOpenEventData(newPeriod, selectedStoreIds)
  }

  const handleGmTestToggle = (checked: boolean) => {
    loadOpenEventData(period, selectedStoreIds, checked)
  }

  const monthlyChartData = useMemo(() => ({
    labels: monthlyBreakdown.map(m => m.month),
    datasets: [{ label: '満席率', data: monthlyBreakdown.map(m => m.fullRate), backgroundColor: 'rgba(59, 130, 246, 0.7)', borderRadius: 4 }]
  }), [monthlyBreakdown])

  const weekdayChartData = useMemo(() => ({
    labels: weekdayBreakdown.map(w => w.weekday),
    datasets: [{ label: '満席率', data: weekdayBreakdown.map(w => w.fullRate), backgroundColor: 'rgba(16, 185, 129, 0.7)', borderRadius: 4 }]
  }), [weekdayBreakdown])

  const timeSlotChartData = useMemo(() => ({
    labels: timeSlotBreakdown.map(t => t.slot),
    datasets: [{ label: '満席率', data: timeSlotBreakdown.map(t => t.fullRate), backgroundColor: 'rgba(245, 158, 11, 0.7)', borderRadius: 4 }]
  }), [timeSlotBreakdown])

  // プリセット定義
  const PRESETS = useMemo(() => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    const months: { value: string; label: string }[] = []
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      months.push({ value: `month:${yyyy}-${mm}`, label: `${yyyy}/${d.getMonth() + 1}月` })
    }
    return [
      { value: 'past90days', label: '過去90日' },
      { value: 'past180days', label: '過去180日' },
      { value: 'thisYear', label: '今年' },
      { value: 'lastYear', label: '昨年' },
      ...months,
    ]
  }, [])

  // カスタム日付範囲の現在値
  const customDates = useMemo(() => {
    if (!period.startsWith('custom:')) return { start: undefined, end: undefined }
    const parts = period.slice(7).split(':')
    return { start: parts[0], end: parts[1] }
  }, [period])

  const handleCustomDateChange = (startDate?: string, endDate?: string) => {
    if (startDate && endDate) {
      loadOpenEventData(`custom:${startDate}:${endDate}`, selectedStoreIds)
    }
  }

  // カラム定義
  const ALL_COLUMNS = [
    { key: 'scenarioTitle' as const, label: 'シナリオ', align: 'left' as const, hideable: false },
    { key: 'badges'        as const, label: 'バッジ',   align: 'left' as const, hideable: true },
    { key: 'totalEvents'   as const, label: '公演数',   align: 'right' as const, hideable: true },
    { key: 'fullEvents'    as const, label: '満席数',   align: 'right' as const, hideable: true },
    { key: 'fullRate'      as const, label: '満席率',   align: 'right' as const, hideable: true },
    { key: 'avgDaysToFull' as const, label: '平均満席日数', align: 'right' as const, hideable: true },
  ]

  type SortKey = 'scenarioTitle' | 'badges' | 'totalEvents' | 'fullEvents' | 'fullRate' | 'avgDaysToFull'
  const [sortKey, setSortKey] = useState<SortKey>('totalEvents')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    scenarioTitle: true, badges: true, totalEvents: true, fullEvents: true, fullRate: true, avgDaysToFull: true
  })
  const [badgeFilter, setBadgeFilter] = useState<string | null>(null)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'scenarioTitle' ? 'asc' : 'desc')
    }
  }

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // テーブルに出すバッジラベル一覧（全シナリオ横断）
  const allBadgeLabels = useMemo(() => {
    const set = new Set<string>()
    for (const s of scenarioBreakdown) {
      for (const b of s.badges) set.add(b.label)
    }
    return Array.from(set)
  }, [scenarioBreakdown])

  const filteredScenarios = useMemo(() => {
    if (!badgeFilter) return scenarioBreakdown
    return scenarioBreakdown.filter(s => s.badges.some(b => b.label === badgeFilter))
  }, [scenarioBreakdown, badgeFilter])

  const sortedScenarios = useMemo(() => {
    return [...filteredScenarios].sort((a, b) => {
      if (sortKey === 'badges') {
        return sortDir === 'asc' ? a.badges.length - b.badges.length : b.badges.length - a.badges.length
      }
      const av = a[sortKey as keyof typeof a]
      const bv = b[sortKey as keyof typeof b]
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [filteredScenarios, sortKey, sortDir])

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-1 opacity-40" />
    return sortDir === 'asc'
      ? <ChevronUp className="inline h-3 w-3 ml-1 text-primary" />
      : <ChevronDown className="inline h-3 w-3 ml-1 text-primary" />
  }

  // スロット別の文章アドバイス生成
  const getSlotAdvice = (list: typeof recommendations.weekdayAfternoon, slotLabel: string): string => {
    if (list.length === 0) {
      return `${slotLabel}の実績データがまだありません。まずは公演を開催してデータを積み上げましょう。`
    }

    const top = list[0]
    const allSmallSample = list.every(r => r.slotTotal <= 2)
    const topRate = top.slotFullRate
    const topIsSmall = top.slotTotal <= 2

    // 全件サンプル少
    if (allSmallSample) {
      return `${slotLabel}はまだデータが少なく傾向を判断しにくい状況です。各シナリオを複数回開催して実績を積みましょう。`
    }

    // トップが小サンプル
    if (topIsSmall) {
      const reliable = list.find(r => r.slotTotal > 2)
      if (reliable) {
        return `「${reliable.scenarioTitle}」は${reliable.slotTotal}公演の実績で満席率${reliable.slotFullRate.toFixed(0)}%と安定しています。サンプルの多いシナリオを優先的に開催し、傾向をつかんでいきましょう。`
      }
      return `${slotLabel}はまだ十分なデータが集まっていません。まずはデータを増やすことを優先しましょう。`
    }

    // 高満席率（80%以上）
    if (topRate >= 80) {
      const daysNote = top.avgDaysToFull > 0 ? `平均${top.avgDaysToFull.toFixed(0)}日で満席になる傾向があり、` : ''
      const multiNote = list.length >= 2 && list[1].slotFullRate >= 60
        ? `「${list[1].scenarioTitle}」(${list[1].slotFullRate.toFixed(0)}%)も好調です。` : ''
      return `「${top.scenarioTitle}」が${top.slotTotal}公演で満席率${topRate.toFixed(0)}%と最も安定しています。${daysNote}引き続き優先的に組み込みましょう。${multiNote}`
    }

    // 中程度（50〜80%）
    if (topRate >= 50) {
      const lowNote = list.length >= 2 && list[list.length - 1].slotFullRate < 30
        ? `一方「${list[list.length - 1].scenarioTitle}」は満席率が低め（${list[list.length - 1].slotFullRate.toFixed(0)}%）で見直しの余地があります。` : ''
      return `「${top.scenarioTitle}」(満席率${topRate.toFixed(0)}%)が最も成績が良いですが、改善の余地があります。早めの告知や定員設定の調整を検討してみましょう。${lowNote}`
    }

    // 低満席率（50%未満）
    return `${slotLabel}は全体的に満席率が低く（最高${topRate.toFixed(0)}%）、課題がある状況です。他の時間帯で実績のあるシナリオを試すか、集客施策の強化を検討しましょう。`
  }

  const hasData = stats.totalEvents > 0

  return (
    <div className="space-y-4 md:space-y-6">
      {/* ヘッダー */}
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold">公演分析</span>
          </div>
        }
        description="オープン公演の満席率・満席日数を分析します"
      />

      {/* 期間選択 */}
      <div className="flex flex-wrap gap-2 items-center">
        {PRESETS.map(p => (
          <Button
            key={p.value}
            variant={period === p.value ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => handlePeriodChange(p.value)}
          >
            {p.label}
          </Button>
        ))}
        <DateRangePopover
          startDate={customDates.start}
          endDate={customDates.end}
          onDateChange={handleCustomDateChange}
          label={period.startsWith('custom:') ? `${customDates.start} 〜 ${customDates.end}` : 'カスタム期間'}
          buttonClassName={period.startsWith('custom:') ? 'border-primary text-primary' : ''}
        />
      </div>

      <div className="text-xs text-muted-foreground">
        期間: {dateRange.startDate} ～ {dateRange.endDate}
      </div>

      {/* フィルター行 */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-64">
          <StoreMultiSelect
            stores={stores}
            selectedStoreIds={selectedStoreIds}
            onStoreIdsChange={onStoreIdsChange}
            label="店舗選択"
            placeholder="全店舗"
          />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <Switch
            id="include-gmtest"
            checked={includeGmTest}
            onCheckedChange={handleGmTestToggle}
          />
          <Label htmlFor="include-gmtest" className="text-sm cursor-pointer">GMテストを含む</Label>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          読み込み中...
        </div>
      )}

      {!loading && !hasData && (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          この期間のオープン公演データがありません
        </div>
      )}

      {!loading && hasData && (
        <>
          {/* サマリーカード */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Card className="shadow-none border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3 md:p-4">
                <CardTitle className="text-sm text-muted-foreground">総公演数</CardTitle>
                <CalendarCheck className="h-4 w-4 text-blue-500 flex-shrink-0" />
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="text-2xl font-bold">{stats.totalEvents}<span className="text-sm font-normal ml-1">件</span></div>
                <p className="text-xs text-muted-foreground mt-1">満席 {stats.fullEvents}件</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 shadow-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3 md:p-4">
                <CardTitle className="text-sm text-blue-800">満席率</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-600 flex-shrink-0" />
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="text-2xl font-bold text-blue-900">{stats.fullRate.toFixed(1)}<span className="text-sm font-normal ml-0.5">%</span></div>
                <p className="text-xs text-blue-700 mt-1">{stats.fullEvents}/{stats.totalEvents} 公演</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200 shadow-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3 md:p-4">
                <CardTitle className="text-sm text-amber-800">平均満席日数</CardTitle>
                <Clock className="h-4 w-4 text-amber-600 flex-shrink-0" />
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="text-2xl font-bold text-amber-900">
                  {stats.avgDaysToFull > 0 ? stats.avgDaysToFull.toFixed(1) : '—'}
                  {stats.avgDaysToFull > 0 && <span className="text-sm font-normal ml-1">日</span>}
                </div>
                <p className="text-xs text-amber-700 mt-1">公演作成日から満席まで</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200 shadow-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3 md:p-4">
                <CardTitle className="text-sm text-green-800">平均充填率</CardTitle>
                <Users className="h-4 w-4 text-green-600 flex-shrink-0" />
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="text-2xl font-bold text-green-900">{stats.avgFillRate.toFixed(1)}<span className="text-sm font-normal ml-0.5">%</span></div>
                <p className="text-xs text-green-700 mt-1">max_participants 対比</p>
              </CardContent>
            </Card>
          </div>

          {/* 月別満席率グラフ */}
          {monthlyBreakdown.length > 0 && (
            <Card className="shadow-none border">
              <CardHeader className="p-3 md:p-4">
                <CardTitle className="text-sm">月別 満席率推移</CardTitle>
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="h-48 md:h-64">
                  <Bar data={monthlyChartData} options={BAR_OPTIONS} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* 曜日別・時間帯別グラフ */}
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="shadow-none border">
              <CardHeader className="p-3 md:p-4">
                <CardTitle className="text-sm">曜日別 満席率</CardTitle>
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="h-40 md:h-48">
                  <Bar data={weekdayChartData} options={BAR_OPTIONS} />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-none border">
              <CardHeader className="p-3 md:p-4">
                <CardTitle className="text-sm">時間帯別 満席率</CardTitle>
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="h-40 md:h-48">
                  <Bar data={timeSlotChartData} options={BAR_OPTIONS} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 公演計画アドバイス */}
          {(recommendations.weekdayAfternoon.length > 0 || recommendations.weekdayEvening.length > 0 || recommendations.weekend.length > 0) && (
            <Card className="shadow-none border">
              <CardHeader className="p-3 md:p-4 pb-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />
                  <CardTitle className="text-sm">公演計画アドバイス</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  過去データをもとに、各時間帯で成功しやすいシナリオを提案します
                </p>
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="grid gap-3 md:grid-cols-3">
                  {([
                    { key: 'weekdayAfternoon', label: '平日 昼', sub: '(〜17時)', color: 'green',  list: recommendations.weekdayAfternoon },
                    { key: 'weekdayEvening',   label: '平日 夜', sub: '(17時〜)', color: 'purple', list: recommendations.weekdayEvening },
                    { key: 'weekend',          label: '土 日',   sub: '',         color: 'blue',   list: recommendations.weekend },
                  ] as const).map(({ key, label, sub, color, list }) => (
                    <div key={key} className={`rounded-lg border p-3 ${
                      color === 'green'  ? 'border-green-200 bg-green-50/50' :
                      color === 'purple' ? 'border-purple-200 bg-purple-50/50' :
                                           'border-blue-200 bg-blue-50/50'
                    }`}>
                      <div className="flex items-baseline gap-1.5 mb-1.5">
                        <span className={`font-semibold text-sm ${
                          color === 'green' ? 'text-green-800' : color === 'purple' ? 'text-purple-800' : 'text-blue-800'
                        }`}>{label}</span>
                        {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
                      </div>

                      {/* 文章アドバイス */}
                      <p className={`text-[11px] leading-relaxed mb-3 ${
                        color === 'green' ? 'text-green-900' : color === 'purple' ? 'text-purple-900' : 'text-blue-900'
                      }`}>
                        {getSlotAdvice(list, label)}
                      </p>

                      {list.length === 0 ? null : (
                        <ol className="space-y-2.5">
                          {list.map((rec, i) => {
                            const isSmallSample = rec.slotTotal <= 2
                            return (
                            <li key={i} className="flex gap-2 items-start">
                              <span className={`mt-0.5 shrink-0 text-[11px] font-bold w-4 ${
                                i === 0 ? (color === 'green' ? 'text-green-600' : color === 'purple' ? 'text-purple-600' : 'text-blue-600') : 'text-muted-foreground'
                              }`}>{i + 1}</span>
                              <div className="min-w-0 w-full">
                                <p className="text-xs font-medium leading-snug truncate">{rec.scenarioTitle}</p>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                  {/* このスロットの満席率 */}
                                  <span className={`text-[11px] font-semibold ${
                                    isSmallSample ? 'text-muted-foreground' :
                                    rec.slotFullRate >= 80 ? 'text-blue-600' :
                                    rec.slotFullRate >= 50 ? 'text-amber-600' : 'text-muted-foreground'
                                  }`}>
                                    この枠 {rec.slotFullRate.toFixed(0)}%
                                  </span>
                                  {/* サンプル数 */}
                                  <span className={`text-[11px] ${isSmallSample ? 'text-amber-500 font-medium' : 'text-muted-foreground'}`}>
                                    {rec.slotTotal}公演{isSmallSample ? ' ⚠' : ''}
                                  </span>
                                  {/* 全体満席率（参考）*/}
                                  <span className="text-[11px] text-muted-foreground">
                                    全体 {rec.overallFullRate.toFixed(0)}%
                                  </span>
                                </div>
                                {/* 満席まで平均日数 */}
                                {rec.avgDaysToFull > 0 && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    満席まで平均 {rec.avgDaysToFull.toFixed(0)}日
                                  </p>
                                )}
                                {isSmallSample && (
                                  <p className="text-[10px] text-amber-600 mt-0.5">
                                    サンプルが少ないため参考値です
                                  </p>
                                )}
                                {rec.badges.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {rec.badges.slice(0, 3).map((b, bi) => (
                                      <span key={bi} className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium ${
                                        b.color === 'blue'   ? 'bg-blue-100 text-blue-700' :
                                        b.color === 'green'  ? 'bg-green-100 text-green-700' :
                                        b.color === 'amber'  ? 'bg-amber-100 text-amber-700' :
                                        b.color === 'purple' ? 'bg-purple-100 text-purple-700' :
                                        b.color === 'rose'   ? 'bg-rose-100 text-rose-700' :
                                                               'bg-slate-100 text-slate-600'
                                      }`}>{b.label}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </li>
                            )
                          })}
                        </ol>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* シナリオ別テーブル */}
          {scenarioBreakdown.length > 0 && (
            <Card className="shadow-none border">
              <CardHeader className="p-3 md:p-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">シナリオ別 分析</CardTitle>

                  <div className="flex items-center gap-1.5">
                    {/* バッジ説明ポップオーバー */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                          <Info className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-80 p-3">
                        <p className="text-xs font-semibold mb-2.5">バッジの判定条件</p>
                        <div className="space-y-1.5">
                          {([
                            { label: '土日強い',      color: 'blue',   desc: '土日満席率 ≥ 平日満席率 + 10pt（各1公演以上）' },
                            { label: '平日強い',      color: 'green',  desc: '平日満席率 ≥ 土日満席率 + 10pt（各1公演以上）' },
                            { label: '平日昼強い',    color: 'green',  desc: '平日午後満席率 ≥ 全体満席率 + 10pt（1公演以上）' },
                            { label: '夜人気',        color: 'purple', desc: '夜間満席率が他の時間帯より 10pt 以上高い（1公演以上）' },
                            { label: 'すぐ満席',      color: 'rose',   desc: '平均満席日数 ≤ 3日' },
                            { label: '直前人気',      color: 'amber',  desc: '平均満席日数 ≤ 7日（すぐ満席を除く）' },
                            { label: 'じっくり埋まる', color: 'slate', desc: '平均満席日数 ≥ 21日' },
                            { label: '人気定番',      color: 'green',  desc: '3公演以上 かつ 満席率 ≥ 60%' },
                          ] as { label: string; color: string; desc: string }[]).map(b => (
                            <div key={b.label} className="flex items-start gap-2">
                              <span className={`mt-0.5 shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                b.color === 'blue'   ? 'bg-blue-100 text-blue-700' :
                                b.color === 'green'  ? 'bg-green-100 text-green-700' :
                                b.color === 'amber'  ? 'bg-amber-100 text-amber-700' :
                                b.color === 'purple' ? 'bg-purple-100 text-purple-700' :
                                b.color === 'rose'   ? 'bg-rose-100 text-rose-700' :
                                                       'bg-slate-100 text-slate-600'
                              }`}>
                                {b.label}
                              </span>
                              <span className="text-xs text-muted-foreground leading-relaxed">{b.desc}</span>
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>

                    {/* 表示設定ポップオーバー */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                          <SlidersHorizontal className="h-3 w-3" />
                          表示設定
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-48 p-2">
                        <p className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">カラム表示</p>
                        {ALL_COLUMNS.filter(c => c.hideable).map(col => (
                          <label
                            key={col.key}
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={visibleColumns[col.key] ?? true}
                              onCheckedChange={() => toggleColumn(col.key)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="text-sm">{col.label}</span>
                          </label>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* バッジフィルター */}
                {allBadgeLabels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {allBadgeLabels.map(label => (
                      <button
                        key={label}
                        onClick={() => setBadgeFilter(f => f === label ? null : label)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                          badgeFilter === label
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                        }`}
                      >
                        {label}
                        {badgeFilter === label && <X className="h-2.5 w-2.5" />}
                      </button>
                    ))}
                    {badgeFilter && (
                      <button
                        onClick={() => setBadgeFilter(null)}
                        className="text-xs text-muted-foreground underline underline-offset-2 px-1"
                      >
                        クリア
                      </button>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        {ALL_COLUMNS.filter(c => visibleColumns[c.key] ?? true).map(col => (
                          <th
                            key={col.key}
                            className={`p-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground text-${col.align}`}
                            onClick={() => handleSort(col.key)}
                          >
                            {col.label}<SortIcon col={col.key} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedScenarios.map((row, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                          {(visibleColumns['scenarioTitle'] ?? true) && (
                            <td className="p-3 font-medium max-w-[200px]">{row.scenarioTitle}</td>
                          )}
                          {(visibleColumns['badges'] ?? true) && (
                            <td className="p-3">
                              {row.badges.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {row.badges.map((badge, bi) => (
                                    <span
                                      key={bi}
                                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                        badge.color === 'blue'   ? 'bg-blue-100 text-blue-700' :
                                        badge.color === 'green'  ? 'bg-green-100 text-green-700' :
                                        badge.color === 'amber'  ? 'bg-amber-100 text-amber-700' :
                                        badge.color === 'purple' ? 'bg-purple-100 text-purple-700' :
                                        badge.color === 'rose'   ? 'bg-rose-100 text-rose-700' :
                                                                    'bg-slate-100 text-slate-600'
                                      }`}
                                    >
                                      {badge.label}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                          )}
                          {(visibleColumns['totalEvents'] ?? true) && (
                            <td className="p-3 text-right">{row.totalEvents}</td>
                          )}
                          {(visibleColumns['fullEvents'] ?? true) && (
                            <td className="p-3 text-right">{row.fullEvents}</td>
                          )}
                          {(visibleColumns['fullRate'] ?? true) && (
                            <td className="p-3 text-right">
                              <span className={`font-medium ${row.fullRate >= 80 ? 'text-blue-600' : row.fullRate >= 50 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                {row.fullRate.toFixed(1)}%
                              </span>
                            </td>
                          )}
                          {(visibleColumns['avgDaysToFull'] ?? true) && (
                            <td className="p-3 text-right text-muted-foreground">
                              {row.avgDaysToFull > 0 ? `${row.avgDaysToFull.toFixed(1)} 日` : '—'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
