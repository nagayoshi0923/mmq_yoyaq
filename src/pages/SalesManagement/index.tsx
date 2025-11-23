import React, { useState, useEffect } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { useSessionState } from '@/hooks/useSessionState'
import { UnifiedSidebar, SidebarMenuItem } from '@/components/layout/UnifiedSidebar'
import { TrendingUp, BarChart, FileText, Store } from 'lucide-react'

// サイドバーのメニュー項目定義
const SALES_MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'sales-overview', label: '売上概要', icon: TrendingUp, description: '売上サマリーを表示' },
  { id: 'scenario-performance', label: 'シナリオ別', icon: BarChart, description: 'シナリオ別売上' },
  { id: 'misc-transactions', label: '雑収支管理', icon: FileText, description: '公演外の収支を管理' },
  { id: 'franchise-sales', label: 'フランチャイズ', icon: Store, description: 'FC店舗の売上' },
  { id: 'author-report', label: '作者別レポート', icon: FileText, description: '作者別売上レポート' },
  { id: 'salary-calculation', label: '給与計算', icon: FileText, description: 'スタッフ給与計算' }
]
import AuthorReport from '../AuthorReport/index'
import SalaryCalculation from '../SalaryCalculation/index'
import { useSalesData } from './hooks/useSalesData'
import { SalesOverview } from './components/SalesOverview'
import { ScenarioPerformance } from './components/ScenarioPerformance'
import { MiscellaneousTransactions } from './components/MiscellaneousTransactions'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

/**
 * 売上管理メインページ
 */
const SalesManagement: React.FC = () => {
  // タブ状態管理
  const [activeTab, setActiveTab] = useSessionState('salesActiveTab', 'overview')
  const [selectedStore, setSelectedStore] = useSessionState('salesSelectedStore', 'all')
  
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

  // 店舗データ取得後にデータをロード
  useEffect(() => {
    if (stores.length > 0) {
      // タブに応じて店舗タイプでフィルター
      let ownershipFilter: 'corporate' | 'franchise' | undefined
      if (activeTab === 'franchise-sales') {
        ownershipFilter = 'franchise'
      } else if (activeTab === 'overview') {
        ownershipFilter = 'corporate'
      }
      loadSalesData('thisMonth', selectedStore, ownershipFilter)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores.length, activeTab])

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
            selectedStore={selectedStore}
            dateRange={dateRange}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onCustomStartDateChange={setCustomStartDate}
            onCustomEndDateChange={setCustomEndDate}
            onPeriodChange={(period) => loadSalesData(period, selectedStore, 'corporate')}
            onStoreChange={(store) => {
              setSelectedStore(store)
              loadSalesData(selectedPeriod, store, 'corporate')
            }}
            onDataRefresh={() => loadSalesData(selectedPeriod, selectedStore, 'corporate')}
          />
        )
      case 'scenario-performance':
                return (
          <ScenarioPerformance
            stores={stores}
            selectedStore={selectedStore}
            onStoreChange={(store) => {
              setSelectedStore(store)
              loadSalesData(selectedPeriod, store)
            }}
          />
        )
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
            selectedStore={selectedStore}
            dateRange={dateRange}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onCustomStartDateChange={setCustomStartDate}
            onCustomEndDateChange={setCustomEndDate}
            onPeriodChange={(period) => loadSalesData(period, selectedStore, 'franchise')}
            onStoreChange={(store) => {
              setSelectedStore(store)
              loadSalesData(selectedPeriod, store, 'franchise')
            }}
            onDataRefresh={() => loadSalesData(selectedPeriod, selectedStore, 'franchise')}
            isFranchiseOnly={true}
          />
        )
      case 'author-report':
        return <AuthorReport />
      case 'salary-calculation':
        return <SalaryCalculation />
      default:
    return (
          <SalesOverview
            salesData={salesData}
            loading={loading}
            stores={stores.filter(s => s.ownership_type !== 'franchise')}
            selectedPeriod={selectedPeriod}
            selectedStore={selectedStore}
            dateRange={dateRange}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onCustomStartDateChange={setCustomStartDate}
            onCustomEndDateChange={setCustomEndDate}
            onPeriodChange={(period) => loadSalesData(period, selectedStore, 'corporate')}
            onStoreChange={(store) => {
              setSelectedStore(store)
              loadSalesData(selectedPeriod, store, 'corporate')
            }}
            onDataRefresh={() => loadSalesData(selectedPeriod, selectedStore, 'corporate')}
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
      maxWidth="max-w-[1600px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      {renderContent()}
    </AppLayout>
  )
}

export default SalesManagement
