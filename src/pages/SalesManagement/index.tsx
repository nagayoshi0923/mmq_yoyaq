import React, { useState, useEffect } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { useSessionState } from '@/hooks/useSessionState'
import SalesSidebar from '@/components/layout/SalesSidebar'
import AuthorReport from '../AuthorReport/index'
import { useSalesData } from './hooks/useSalesData'
import { SalesOverview } from './components/SalesOverview'
import { ScenarioPerformance } from './components/ScenarioPerformance'
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
      loadSalesData('thisMonth', selectedStore)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores.length])

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
            stores={stores}
            selectedPeriod={selectedPeriod}
            selectedStore={selectedStore}
            dateRange={dateRange}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onCustomStartDateChange={setCustomStartDate}
            onCustomEndDateChange={setCustomEndDate}
            onPeriodChange={(period) => loadSalesData(period, selectedStore)}
            onStoreChange={(store) => {
              setSelectedStore(store)
              loadSalesData(selectedPeriod, store)
            }}
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
      case 'author-report':
        return <AuthorReport />
      default:
    return (
          <SalesOverview
            salesData={salesData}
            loading={loading}
            stores={stores}
            selectedPeriod={selectedPeriod}
            selectedStore={selectedStore}
            dateRange={dateRange}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onCustomStartDateChange={setCustomStartDate}
            onCustomEndDateChange={setCustomEndDate}
            onPeriodChange={(period) => loadSalesData(period, selectedStore)}
            onStoreChange={(store) => {
              setSelectedStore(store)
              loadSalesData(selectedPeriod, store)
            }}
          />
        )
    }
  }

  return (
    <AppLayout
      currentPage="sales"
      sidebar={<SalesSidebar activeTab={activeTab} onTabChange={setActiveTab} />}
      maxWidth="max-w-[1600px]"
      containerPadding="px-8 py-6"
      stickyLayout={true}
    >
      {renderContent()}
    </AppLayout>
  )
}

export default SalesManagement
