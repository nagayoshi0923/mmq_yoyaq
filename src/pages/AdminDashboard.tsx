import React from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Store, 
  Calendar, 
  Users, 
  BookOpen, 
  TrendingUp, 
  Package, 
  CreditCard,
  Settings,
  LogOut,
  Bell
} from 'lucide-react'

export function AdminDashboard() {
  const { user, signOut } = useAuth()

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  // モックデータ（後でSupabaseから取得）
  const stats = {
    stores: 6,
    performances: 42,
    reservations: 128,
    revenue: 1250000
  }

  const navigationTabs = [
    { id: 'stores', label: '店舗管理', icon: Store, color: 'bg-blue-100 text-blue-800' },
    { id: 'schedule', label: 'スケジュール', icon: Calendar, color: 'bg-green-100 text-green-800' },
    { id: 'staff', label: 'スタッフ管理', icon: Users, color: 'bg-purple-100 text-purple-800' },
    { id: 'scenarios', label: 'シナリオ管理', icon: BookOpen, color: 'bg-orange-100 text-orange-800' },
    { id: 'reservations', label: '予約管理', icon: Calendar, color: 'bg-red-100 text-red-800' },
    { id: 'customers', label: '顧客管理', icon: Users, color: 'bg-amber-100 text-amber-800' },
    { id: 'sales', label: '売上管理', icon: TrendingUp, color: 'bg-emerald-100 text-emerald-800' },
    { id: 'inventory', label: '在庫管理', icon: Package, color: 'bg-cyan-100 text-cyan-800' },
    { id: 'licenses', label: 'ライセンス', icon: CreditCard, color: 'bg-pink-100 text-pink-800' },
    { id: 'settings', label: '設定', icon: Settings, color: 'bg-gray-100 text-gray-800' }
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1>Queens Waltz 管理システム</h1>
              <p className="text-muted-foreground">マーダーミステリー店舗管理</p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <Badge className={
                  user?.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                  user?.role === 'staff' ? 'bg-green-100 text-green-800' :
                  'bg-purple-100 text-purple-800'
                }>
                  {user?.role === 'admin' ? '管理者' : 
                   user?.role === 'staff' ? 'スタッフ' : '顧客'}
                </Badge>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
              <Button variant="ghost" size="icon">
                <Bell className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                ログアウト
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* 概要統計 */}
          <section>
            <h2>概要</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              <Card className="bg-blue-50 border-blue-200">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Store className="h-5 w-5 text-blue-600" />
                    店舗数
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-800">{stats.stores}</div>
                  <p className="text-blue-600">店舗運営中</p>
                </CardContent>
              </Card>

              <Card className="bg-green-50 border-green-200">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-green-600" />
                    公演数
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-800">{stats.performances}</div>
                  <p className="text-green-600">シナリオ登録済み</p>
                </CardContent>
              </Card>

              <Card className="bg-purple-50 border-purple-200">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-purple-600" />
                    今月の予約
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-800">{stats.reservations}</div>
                  <p className="text-purple-600">件の予約</p>
                </CardContent>
              </Card>

              <Card className="bg-orange-50 border-orange-200">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-orange-600" />
                    今月の売上
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-800">
                    ¥{stats.revenue.toLocaleString()}
                  </div>
                  <p className="text-orange-600">前月比 +12%</p>
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
                  <div className="flex items-center gap-3 p-3 bg-blue-50 border-blue-200 rounded-md">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <div className="flex-1">
                      <p><strong>新規予約</strong> - 高田馬場店「人狼村の悲劇」</p>
                      <p className="text-muted-foreground">2024年12月25日 14:00-17:00 / 6名</p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-800">5分前</Badge>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-purple-50 border-purple-200 rounded-md">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <div className="flex-1">
                      <p><strong>貸切予約</strong> - 別館②「密室の謎」</p>
                      <p className="text-muted-foreground">2024年12月26日 19:00-22:00 / 8名</p>
                    </div>
                    <Badge className="bg-purple-100 text-purple-800">15分前</Badge>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-orange-50 border-orange-200 rounded-md">
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
