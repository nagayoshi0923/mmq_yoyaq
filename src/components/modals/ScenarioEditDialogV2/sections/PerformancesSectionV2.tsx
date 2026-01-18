import { logger } from '@/utils/logger'
import React, { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CalendarDays, Users, Coins, AlertCircle, MapPin, Clock } from 'lucide-react'
import { storeApi } from '@/lib/api'
import type { Store } from '@/types'

interface PerformanceDate {
  date: string
  category: string
  participants: number
  demoParticipants: number
  staffParticipants: number
  revenue: number
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
}

// カテゴリの日本語表示
const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: '通常', color: 'bg-blue-100 text-blue-700' },
  private: { label: '貸切', color: 'bg-purple-100 text-purple-700' },
  gm_test: { label: 'GMテスト', color: 'bg-yellow-100 text-yellow-700' },
  internal: { label: '内部', color: 'bg-gray-100 text-gray-700' },
  offsite: { label: '出張', color: 'bg-green-100 text-green-700' },
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
  participationCosts,
  gmTestParticipationFee = 0,
  scenarioParticipationFee = 0,
  totalParticipants: apiTotalParticipants = 0,
  totalStaffParticipants: apiTotalStaffParticipants = 0,
  totalRevenue: apiTotalRevenue = 0
}: PerformancesSectionV2Props) {
  const [stores, setStores] = useState<Store[]>([])

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

  if (performanceDates.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">公演実績がありません</p>
              <p className="text-sm">このシナリオはまだ公演されていません</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* サマリー（中止公演を除外） */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-6 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">公演回数:</span>
              <span className="text-lg font-bold">{activePerformances.length}回</span>
              {performanceDates.length !== activePerformances.length && (
                <span className="text-xs text-muted-foreground">
                  （中止{performanceDates.length - activePerformances.length}回）
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
                  （+{apiTotalStaffParticipants}スタッフ）
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
        </CardContent>
      </Card>

      {/* 年ごとの公演リスト */}
      {sortedYears.map((year) => (
        <Card key={year}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-muted-foreground">
                {year}年 ({groupedByYear[year].length}回)
              </h3>
            </div>
            <div className="space-y-2">
              {groupedByYear[year].map((perf, index) => {
                const { month, day, weekday } = formatDate(perf.date)
                const categoryInfo = CATEGORY_LABELS[perf.category] || CATEGORY_LABELS.open
                const timeSlot = getTimeSlot(perf.startTime)
                const timeSlotInfo = TIME_SLOT_LABELS[timeSlot] || TIME_SLOT_LABELS['昼']
                // perf.revenue にはDBに保存されている実際の売上が入っている
                const displayRevenue = perf.revenue || 0
                
                return (
                  <div 
                    key={`${perf.date}-${index}`}
                    className={`flex items-center gap-3 py-2 px-3 rounded-md transition-colors ${
                      perf.isCancelled 
                        ? 'bg-red-50 hover:bg-red-100 opacity-70' 
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
                              (+{perf.staffParticipants}スタッフ)
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
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
