import React, { useEffect, lazy, Suspense } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { useSessionState } from '@/hooks/useSessionState'
import { UnifiedSidebar, SidebarMenuItem } from '@/components/layout/UnifiedSidebar'
import { TrendingUp, BarChart, BarChart3, FileText, Store, ShoppingBag, Users } from 'lucide-react'

// サイドバーのメニュー項目定義
const SALES_MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'sales-overview', label: '売上概要', icon: TrendingUp, description: '売上サマリーを表示' },
  { id: 'annual-analysis', label: '年間分析', icon: BarChart3, description: '年間推移・成長率' },
  { id: 'scenario-performance', label: 'シナリオ別', icon: BarChart, description: 'シナリオ別売上' },
  { id: 'external-sales', label: '外部売上', icon: ShoppingBag, description: 'BOOTH・他店公演' },
  { id: 'misc-transactions', label: '雑収支管理', icon: FileText, description: '公演外の収支を管理' },
  { id: 'franchise-sales', label: 'フランチャイズ', icon: Store, description: 'FC店舗の売上' },
  { id: 'staff-salary-report', label: 'スタッフ報酬', icon: Users, description: 'スタッフ別報酬レポート' },
  { id: 'salary-calculation', label: '給与計算', icon: FileText, description: 'スタッフ給与計算' }
]
// 作者レポートはライセンス管理に移動
import { useSalesData } from './hooks/useSalesData'

// chart.jsを使うコンポーネントは遅延ロード（初期バンドルサイズ削減）
const SalesOverview = lazy(() => import('./components/SalesOverview').then(m => ({ default: m.SalesOverview })))
const AnnualAnalysis = lazy(() => import('./components/AnnualAnalysis').then(m => ({ default: m.AnnualAnalysis })))
const ScenarioPerformance = lazy(() => import('./components/ScenarioPerformance').then(m => ({ default: m.ScenarioPerformance })))
const MiscellaneousTransactions = lazy(() => import('./components/MiscellaneousTransactions').then(m => ({ default: m.MiscellaneousTransactions })))
const ExternalSales = lazy(() => import('./components/ExternalSales').then(m => ({ default: m.ExternalSales })))
const StaffSalaryReport = lazy(() => import('./components/StaffSalaryReport').then(m => ({ default: m.StaffSalaryReport })))
const SalaryCalculation = lazy(() => import('../SalaryCalculation/index'))

/**
 * 売上管理メインページ
 */
const SalesManagement: React.FC = () => {
  // タブ状態管理
  const [activeTab, setActiveTab] = useSessionState('salesActiveTab', 'overview')
  const [selectedStoreIds, setSelectedStoreIds] = useSessionState<string[]>('salesSelectedStoreIds', [])
  
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

  // タブ切り替え時のスクロール復元
  useEffect(() => {
    const savedPosition = sessionStorage.getItem(`sales-scroll-${activeTab}`)
    if (savedPosition) {
      window.scrollTo(0, parseInt(savedPosition))
    }

    const handleScroll = () => {
      sessionStorage.setItem(`sales-scroll-${activeTab}`, window.scrollY.toString())
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [activeTab])

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
      sidebar={
        <UnifiedSidebar
          title="売上管理"
          mode="list"
          menuItems={SALES_MENU_ITEMS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      }
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <Suspense fallback={<div className="flex items-center justify-center h-40 text-muted-foreground text-sm">読み込み中...</div>}>
        {renderContent()}
      </Suspense>
    </AppLayout>
  )
}

export default SalesManagement
