import React, { useState, useEffect, useRef } from 'react'
import { SalesData } from '@/types'
import { SummaryCards } from './SummaryCards'
import { EventListCard } from './EventListCard'
import { SalesChart } from './SalesChart'
import { ExportButtons } from './ExportButtons'
import { PerformanceModal } from '@/components/schedule/PerformanceModal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DateRangePopover } from '@/components/ui/date-range-popover'
import { MonthSwitcher } from '@/components/patterns/calendar/MonthSwitcher'
import { Settings } from 'lucide-react'
import { scenarioApi, staffApi, storeApi, scheduleApi } from '@/lib/api'
import type { Staff, Scenario, Store } from '@/types'

interface StoreInfo {
  id: string
  name: string
  short_name: string
  ownership_type?: 'corporate' | 'franchise' | 'office'
}

interface SalesOverviewProps {
  salesData: SalesData | null
  loading: boolean
  stores: StoreInfo[]
  selectedPeriod: string
  selectedStore: string
  dateRange: { startDate: string; endDate: string }
  customStartDate: string
  customEndDate: string
  onCustomStartDateChange: (date: string) => void
  onCustomEndDateChange: (date: string) => void
  onPeriodChange: (period: string) => void
  onStoreChange: (store: string) => void
  onDataRefresh?: () => void
  isFranchiseOnly?: boolean
}

/**
 * 売上概要セクション
 */
