import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AppLayout } from '@/components/layout/AppLayout'
import { UnifiedSidebar, SidebarMenuItem } from '@/components/layout/UnifiedSidebar'
import { Users, UserPlus, Shield, Settings, AlertCircle, Search, UserCog, User as UserIcon } from 'lucide-react'

// サイドバーのメニュー項目定義
const USER_MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'user-list', label: 'ユーザー一覧', icon: Users, description: 'すべてのユーザーを表示' },
  { id: 'new-user', label: '新規登録', icon: UserPlus, description: '新しいユーザーを追加' },
  { id: 'roles', label: 'ロール管理', icon: Shield, description: 'ユーザーロール設定' },
  { id: 'settings', label: '設定', icon: Settings, description: '表示設定' }
]
import { searchUserByEmail, getAllUsers, updateUserRole, type User } from '@/lib/userApi'
import { logger } from '@/utils/logger'

export function UserManagement() {
  const { user } = useAuth()
  const [searchEmail, setSearchEmail] = useState('')
  const [searchResult, setSearchResult] = useState<User | null>(null)
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showAllUsers, setShowAllUsers] = useState(false)
  const [activeTab, setActiveTab] = useState('user-list')

  // 管理者チェック
  if (!user || user.role !== 'admin') {
    return (
      <AppLayout
        currentPage="user-management"
        sidebar={
          <UnifiedSidebar
            title="ユーザー管理"
            mode="list"
            menuItems={USER_MENU_ITEMS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        }
        stickyLayout={true}
      >
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-red-800">
              <AlertCircle className="w-6 h-6" />
              <p className="font-medium">この機能は管理者のみ利用可能です。</p>
            </div>
          </CardContent>
        </Card>
      </AppLayout>
    )
  }

  // 全ユーザーを取得
  const loadAllUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const users = await getAllUsers()
      setAllUsers(users)
      setShowAllUsers(true)
    } catch (err: any) {
      logger.error('ユーザー一覧取得エラー:', err)
      setError('ユーザー一覧の取得に失敗しました: ' + (err.message || ''))
    } finally {
      setLoading(false)
    }
  }

  // メールアドレスで検索
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!searchEmail.trim()) {
      setError('メールアドレスを入力してください')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')
    setSearchResult(null)

    try {
      const result = await searchUserByEmail(searchEmail.trim())
      
      if (result) {
        setSearchResult(result)
        setMessage('ユーザーが見つかりました')
      } else {
        setError('該当するユーザーが見つかりませんでした')
      }
    } catch (err: any) {
      logger.error('ユーザー検索エラー:', err)
      setError('検索中にエラーが発生しました: ' + (err.message || ''))
    } finally {
      setLoading(false)
    }
  }

  // ロールを更新
  const handleRoleUpdate = async (userId: string, newRole: 'admin' | 'staff' | 'customer') => {
    setLoading(true)
    setError('')
    setMessage('')

    try {
      await updateUserRole(userId, newRole)
      setMessage(`ロールを ${newRole} に更新しました`)
      
      // 検索結果を更新
      if (searchResult && searchResult.id === userId) {
        setSearchResult({ ...searchResult, role: newRole })
      }

      // 全ユーザー一覧を表示中の場合は再読み込み
      if (showAllUsers) {
        await loadAllUsers()
      }
    } catch (err: any) {
      logger.error('ロール更新エラー:', err)
      setError('ロールの更新に失敗しました: ' + (err.message || ''))
    } finally {
      setLoading(false)
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="w-4 h-4 text-red-600" />
      case 'staff':
        return <UserCog className="w-4 h-4 text-blue-600" />
      case 'customer':
        return <UserIcon className="w-4 h-4 text-gray-600" />
      default:
        return <UserIcon className="w-4 h-4 text-gray-400" />
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'staff':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'customer':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200'
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return '管理者'
      case 'staff':
        return 'スタッフ'
      case 'customer':
        return '顧客'
      default:
        return role
    }
  }

  // ユーザーカードコンポーネント
  const UserCard = ({ userData }: { userData: User }) => (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getRoleIcon(userData.role)}
          {userData.email}
        </CardTitle>
        <CardDescription>
          ユーザーID: {userData.id}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-2">現在のロール</p>
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${getRoleBadgeColor(userData.role)}`}>
              {getRoleIcon(userData.role)}
              {getRoleLabel(userData.role)}
            </span>
          </div>

          <div>
            <p className="text-sm text-gray-600 mb-3">ロールを変更</p>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={userData.role === 'admin' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleRoleUpdate(userData.id, 'admin')}
                disabled={loading || userData.role === 'admin'}
                className="flex items-center gap-1"
              >
                <Shield className="w-4 h-4" />
                管理者
              </Button>
              <Button
                variant={userData.role === 'staff' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleRoleUpdate(userData.id, 'staff')}
                disabled={loading || userData.role === 'staff'}
                className="flex items-center gap-1"
              >
                <UserCog className="w-4 h-4" />
                スタッフ
              </Button>
              <Button
                variant={userData.role === 'customer' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleRoleUpdate(userData.id, 'customer')}
                disabled={loading || userData.role === 'customer'}
                className="flex items-center gap-1"
              >
                <UserIcon className="w-4 h-4" />
                顧客
              </Button>
            </div>
          </div>

          <div className="pt-4 border-t text-xs text-gray-500">
            <p>作成日: {new Date(userData.created_at).toLocaleString('ja-JP')}</p>
            <p>更新日: {new Date(userData.updated_at).toLocaleString('ja-JP')}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <AppLayout
      currentPage="user-management"
      sidebar={
        <UnifiedSidebar
          title="ユーザー管理"
          mode="list"
          menuItems={USER_MENU_ITEMS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      }
      maxWidth="max-w-[1600px]"
      containerPadding="p-6"
      stickyLayout={true}
    >
      <div className="space-y-6">
        <div></div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            メールアドレスで検索
          </CardTitle>
          <CardDescription>
            ユーザーのメールアドレスを入力して検索してください
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex gap-2">
              <input
                type="email"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                placeholder="user@example.com"
                className="flex-1 px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={loading}
              />
              <Button type="submit" disabled={loading}>
                {loading ? '検索中...' : '検索'}
              </Button>
            </div>
          </form>

          <div className="mt-4 pt-4 border-t">
            <Button
              variant="outline"
              onClick={loadAllUsers}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" />
              {showAllUsers ? '全ユーザーを再読み込み' : '全ユーザーを表示'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* エラーメッセージ */}
      {error && (
        <Card className="mt-4 border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3 text-red-800">
              <AlertCircle className="w-5 h-5 mt-0.5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 成功メッセージ */}
      {message && (
        <Card className="mt-4 border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <p className="text-green-800">{message}</p>
          </CardContent>
        </Card>
      )}

      {/* 検索結果 */}
      {searchResult && <UserCard userData={searchResult} />}

      {/* 全ユーザー一覧 */}
      {showAllUsers && allUsers.length > 0 && (
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                全ユーザー ({allUsers.length}人)
              </CardTitle>
              <CardDescription>
                システムに登録されている全てのユーザー
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {allUsers.map((userData) => (
                  <div key={userData.id} className="border rounded-lg p-4 hover:bg-gray-50 transition">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getRoleIcon(userData.role)}
                          <p className="font-medium truncate">{userData.email}</p>
                        </div>
                        <p className="text-xs text-gray-500 truncate">ID: {userData.id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${getRoleBadgeColor(userData.role)}`}>
                          {getRoleLabel(userData.role)}
                        </span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRoleUpdate(userData.id, 'admin')}
                            disabled={loading || userData.role === 'admin'}
                            className="h-8 w-8 p-0"
                            title="管理者に変更"
                          >
                            <Shield className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRoleUpdate(userData.id, 'staff')}
                            disabled={loading || userData.role === 'staff'}
                            className="h-8 w-8 p-0"
                            title="スタッフに変更"
                          >
                            <UserCog className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRoleUpdate(userData.id, 'customer')}
                            disabled={loading || userData.role === 'customer'}
                            className="h-8 w-8 p-0"
                            title="顧客に変更"
                          >
                            <UserIcon className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 全ユーザー表示時で0件の場合 */}
      {showAllUsers && allUsers.length === 0 && (
        <Card className="mt-8 border-gray-200 bg-gray-50">
          <CardContent className="pt-6">
            <p className="text-gray-600 text-center">登録されているユーザーがいません</p>
          </CardContent>
        </Card>
      )}

      {/* 使い方の説明 */}
      <Card className="mt-8 bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">使い方</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-800 space-y-2">
          <p>1. 上部の検索ボックスにメールアドレスを入力して検索</p>
          <p>2. または「全ユーザーを表示」をクリックして一覧から選択</p>
          <p>3. ユーザーが見つかったら、適切なロールを選択</p>
          <div className="mt-4 pt-4 border-t border-blue-300 space-y-1">
            <p className="font-semibold">ロールの説明:</p>
            <p>• <strong>管理者</strong>: すべての機能にアクセス可能</p>
            <p>• <strong>スタッフ</strong>: スタッフ向け機能にアクセス可能</p>
            <p>• <strong>顧客</strong>: 予約など顧客向け機能のみ利用可能</p>
          </div>
        </CardContent>
      </Card>
      </div>
    </AppLayout>
  )
}

