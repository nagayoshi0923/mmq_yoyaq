import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StoreManagement } from './StoreManagement'
import { ScenarioManagement } from './ScenarioManagement'
import { StaffManagement } from './StaffManagement'
import { ScheduleManager } from './ScheduleManager'
import SalesManagement from './SalesManagement'
import { ShiftSubmission } from './ShiftSubmission'
import { ReservationManagement } from './ReservationManagement'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { 
  Store, 
  Calendar, 
  Users, 
  BookOpen, 
  TrendingUp, 
  Package, 
  CreditCard,
  Clock,
  Settings
} from 'lucide-react'

export function AdminDashboard() {
  const [currentPage, setCurrentPage] = useState(() => {
    // URLのハッシュから初期ページを決定
    const hash = window.location.hash.slice(1) // #を除去
    return hash || 'dashboard'
  })

  // ページ変更時にURLのハッシュを更新
  const handlePageChange = (pageId: string) => {
    setCurrentPage(pageId)
    window.location.hash = pageId === 'dashboard' ? '' : pageId
  }

  // ブラウザの戻る/進むボタンに対応
  React.useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      setCurrentPage(hash || 'dashboard')
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // モックデータ（後でSupabaseから取得）
  const stats = {
    stores: 6,
    performances: 42,
    reservations: 128,
    revenue: 1250000
  }

  const navigationTabs = [
    { id: 'stores', label: '店舗', icon: Store, color: 'bg-blue-100 text-blue-800' },
    { id: 'schedule', label: 'スケジュール', icon: Calendar, color: 'bg-green-100 text-green-800' },
    { id: 'staff', label: 'スタッフ', icon: Users, color: 'bg-purple-100 text-purple-800' },
    { id: 'scenarios', label: 'シナリオ', icon: BookOpen, color: 'bg-orange-100 text-orange-800' },
    { id: 'shift-submission', label: 'シフト提出', icon: Clock, color: 'bg-indigo-100 text-indigo-800' },
    { id: 'reservations', label: '予約', icon: Calendar, color: 'bg-red-100 text-red-800' },
    { id: 'customers', label: '顧客', icon: Users, color: 'bg-amber-100 text-amber-800' },
    { id: 'sales', label: '売上', icon: TrendingUp, color: 'bg-emerald-100 text-emerald-800' },
    { id: 'inventory', label: '在庫', icon: Package, color: 'bg-cyan-100 text-cyan-800' },
    { id: 'licenses', label: 'ライセンス', icon: CreditCard, color: 'bg-pink-100 text-pink-800' },
    { id: 'settings', label: '設定', icon: Settings, color: 'bg-gray-100 text-gray-800' }
  ]

  // ページ切り替え処理
  if (currentPage === 'stores') {
    return <StoreManagement />
  }
  
  if (currentPage === 'schedule') {
    return <ScheduleManager />
  }
  
  if (currentPage === 'scenarios') {
    return <ScenarioManagement />
  }
  
  if (currentPage === 'staff') {
    return <StaffManagement />
  }
  
  if (currentPage === 'sales') {
    return <SalesManagement />
  }
  
  if (currentPage === 'shift-submission') {
    return <ShiftSubmission />
  }
  
  if (currentPage === 'reservations') {
    return <ReservationManagement />
  }

  return (
    <div className="min-h-screen bg-background">
      <Header onPageChange={handlePageChange} />
      <NavigationBar currentPage={currentPage} onPageChange={handlePageChange} />

      <main className="container mx-auto max-w-7xl px-8 py-6">
        <div className="space-y-6">
          {/* 概要統計 */}
          <section>
            <h2>概要</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Store className="h-5 w-5 text-muted-foreground" />
                    店舗数
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.stores}</div>
                  <p className="text-muted-foreground">店舗運営中</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-muted-foreground" />
                    公演数
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.performances}</div>
                  <p className="text-muted-foreground">シナリオ登録済み</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    今月の予約
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.reservations}</div>
                  <p className="text-muted-foreground">件の予約</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-muted-foreground" />
                    今月の売上
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ¥{stats.revenue.toLocaleString()}
                  </div>
                  <p className="text-muted-foreground">前月比 +12%</p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ナビゲーションタブ */}
          <section>
            <h2>機能メニュー</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mt-4">
              {navigationTabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <Card 
                    key={tab.id} 
                    className="hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => handlePageChange(tab.id)}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2">
                        <Icon className="h-5 w-5" />
                        {tab.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Badge className={tab.color}>
                        {tab.id === 'stores' && '6店舗'}
                        {tab.id === 'schedule' && '今月128件'}
                        {tab.id === 'staff' && '15名'}
                        {tab.id === 'scenarios' && '42本'}
                        {tab.id === 'reservations' && '新規3件'}
                        {tab.id === 'customers' && '245名'}
                        {tab.id === 'sales' && '¥1.25M'}
                        {tab.id === 'inventory' && '在庫良好'}
                        {tab.id === 'licenses' && '契約中'}
                        {tab.id === 'settings' && '設定'}
                      </Badge>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>

          {/* 最近の活動 */}
          <section>
            <h2>最近の活動</h2>
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>システム活動ログ</CardTitle>
                <CardDescription>最新の予約・変更・キャンセル情報</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 border border-border rounded-md">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <div className="flex-1">
                      <p><strong>新規予約</strong> - 高田馬場店「人狼村の悲劇」</p>
                      <p className="text-muted-foreground">2024年12月25日 14:00-17:00 / 6名</p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-800">5分前</Badge>
                  </div>

                  <div className="flex items-center gap-3 p-3 border border-border rounded-md">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <div className="flex-1">
                      <p><strong>貸切予約</strong> - 別館②「密室の謎」</p>
                      <p className="text-muted-foreground">2024年12月26日 19:00-22:00 / 8名</p>
                    </div>
                    <Badge className="bg-purple-100 text-purple-800">15分前</Badge>
                  </div>

                  <div className="flex items-center gap-3 p-3 border border-border rounded-md">
                    <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                    <div className="flex-1">
                      <p><strong>GMテスト</strong> - 大久保店「新シナリオ検証」</p>
                      <p className="text-muted-foreground">2024年12月24日 10:00-13:00 / スタッフ4名</p>
                    </div>
                    <Badge className="bg-orange-100 text-orange-800">1時間前</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </div>
  )
}