export const SalesOverview: React.FC<SalesOverviewProps> = ({
  salesData,
  loading,
  stores,
  selectedPeriod,
  selectedStore,
  dateRange,
  customStartDate,
  customEndDate,
  onCustomStartDateChange,
  onCustomEndDateChange,
  onPeriodChange,
  onStoreChange,
  onDataRefresh,
  isFranchiseOnly = false
}) => {
  // 編集モーダルの状態管理
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<any>(null)
  const [modalData, setModalData] = useState<{
    stores: Store[]
    scenarios: Scenario[]
    staff: Staff[]
    availableStaffByScenario: Record<string, Staff[]>
  } | null>(null)
  
  // 月切り替えの状態管理
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0)
  })
  const [showPeriodSettings, setShowPeriodSettings] = useState(false)
  
  // 前回のcustomStartDateとcustomEndDateを記録（無限ループ防止用）
  const prevCustomDatesRef = useRef<{ startDate: string; endDate: string } | null>(null)
  
  // customStartDateが変更されたときにcurrentMonthを同期（外部から期間設定が変更された場合）
  useEffect(() => {
    if (!customStartDate) return
    
    // customStartDateから年月を取得
    const [yearStr, monthStr] = customStartDate.split('-')
    if (!yearStr || !monthStr) return
    
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10) - 1 // 0-indexed
    
    // 現在のcurrentMonthと比較
    const currentYear = currentMonth.getFullYear()
    const currentMonthIndex = currentMonth.getMonth()
    
    // 異なる場合のみ更新（無限ループを防ぐ）
    if (year !== currentYear || month !== currentMonthIndex) {
      const newDate = new Date(year, month, 1, 12, 0, 0, 0)
      setCurrentMonth(newDate)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customStartDate])

  // 月が変更されたら自動的に期間を更新（タイムゾーン安全）
  useEffect(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    
    // 月初と月末を計算（必ず正午で作成してタイムゾーン問題を回避）
    const startDate = new Date(year, month, 1, 12, 0, 0, 0)
    const endDate = new Date(year, month + 1, 0, 12, 0, 0, 0)
    
    // YYYY-MM-DD形式に変換
    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const endYear = endDate.getFullYear()
    const endMonth = endDate.getMonth() + 1
    const endDay = endDate.getDate()
    const endStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
    
    console.log('📅 月切り替え:', { year, month: month + 1, startStr, endStr })
    
    // 日付を更新（データ取得はcustomStartDate/customEndDateの更新後に実行される）
    onCustomStartDateChange(startStr)
    onCustomEndDateChange(endStr)
    // 期間をcustomに設定（データ取得はcustomStartDate/customEndDateの更新後に実行される）
    // 注意: onPeriodChangeは呼ばない（customStartDate/customEndDateの更新後に実行される）
    if (selectedPeriod !== 'custom') {
      onPeriodChange('custom')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth])

  // customStartDateとcustomEndDateが更新され、期間がcustomのときにデータを再取得
  useEffect(() => {
    // 期間がcustomでない場合はスキップ（他の期間設定から変更された場合）
    if (selectedPeriod !== 'custom') {
      // 期間がcustomでない場合は、prevCustomDatesRefをリセット
      prevCustomDatesRef.current = null
      return
    }
    // customStartDateまたはcustomEndDateが空の場合はスキップ
    if (!customStartDate || !customEndDate) return
    
    // 前回の値と比較して、実際に変更があった場合のみデータを再取得
    const prevDates = prevCustomDatesRef.current
    if (prevDates && prevDates.startDate === customStartDate && prevDates.endDate === customEndDate) {
      // 変更がない場合はスキップ
      return
    }
    
    // 前回の値を更新
    prevCustomDatesRef.current = { startDate: customStartDate, endDate: customEndDate }
    
    console.log('📅 カスタム期間変更によるデータ再取得:', { customStartDate, customEndDate })
    
    // データを再取得（onPeriodChangeを呼ぶとloadSalesDataが実行される）
    onPeriodChange('custom')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customStartDate, customEndDate, selectedPeriod])

  // モーダル用データの取得
  useEffect(() => {
    const fetchModalData = async () => {
      try {
        const [storesData, scenariosData, staffData] = await Promise.all([
          storeApi.getAll(),
          scenarioApi.getAll(),
          staffApi.getAll()
        ])

        // シナリオ別の利用可能スタッフを計算
        const availableStaffByScenario: Record<string, Staff[]> = {}
        scenariosData.forEach(scenario => {
          if (scenario.available_gms && Array.isArray(scenario.available_gms)) {
            availableStaffByScenario[scenario.id] = staffData.filter(staff => 
              scenario.available_gms.includes(staff.name)
            )
          } else {
            availableStaffByScenario[scenario.id] = []
          }
        })

        setModalData({
          stores: storesData,
          scenarios: scenariosData,
          staff: staffData,
          availableStaffByScenario
        })
      } catch (error) {
        console.error('モーダル用データの取得に失敗:', error)
      }
    }

    fetchModalData()
  }, [])

  // イベント編集ハンドラー
  const handleEditEvent = (event: any) => {
    // 売上データのイベントをPerformanceModalが期待する形式に変換
    const modalEvent = {
      id: event.id,
      date: event.date,
      venue: event.store_name, // 店舗名をvenueとして使用
      store_id: stores.find(s => s.name === event.store_name)?.id || '',
      scenario: event.scenario_title,
      scenario_id: '', // シナリオIDは後でモーダル内で設定
      start_time: '10:00', // デフォルト値
      end_time: '18:00', // デフォルト値
      category: event.category || 'open',
      is_cancelled: false,
      participant_count: event.participant_count,
      max_participants: 8, // デフォルト値
      capacity: 8, // デフォルト値
      gms: [], // デフォルト値
      notes: '',
      is_reservation_enabled: true
    }
    
    setEditingEvent(modalEvent)
    setIsEditModalOpen(true)
  }

  // モーダル保存ハンドラー
  const handleModalSave = async (eventData: any) => {
    try {
      if (!editingEvent?.id) {
        console.error('編集対象のイベントIDがありません')
        return
      }

      // スケジュール更新用のデータを準備
      const updateData: any = {}
      
      if (eventData.scenario_id) updateData.scenario_id = eventData.scenario_id
      if (eventData.scenario) updateData.scenario = eventData.scenario
      if (eventData.category) updateData.category = eventData.category
      if (eventData.start_time) updateData.start_time = eventData.start_time
      if (eventData.end_time) updateData.end_time = eventData.end_time
      if (eventData.capacity !== undefined) updateData.capacity = eventData.capacity
      if (eventData.gms) updateData.gms = eventData.gms
      if (eventData.notes !== undefined) updateData.notes = eventData.notes
      if (eventData.is_cancelled !== undefined) updateData.is_cancelled = eventData.is_cancelled
      if (eventData.is_reservation_enabled !== undefined) updateData.is_reservation_enabled = eventData.is_reservation_enabled

      // スケジュールを更新
      await scheduleApi.update(editingEvent.id, updateData)
      
      console.log('スケジュール更新完了:', updateData)
      
      // データ更新後にリフレッシュ
      if (onDataRefresh) {
        onDataRefresh()
      }
      
      setIsEditModalOpen(false)
      setEditingEvent(null)
    } catch (error) {
      console.error('保存に失敗:', error)
      // エラーハンドリング（トースト通知など）をここに追加可能
    }
  }

  // モーダル閉じるハンドラー
  const handleModalClose = () => {
    setIsEditModalOpen(false)
    setEditingEvent(null)
  }
  if (loading) {
    return (
      <div className="space-y-3 sm:space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">{isFranchiseOnly ? 'フランチャイズ売上管理' : '売上管理'}</h1>
        </div>
        <Card>
          <CardContent className="p-4 sm:p-6 md:p-8">
            <div className="text-center text-muted-foreground text-xs sm:text-sm">読み込み中...</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      {/* ヘッダー：タイトルとエクスポートボタン */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">{isFranchiseOnly ? 'フランチャイズ売上管理' : '売上管理'}</h1>
        <ExportButtons salesData={salesData} />
      </div>

      {/* 月切り替えと期間設定 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 flex-1">
          {/* 月切り替え */}
          <div className="flex-shrink-0">
            <MonthSwitcher
              value={currentMonth}
              onChange={setCurrentMonth}
              showToday={true}
              quickJump={true}
              enableKeyboard={true}
            />
          </div>
          
          {/* 期間設定ボタン */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPeriodSettings(!showPeriodSettings)}
            className="h-8 sm:h-9 text-xs sm:text-sm"
          >
            <Settings className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">期間設定</span>
            <span className="sm:hidden">設定</span>
          </Button>
        </div>

        {/* 店舗選択 */}
        <div className="w-full sm:w-[200px] flex-shrink-0">
          <Select value={selectedStore} onValueChange={onStoreChange}>
            <SelectTrigger className="text-xs sm:text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全店舗</SelectItem>
              {stores.map(store => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 期間設定パネル（トグル表示） */}
      {showPeriodSettings && (
        <Card className="mb-4 sm:mb-6">
          <CardContent className="p-3 sm:p-4 space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
              <Label className="text-xs sm:text-sm min-w-[80px] sm:min-w-[80px]">期間プリセット</Label>
              <Select value={selectedPeriod} onValueChange={onPeriodChange}>
                <SelectTrigger className="flex-1 text-xs sm:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="thisMonth">今月</SelectItem>
                  <SelectItem value="lastMonth">先月</SelectItem>
                  <SelectItem value="thisWeek">今週</SelectItem>
                  <SelectItem value="lastWeek">先週</SelectItem>
                  <SelectItem value="last7days">直近7日</SelectItem>
                  <SelectItem value="last30days">直近30日</SelectItem>
                  <SelectItem value="thisYear">今年</SelectItem>
                  <SelectItem value="lastYear">去年</SelectItem>
                  <SelectItem value="custom">カスタム期間</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* カスタム期間選択UI */}
            {selectedPeriod === 'custom' && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
                <Label className="text-xs sm:text-sm min-w-[80px] sm:min-w-[80px]">カスタム期間</Label>
                <div className="flex-1">
                  <DateRangePopover
                    label="期間を選択"
                    startDate={customStartDate}
                    endDate={customEndDate}
                    onDateChange={(start, end) => {
                      if (start) onCustomStartDateChange(start)
                      if (end) onCustomEndDateChange(end)
                    }}
                  />
                </div>
                <Button
                  onClick={() => onPeriodChange('custom')}
                  disabled={!customStartDate || !customEndDate}
                  size="sm"
                  className="text-xs sm:text-sm"
                >
                  適用
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}


      {/* サマリーカード */}
      {salesData ? (
        <>
          <div className="mb-4 sm:mb-6">
        <SummaryCards
          totalRevenue={salesData.totalRevenue}
          averageRevenue={salesData.averageRevenuePerEvent}
          totalEvents={salesData.totalEvents}
          storeCount={salesData.storeRanking.length}
          totalLicenseCost={salesData.totalLicenseCost}
          totalGmCost={salesData.totalGmCost}
          totalProductionCost={salesData.totalProductionCost}
          totalPropsCost={salesData.totalPropsCost}
          totalFixedCost={salesData.totalFixedCost}
          fixedCostBreakdown={salesData.fixedCostBreakdown}
          productionCostBreakdown={salesData.productionCostBreakdown}
          propsCostBreakdown={salesData.propsCostBreakdown}
          totalVariableCost={salesData.totalVariableCost}
          variableCostBreakdown={salesData.variableCostBreakdown}
          netProfit={salesData.netProfit}
        />
          </div>

          {/* 実施公演リスト */}
          <div className="mb-4 sm:mb-6">
            <EventListCard 
              events={salesData.eventList} 
              onEditEvent={handleEditEvent}
            />
          </div>

          {/* チャート */}
          <SalesChart 
            chartData={salesData.chartData}
            chartOptions={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false
                }
              },
              scales: {
                y: {
                  beginAtZero: true
                }
              }
            }}
          />
        </>
      ) : (
        <Card>
          <CardContent className="p-4 sm:p-6 md:p-8">
            <div className="text-center text-muted-foreground text-xs sm:text-sm">
              データを読み込んでいます...
            </div>
          </CardContent>
        </Card>
      )}

      {/* 編集モーダル */}
      {modalData && (
        <PerformanceModal
          isOpen={isEditModalOpen}
          onClose={handleModalClose}
          onSave={handleModalSave}
          mode="edit"
          event={editingEvent}
          initialData={editingEvent}
          stores={modalData.stores}
          scenarios={modalData.scenarios}
          staff={modalData.staff}
          availableStaffByScenario={modalData.availableStaffByScenario}
          onParticipantChange={() => {
            // 参加者数が変更された場合はデータをリフレッシュ
            if (onDataRefresh) {
              onDataRefresh()
            }
          }}
        />
      )}
    </div>
  )
}
