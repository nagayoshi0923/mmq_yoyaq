import React, { useEffect, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { useLocalState } from '@/hooks/useLocalState'
import { useSalesData } from './hooks/useSalesData'

// chart.jsを使うコンポーネントは遅延ロード（初期バンドルサイズ削減）
const SalesOverview = lazy(() => import('./components/SalesOverview').then(m => ({ default: m.SalesOverview })))
const AnnualAnalysis = lazy(() => import('./components/AnnualAnalysis').then(m => ({ default: m.AnnualAnalysis })))
const ScenarioPerformance = lazy(() => import('./components/ScenarioPerformance').then(m => ({ default: m.ScenarioPerformance })))
const MiscellaneousTransactions = lazy(() => import('./components/MiscellaneousTransactions').then(m => ({ default: m.MiscellaneousTransactions })))
const ExternalSales = lazy(() => import('./components/ExternalSales').then(m => ({ default: m.ExternalSales })))
const StaffSalaryReport = lazy(() => import('./components/StaffSalaryReport').then(m => ({ default: m.StaffSalaryReport })))
const SalaryCalculation = lazy(() => import('../SalaryCalculation/index'))
const OpenEventAnalysis = lazy(() => import('./components/OpenEventAnalysis').then(m => ({ default: m.OpenEventAnalysis })))

/**
 * 売上管理メインページ
 */
const SalesManagement: React.FC = () => {
  const [searchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'overview'
  const [selectedStoreIds, setSelectedStoreIds] = useLocalState<string[]>('salesSelectedStoreIds', [])
  
  // データ取得フック
  const {
    salesData,
    loading,
    stores,
    dateRange,
    selectedPeriod,
    customStartDate,
    customEndDate,
    setCustomStartDate,
    setCustomEndDate,
    loadSalesData
  } = useSalesData()

  // 店舗データ取得後にデータをロード（保存された期間設定を使用）
  useEffect(() => {
    if (stores.length > 0) {
      // タブに応じて店舗タイプでフィルター
      let ownershipFilter: 'corporate' | 'franchise' | undefined
      if (activeTab === 'franchise-sales') {
        ownershipFilter = 'franchise'
      } else if (activeTab === 'overview') {
        ownershipFilter = 'corporate'
      }
      // 保存された期間設定を使用（selectedPeriodはlocalStorageから復元済み）
      loadSalesData(selectedPeriod, selectedStoreIds, ownershipFilter)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores.length, activeTab])

  // カスタム期間が変更されたらデータを再取得
  useEffect(() => {
    if (selectedPeriod !== 'custom') return
    if (!customStartDate || !customEndDate) return
    if (stores.length === 0) return

    let ownershipFilter: 'corporate' | 'franchise' | undefined
    if (activeTab === 'franchise-sales') {
      ownershipFilter = 'franchise'
    } else if (activeTab === 'overview') {
      ownershipFilter = 'corporate'
    }

    loadSalesData('custom', selectedStoreIds, ownershipFilter)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customStartDate, customEndDate, selectedPeriod, activeTab, stores.length])

  // コンテンツの条件分岐表示
  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
    return (
          <SalesOverview
            salesData={salesData}
            loading={loading}
            stores={stores.filter(s => s.ownership_type !== 'franchise')}
            selectedPeriod={selectedPeriod}
            selectedStoreIds={selectedStoreIds}
            dateRange={dateRange}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onCustomStartDateChange={setCustomStartDate}
            onCustomEndDateChange={setCustomEndDate}
            onPeriodChange={(period) => loadSalesData(period, selectedStoreIds, 'corporate')}
            onStoreIdsChange={(storeIds) => {
              setSelectedStoreIds(storeIds)
              loadSalesData(selectedPeriod, storeIds, 'corporate')
            }}
            onDataRefresh={() => loadSalesData(selectedPeriod, selectedStoreIds, 'corporate')}
          />
        )
      case 'annual-analysis':
        return <AnnualAnalysis stores={stores} selectedStoreIds={selectedStoreIds} />
      case 'scenario-performance':
                return (
          <ScenarioPerformance
            stores={stores}
            selectedStoreIds={selectedStoreIds}
            onStoreIdsChange={(storeIds) => {
              setSelectedStoreIds(storeIds)
              loadSalesData(selectedPeriod, storeIds)
            }}
          />
        )
      case 'open-event-analysis':
        return (
          <OpenEventAnalysis
            stores={stores}
            selectedStoreIds={selectedStoreIds}
            onStoreIdsChange={(storeIds) => {
              setSelectedStoreIds(storeIds)
            }}
          />
        )
      case 'external-sales':
        return <ExternalSales />
      case 'misc-transactions':
        return (
          <MiscellaneousTransactions
            stores={stores}
          />
        )
      case 'franchise-sales':
                return (
          <SalesOverview
            salesData={salesData}
            loading={loading}
            stores={stores.filter(s => s.ownership_type === 'franchise')}
            selectedPeriod={selectedPeriod}
            selectedStoreIds={selectedStoreIds}
            dateRange={dateRange}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onCustomStartDateChange={setCustomStartDate}
            onCustomEndDateChange={setCustomEndDate}
            onPeriodChange={(period) => loadSalesData(period, selectedStoreIds, 'franchise')}
            onStoreIdsChange={(storeIds) => {
              setSelectedStoreIds(storeIds)
              loadSalesData(selectedPeriod, storeIds, 'franchise')
            }}
            onDataRefresh={() => loadSalesData(selectedPeriod, selectedStoreIds, 'franchise')}
            isFranchiseOnly={true}
          />
        )
      case 'staff-salary-report':
        return <StaffSalaryReport />
      case 'salary-calculation':
        return <SalaryCalculation />
      default:
    return (
          <SalesOverview
            salesData={salesData}
            loading={loading}
            stores={stores.filter(s => s.ownership_type !== 'franchise')}
            selectedPeriod={selectedPeriod}
            selectedStoreIds={selectedStoreIds}
            dateRange={dateRange}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onCustomStartDateChange={setCustomStartDate}
            onCustomEndDateChange={setCustomEndDate}
            onPeriodChange={(period) => loadSalesData(period, selectedStoreIds, 'corporate')}
            onStoreIdsChange={(storeIds) => {
              setSelectedStoreIds(storeIds)
              loadSalesData(selectedPeriod, storeIds, 'corporate')
            }}
            onDataRefresh={() => loadSalesData(selectedPeriod, selectedStoreIds, 'corporate')}
          />
        )
    }
  }

  return (
    <AppLayout
      currentPage="sales"
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <PageHeader
        title={<><TrendingUp className="h-5 w-5" />売上管理</>}
        description="売上集計・年次分析・スタッフ給与レポート"
      />
      <Suspense fallback={<div className="flex items-center justify-center h-40 text-muted-foreground text-sm">読み込み中...</div>}>
        {renderContent()}
      </Suspense>
    </AppLayout>
  )
}

export default SalesManagement
