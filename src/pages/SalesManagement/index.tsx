import React, { useState, useEffect } from 'react'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { useSessionState } from '@/hooks/useSessionState'
import SalesSidebar from '@/components/layout/SalesSidebar'
import AuthorReport from '../AuthorReport'
import { useSalesData } from './hooks/useSalesData'
import { SalesOverview } from './components/SalesOverview'
import { ScenarioPerformance } from './components/ScenarioPerformance'

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
    loadSalesData
  } = useSalesData()

  // 初回ロード
  useEffect(() => {
    loadSalesData('thisMonth', 'all')
  }, [loadSalesData])

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
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="sales" />
      <SalesSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="ml-64 min-h-screen">
        <div className="container mx-auto max-w-7xl px-8 py-6">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}

export default SalesManagement
