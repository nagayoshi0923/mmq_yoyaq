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
import { CalendarCheck, TrendingUp, Clock, Users, ChevronUp, ChevronDown, ChevronsUpDown, SlidersHorizontal, X, Info, CheckCircle2, AlertTriangle, Lightbulb } from 'lucide-react'
import type { InsightType } from '../hooks/useOpenEventAnalysis'
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
    insights,
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

  const insightStyle = (type: InsightType) => {
    if (type === 'positive')   return { border: 'border-green-200  bg-green-50/60',  icon: <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />,   title: 'text-green-900',  body: 'text-green-800' }
    if (type === 'warning')    return { border: 'border-amber-200  bg-amber-50/60',  icon: <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />,  title: 'text-amber-900',  body: 'text-amber-800' }
    return                            { border: 'border-blue-200   bg-blue-50/60',   icon: <Lightbulb     className="h-4 w-4 text-blue-600  shrink-0 mt-0.5" />,  title: 'text-blue-900',   body: 'text-blue-800'  }
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

          {/* 実績の振り返りと改善 */}
          {insights.length > 0 && (
            <Card className="shadow-none border">
              <CardHeader className="p-3 md:p-4 pb-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />
                  <CardTitle className="text-sm">実績の振り返りと改善</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  この期間の公演データをもとに、課題と改善点を自動分析しています
                </p>
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="space-y-2">
                  {insights.map((insight, i) => {
                    const s = insightStyle(insight.type)
                    return (
                      <div key={i} className={`flex gap-3 rounded-lg border p-3 ${s.border}`}>
                        {s.icon}
                        <div>
                          <p className={`text-xs font-semibold leading-snug ${s.title}`}>{insight.title}</p>
                          <p className={`text-xs leading-relaxed mt-0.5 ${s.body}`}>{insight.body}</p>
                        </div>
                      </div>
                    )
                  })}
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
