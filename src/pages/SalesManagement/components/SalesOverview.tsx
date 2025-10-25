import React, { useState, useEffect } from 'react'
import { SalesData } from '@/types'
import { SummaryCards } from './SummaryCards'
import { EventListCard } from './EventListCard'
import { SalesChart } from './SalesChart'
import { ExportButtons } from './ExportButtons'
import { PerformanceModal } from '@/components/schedule/PerformanceModal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { scenarioApi, staffApi, storeApi, scheduleApi } from '@/lib/api'
import type { Staff, Scenario, Store } from '@/types'

interface StoreInfo {
  id: string
  name: string
  short_name: string
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
  onDataRefresh
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">売上管理</h1>
        </div>
        <Card>
          <CardContent className="p-8">
            <div className="text-center text-muted-foreground">読み込み中...</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div>
      {/* ヘッダー：タイトルとエクスポートボタン */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">売上管理</h1>
        <ExportButtons salesData={salesData} />
      </div>

      {/* フィルター */}
      <div className="space-y-4 mb-6">
        <div className="flex gap-4">
          <div className="flex-1">
            <Label>期間</Label>
            <Select value={selectedPeriod} onValueChange={onPeriodChange}>
              <SelectTrigger>
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

          <div className="flex-1">
            <Label>店舗</Label>
            <Select value={selectedStore} onValueChange={onStoreChange}>
              <SelectTrigger>
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

        {/* カスタム期間選択UI */}
        {selectedPeriod === 'custom' && (
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label>開始日</Label>
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => onCustomStartDateChange(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Label>終了日</Label>
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => onCustomEndDateChange(e.target.value)}
              />
            </div>
            <Button
              onClick={() => onPeriodChange('custom')}
              disabled={!customStartDate || !customEndDate}
            >
              適用
            </Button>
          </div>
        )}
      </div>

      {/* サマリーカード */}
      {salesData ? (
        <>
          <div className="mb-6">
        <SummaryCards
          totalRevenue={salesData.totalRevenue}
          averageRevenue={salesData.averageRevenuePerEvent}
          totalEvents={salesData.totalEvents}
          storeCount={salesData.storeRanking.length}
          totalLicenseCost={salesData.totalLicenseCost}
          totalGmCost={salesData.totalGmCost}
          netProfit={salesData.netProfit}
        />
          </div>

          {/* 実施公演リスト */}
          <div className="mb-6">
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
          <CardContent className="p-8">
            <div className="text-center text-muted-foreground">
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
