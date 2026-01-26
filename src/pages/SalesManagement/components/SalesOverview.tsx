import React, { useState, useEffect, useRef } from 'react'
import { logger } from '@/utils/logger'
import { SalesData } from '@/types'
import { SummaryCards } from './SummaryCards'
import { EventListCard } from './EventListCard'
import { SalesChart } from './SalesChart'
import { ExportButtons } from './ExportButtons'
import { ProductionCostDialog } from './ProductionCostDialog'
import { PerformanceModal } from '@/components/schedule/PerformanceModal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DateRangePopover } from '@/components/ui/date-range-popover'
import { MonthSwitcher } from '@/components/patterns/calendar/MonthSwitcher'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import { Settings, TrendingUp } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
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
  selectedStoreIds: string[]
  dateRange: { startDate: string; endDate: string }
  customStartDate: string
  customEndDate: string
  onCustomStartDateChange: (date: string) => void
  onCustomEndDateChange: (date: string) => void
  onPeriodChange: (period: string) => void
  onStoreIdsChange: (storeIds: string[]) => void
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
  selectedStoreIds,
  dateRange,
  customStartDate,
  customEndDate,
  onCustomStartDateChange,
  onCustomEndDateChange,
  onPeriodChange,
  onStoreIdsChange,
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
  
  // 制作費ダイアログの状態管理
  const [isProductionCostDialogOpen, setIsProductionCostDialogOpen] = useState(false)
  const [editingProductionCost, setEditingProductionCost] = useState<{
    id: string
    date: string
    category: string
    amount: number
    store_id?: string | null
    scenario_id?: string | null
  } | null>(null)
  
  // 月切り替えの状態管理
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0)
  })
  const [showPeriodSettings, setShowPeriodSettings] = useState(false)
  
  // 月切り替えハンドラー（MonthSwitcherから呼ばれる）
  const handleMonthChange = (newMonth: Date) => {
    setCurrentMonth(newMonth)
    
    const year = newMonth.getFullYear()
    const month = newMonth.getMonth()
    
    // 月初と月末を計算
    const endDate = new Date(year, month + 1, 0, 12, 0, 0, 0)
    
    // YYYY-MM-DD形式に変換
    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const endDay = endDate.getDate()
    const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
    
    logger.log('📅 月切り替え:', { year, month: month + 1, startStr, endStr })
    
    // 日付を更新
    onCustomStartDateChange(startStr)
    onCustomEndDateChange(endStr)
    
    // データを再取得
    onPeriodChange('custom')
  }
  
  // 初期化時のみcurrentMonthをcustomStartDateに合わせる
  useEffect(() => {
    if (!customStartDate) return
    const [yearStr, monthStr] = customStartDate.split('-')
    if (!yearStr || !monthStr) return
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10) - 1

    const currentYear = currentMonth.getFullYear()
    const currentMonthIndex = currentMonth.getMonth()
    if (year !== currentYear || month !== currentMonthIndex) {
      setCurrentMonth(new Date(year, month, 1, 12, 0, 0, 0))
    }
  // 初回のみ実行
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        logger.error('モーダル用データの取得に失敗:', error)
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
      store_id: event.store_id || stores.find(s => s.name === event.store_name)?.id || '',
      scenario: event.scenario_title,
      scenario_id: event.scenario_id || '', // シナリオIDを使用
      start_time: event.start_time || '10:00',
      end_time: event.end_time || '18:00',
      category: event.category || 'open',
      is_cancelled: false,
      current_participants: event.participant_count,
      max_participants: event.max_participants || 8,
      capacity: event.max_participants || 8,
      gms: event.gms || [], // GMリストを使用
      gm_roles: event.gm_roles || {}, // GM役割を追加
      venue_rental_fee: event.venue_rental_fee, // 場所貸し公演料金
      notes: '',
      is_reservation_enabled: true
    }
    
    setEditingEvent(modalEvent)
    setIsEditModalOpen(true)
  }

  // モーダル保存ハンドラー
  const handleModalSave = async (eventData: any): Promise<boolean> => {
    try {
      if (!editingEvent?.id) {
        logger.error('編集対象のイベントIDがありません')
        return false
      }

      // スケジュール更新用のデータを準備
      const updateData: any = {}
      
      // scenario_id は明示的にnullも許可（場所貸しの場合クリアするため）
      if (eventData.scenario_id !== undefined) updateData.scenario_id = eventData.scenario_id
      // scenario は空文字も保存（場所貸しの場合クリアするため）
      if (eventData.scenario !== undefined) updateData.scenario = eventData.scenario
      if (eventData.category) updateData.category = eventData.category
      if (eventData.start_time) updateData.start_time = eventData.start_time
      if (eventData.end_time) updateData.end_time = eventData.end_time
      if (eventData.capacity !== undefined) updateData.capacity = eventData.capacity
      if (eventData.gms) updateData.gms = eventData.gms
      if (eventData.gm_roles) updateData.gm_roles = eventData.gm_roles // GM役割を保存
      if (eventData.venue_rental_fee !== undefined) updateData.venue_rental_fee = eventData.venue_rental_fee // 場所貸し公演料金
      if (eventData.notes !== undefined) updateData.notes = eventData.notes
      if (eventData.is_cancelled !== undefined) updateData.is_cancelled = eventData.is_cancelled
      if (eventData.is_reservation_enabled !== undefined) updateData.is_reservation_enabled = eventData.is_reservation_enabled

      // スケジュールを更新
      await scheduleApi.update(editingEvent.id, updateData)
      
      logger.log('スケジュール更新完了:', updateData)
      
      // データ更新後にリフレッシュ
      if (onDataRefresh) {
        onDataRefresh()
      }
      
      setIsEditModalOpen(false)
      setEditingEvent(null)
      return true
    } catch (error) {
      logger.error('保存に失敗:', error)
      // エラーハンドリング（トースト通知など）をここに追加可能
      return false
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
        <PageHeader
          title={
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">{isFranchiseOnly ? 'フランチャイズ売上管理' : '売上管理'}</span>
            </div>
          }
        description="期間別の売上・予約実績と分析"
      />
        <Card className="shadow-none border">
          <CardContent className="p-4 sm:p-6 md:p-8">
            <div className="text-center text-muted-foreground text-xs sm:text-sm">読み込み中...</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div id="sales-report-container" className="space-y-3 sm:space-y-4 md:space-y-6">
      {/* ヘッダー：タイトルとエクスポートボタン */}
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold">{isFranchiseOnly ? 'フランチャイズ売上管理' : '売上管理'}</span>
          </div>
        }
        description="期間別の売上・予約実績と分析"
      >
        <ExportButtons salesData={salesData} />
      </PageHeader>

      {/* 月切り替えと期間設定 */}
      <div className="flex flex-col gap-2 sm:gap-3 md:gap-4 mb-3 sm:mb-4 md:mb-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          {/* 月切り替え */}
          <div className="w-full sm:w-auto flex justify-center sm:justify-start">
            <MonthSwitcher
              value={currentMonth}
              onChange={handleMonthChange}
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
            className="h-7 sm:h-8 md:h-9 text-xs sm:text-sm"
          >
            <Settings className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">期間設定</span>
            <span className="sm:hidden">設定</span>
          </Button>

          {/* 店舗選択 */}
          <div className="w-full sm:w-[200px] md:w-[250px] flex-shrink-0">
            <StoreMultiSelect
              stores={stores}
              selectedStoreIds={selectedStoreIds}
              onStoreIdsChange={onStoreIdsChange}
              hideLabel
              placeholder="全店舗"
            />
          </div>
        </div>
      </div>

      {/* 期間設定パネル（トグル表示） */}
      {showPeriodSettings && (
        <Card className="mb-4 sm:mb-6 shadow-none border">
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
          onProductionCostClick={isFranchiseOnly ? () => {
            setEditingProductionCost(null)
            setIsProductionCostDialogOpen(true)
          } : undefined}
          onProductionCostEdit={isFranchiseOnly ? (item) => {
            setEditingProductionCost(item)
            setIsProductionCostDialogOpen(true)
          } : undefined}
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
        <Card className="shadow-none border">
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
          events={salesData?.eventList || []}
          availableStaffByScenario={modalData.availableStaffByScenario}
          allAvailableStaff={modalData.staff}
          onScenariosUpdate={async () => {
            // シナリオが更新されたらモーダルデータを再取得
            try {
              const scenariosData = await scenarioApi.getAll()
              setModalData(prev => prev ? { ...prev, scenarios: scenariosData } : null)
            } catch (error) {
              logger.error('シナリオデータ再取得エラー:', error)
            }
          }}
          onStaffUpdate={async () => {
            // スタッフが更新されたらモーダルデータを再取得
            try {
              const staffData = await staffApi.getAll()
              setModalData(prev => prev ? { ...prev, staff: staffData } : null)
            } catch (error) {
              logger.error('スタッフデータ再取得エラー:', error)
            }
          }}
          onParticipantChange={() => {
            // 参加者数が変更された場合はデータをリフレッシュ
            if (onDataRefresh) {
              onDataRefresh()
            }
          }}
        />
      )}

      {/* 制作費追加・編集ダイアログ（フランチャイズ用） */}
      {isFranchiseOnly && (
        <ProductionCostDialog
          isOpen={isProductionCostDialogOpen}
          onClose={() => {
            setIsProductionCostDialogOpen(false)
            setEditingProductionCost(null)
          }}
          onSave={() => {
            // 保存後にデータをリフレッシュ
            if (onDataRefresh) {
              onDataRefresh()
            }
          }}
          stores={stores}
          defaultStoreId={selectedStoreIds.length === 1 ? selectedStoreIds[0] : undefined}
          editingItem={editingProductionCost ? {
            id: editingProductionCost.id,
            date: editingProductionCost.date,
            category: editingProductionCost.category,
            amount: editingProductionCost.amount,
            store_id: editingProductionCost.store_id,
            scenario_id: editingProductionCost.scenario_id
          } : null}
        />
      )}
    </div>
  )
}
