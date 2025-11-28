import React, { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Store, 
  Calendar, 
  Users, 
  BookOpen, 
  TrendingUp,
  Clock,
  Settings,
  UserCog
} from 'lucide-react'

interface DashboardHomeProps {
  onPageChange: (pageId: string) => void
}

export function DashboardHome({ onPageChange }: DashboardHomeProps) {
  // 統計情報を遅延ロード（ダッシュボード表示をブロックしない）
  const [stats, setStats] = useState({
    stores: 0,
    performances: 0,
    reservations: 0,
    revenue: 0
  })

  // ダッシュボード表示時のみ統計を取得
  useEffect(() => {
    // モックデータ（後でSupabaseから取得）
    setTimeout(() => {
      setStats({
        stores: 6,
        performances: 42,
        reservations: 128,
        revenue: 1250000
      })
    }, 100) // 少し遅延させてUIを優先
  }, [])

  // 最適化: navigationTabsをuseMemoでメモ化（毎回新しい配列が生成されるのを防ぐ）
  const navigationTabs = useMemo(() => [
    { id: 'stores', label: '店舗', icon: Store, color: 'bg-blue-100 text-blue-800' },
    { id: 'schedule', label: 'スケジュール', icon: Calendar, color: 'bg-green-100 text-green-800' },
    { id: 'staff', label: 'スタッフ', icon: Users, color: 'bg-purple-100 text-purple-800' },
    { id: 'scenarios', label: 'シナリオ', icon: BookOpen, color: 'bg-orange-100 text-orange-800' },
    { id: 'shift-submission', label: 'シフト提出', icon: Clock, color: 'bg-indigo-100 text-indigo-800' },
    { id: 'customer-booking', label: '予約サイト', icon: Calendar, color: 'bg-teal-100 text-teal-800' },
    { id: 'reservations', label: '予約管理', icon: Calendar, color: 'bg-red-100 text-red-800' },
    { id: 'customers', label: '顧客', icon: Users, color: 'bg-amber-100 text-amber-800' },
    { id: 'user-management', label: 'ユーザー', icon: UserCog, color: 'bg-violet-100 text-violet-800' },
    { id: 'sales', label: '売上', icon: TrendingUp, color: 'bg-emerald-100 text-emerald-800' },
    { id: 'settings', label: '設定', icon: Settings, color: 'bg-gray-100 text-gray-800' }
  ], [])

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      {/* 概要統計 */}
      <section>
        <h2>概要</h2>
        <div className="grid grid-cols-2 gap-2 xs:gap-2.5 sm:gap-3 md:gap-4 mt-2 xs:mt-3 sm:mt-4">
          <Card>
            <CardHeader className="pb-1.5 xs:pb-2 sm:pb-3 p-2 xs:p-3 sm:p-4 md:p-6">
              <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-base">
                <Store className="h-3.5 w-3.5 xs:h-4 xs:w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                <span className="truncate">店舗数</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 xs:p-3 sm:p-4 md:p-6 pt-1">
              <div className="text-lg">{stats.stores}</div>
              <p className="text-muted-foreground text-xs">店舗運営中</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1.5 xs:pb-2 sm:pb-3 p-2 xs:p-3 sm:p-4 md:p-6">
              <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-base">
                <BookOpen className="h-3.5 w-3.5 xs:h-4 xs:w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                <span className="truncate">公演数</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 xs:p-3 sm:p-4 md:p-6 pt-1">
              <div className="text-lg">{stats.performances}</div>
              <p className="text-muted-foreground text-xs">シナリオ登録済み</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1.5 xs:pb-2 sm:pb-3 p-2 xs:p-3 sm:p-4 md:p-6">
              <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-base">
                <Calendar className="h-3.5 w-3.5 xs:h-4 xs:w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                <span className="truncate">今月の予約</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 xs:p-3 sm:p-4 md:p-6 pt-1">
              <div className="text-lg">{stats.reservations}</div>
              <p className="text-muted-foreground text-xs">件の予約</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1.5 xs:pb-2 sm:pb-3 p-2 xs:p-3 sm:p-4 md:p-6">
              <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-base">
                <TrendingUp className="h-3.5 w-3.5 xs:h-4 xs:w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                <span className="truncate">今月の売上</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 xs:p-3 sm:p-4 md:p-6 pt-1">
              <div className="text-lg">
                ¥{stats.revenue.toLocaleString()}
              </div>
              <p className="text-muted-foreground text-xs">前月比 +12%</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ナビゲーションタブ */}
      <section>
        <h2>機能メニュー</h2>
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 md:gap-4 mt-3 sm:mt-4">
          {navigationTabs.map((tab) => {
            const Icon = tab.icon
            return (
              <Card 
                key={tab.id} 
                className="hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => onPageChange(tab.id)}
              >
                <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-4 md:p-6">
                  <CardTitle className="flex items-center gap-1 sm:gap-2 text-base">
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span className="truncate">{tab.label}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
                  <Badge className={`${tab.color} text-xs sm:text-sm`}>
                    {tab.id === 'stores' && '6店舗'}
                    {tab.id === 'schedule' && '今月128件'}
                    {tab.id === 'staff' && '15名'}
                    {tab.id === 'scenarios' && '42本'}
                    {tab.id === 'reservations' && '新規3件'}
                    {tab.id === 'customers' && '245名'}
                    {tab.id === 'user-management' && 'ロール管理'}
                    {tab.id === 'sales' && '¥1.25M'}
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
        <Card className="mt-3 sm:mt-4">
          <CardHeader className="p-3 sm:p-4 md:p-6">
            <CardTitle>システム活動ログ</CardTitle>
            <CardDescription className="text-xs sm:text-sm">最新の予約・変更・キャンセル情報</CardDescription>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 md:p-6">
            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 border border-border rounded-md">
                <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm"><strong>新規予約</strong> - 高田馬場店「人狼村の悲劇」</p>
                  <p className="text-muted-foreground text-xs">2024年12月25日 14:00-17:00 / 6名</p>
                </div>
                <Badge className="bg-blue-100 text-blue-800 text-xs flex-shrink-0">5分前</Badge>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 border border-border rounded-md">
                <div className="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm"><strong>貸切予約</strong> - 別館②「密室の謎」</p>
                  <p className="text-muted-foreground text-xs">2024年12月26日 19:00-22:00 / 8名</p>
                </div>
                <Badge className="bg-purple-100 text-purple-800 text-xs flex-shrink-0">15分前</Badge>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 border border-border rounded-md">
                <div className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm"><strong>GMテスト</strong> - 大久保店「新シナリオ検証」</p>
                  <p className="text-muted-foreground text-xs">2024年12月24日 10:00-13:00 / スタッフ4名</p>
                </div>
                <Badge className="bg-orange-100 text-orange-800 text-xs flex-shrink-0">1時間前</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

