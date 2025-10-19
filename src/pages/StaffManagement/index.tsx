import { useState, useEffect } from 'react'
import { ArrowLeft, Users, Shield, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { StaffEditModal } from '@/components/modals/StaffEditModal'
import { usePageState } from '@/hooks/usePageState'

// 分離されたフック
import { useStaffOperations } from './hooks/useStaffOperations'
import { useStaffFilters } from './hooks/useStaffFilters'
import { useStoresAndScenarios } from './hooks/useStoresAndScenarios'
import { useStaffModals } from './hooks/useStaffModals'
import { useStaffInvitation } from './hooks/useStaffInvitation'

// 分離されたコンポーネント
import { StaffList } from './components/StaffList'
import { StaffFilters } from './components/StaffFilters'

export function StaffManagement() {
  // ページ状態管理
  const { restoreState, saveState } = usePageState({
    pageKey: 'staff',
    scrollRestoration: true
  })

  // CRUD操作
  const {
    staff,
    loading,
    error,
    loadStaff,
    saveStaff,
    deleteStaff
  } = useStaffOperations()

  // 店舗・シナリオ管理
  const {
    stores,
    scenarios,
    loadStores,
    loadScenarios,
    getScenarioName
  } = useStoresAndScenarios()

  // フィルタ状態
  const [searchTerm, setSearchTerm] = useState(() => {
    const restored = restoreState('searchTerm', '')
    console.log('🔍 searchTerm restored:', restored)
    return restored || ''
  })
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const restored = restoreState('statusFilter', 'all')
    console.log('🎯 statusFilter restored:', restored, 'type:', typeof restored)
    // 有効な値かチェック
    const validStatuses = ['all', 'active', 'inactive', 'on_leave']
    if (restored && validStatuses.includes(restored)) {
      return restored
    }
    // 無効な値の場合は 'all' にリセット
    console.warn('⚠️ Invalid statusFilter:', restored, '→ reset to "all"')
    return 'all'
  })

  // フィルタリング
  const { filteredStaff } = useStaffFilters({
    staff,
    searchTerm,
    statusFilter
  })

  // モーダル管理
  const {
    isEditModalOpen,
    editingStaff,
    openEditModal,
    closeEditModal,
    isInviteModalOpen,
    inviteLoading,
    setInviteLoading,
    openInviteModal,
    closeInviteModal,
    isLinkModalOpen,
    linkingStaff,
    linkLoading,
    linkMethod,
    setLinkLoading,
    setLinkMethod,
    openLinkModal,
    closeLinkModal,
    deleteDialogOpen,
    staffToDelete,
    openDeleteDialog,
    closeDeleteDialog
  } = useStaffModals()

  // 招待・紐付け
  const {
    handleInviteStaff,
    handleLinkExistingUser,
    handleLinkWithInvite
  } = useStaffInvitation({
    onSuccess: async () => {
      closeInviteModal()
      closeLinkModal()
      await loadStaff()
    }
  })

  // 初期データ読み込み
  useEffect(() => {
    loadStaff()
    loadStores()
    loadScenarios()
  }, [])

  // 検索・フィルタの状態を自動保存
  useEffect(() => {
    saveState('searchTerm', searchTerm)
  }, [searchTerm, saveState])

  useEffect(() => {
    saveState('statusFilter', statusFilter)
  }, [statusFilter, saveState])

  // ハッシュ変更でページ切り替え
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (hash && hash !== 'staff') {
        window.location.href = '/#' + hash
      } else if (!hash) {
        window.location.href = '/'
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // スタッフ保存ハンドラ
  const handleSaveStaff = async (staffData: any) => {
    try {
      await saveStaff(staffData)
      closeEditModal()
    } catch (err: any) {
      alert(err.message)
    }
  }

  // スタッフ削除ハンドラ
  const handleDeleteStaff = async () => {
    if (!staffToDelete) return
    try {
      await deleteStaff(staffToDelete.id)
      closeDeleteDialog()
    } catch (err: any) {
      alert(err.message)
    }
  }

  // ローディング表示
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="staff" />
        <div className="container mx-auto max-w-7xl px-8 py-6">
          <div className="space-y-6">
            <div className="h-16 bg-gray-200 rounded animate-pulse"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="pt-6">
                    <div className="h-20 bg-gray-200 rounded animate-pulse"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // エラー表示
  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="staff" />
        <div className="container mx-auto max-w-7xl px-8 py-6">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <p className="text-red-800">{error}</p>
              <Button onClick={() => loadStaff()} className="mt-4" variant="outline">
                再読み込み
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="staff" />
      
        <div className="container mx-auto max-w-7xl px-8 py-6">
          <div className="space-y-6">
            {/* ヘッダー */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => window.history.back()}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  戻る
                </Button>
                <div>
                  <h1>スタッフ管理</h1>
                  <p className="text-muted-foreground">
                    全{staff.length}名のスタッフ管理
                  </p>
                </div>
              </div>
            </div>

            {/* 統計情報 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-2xl font-bold">{staff.length}</p>
                      <p className="text-muted-foreground">総スタッフ数</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-2xl font-bold">
                        {staff.filter(s => s.status === 'active').length}
                      </p>
                      <p className="text-muted-foreground">在籍中</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-2xl font-bold">
                        {staff.filter(s => s.role && s.role.includes('GM')).length}
                      </p>
                      <p className="text-muted-foreground">GM</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-2xl font-bold">
                        {Math.round(staff.reduce((sum, s) => sum + s.experience, 0) / staff.length) || 0}
                      </p>
                      <p className="text-muted-foreground">平均経験年数</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 検索・フィルター */}
            <StaffFilters
              searchTerm={searchTerm}
              statusFilter={statusFilter}
              onSearchChange={setSearchTerm}
              onStatusFilterChange={setStatusFilter}
              onInviteClick={openInviteModal}
              onCreateClick={() => {
                openEditModal(null as any)
              }}
            />

            {/* スタッフ一覧 */}
            <StaffList
              filteredStaff={filteredStaff}
              stores={stores}
              getScenarioName={getScenarioName}
              onEdit={openEditModal}
              onLink={openLinkModal}
              onDelete={openDeleteDialog}
            />
          </div>
        </div>

        {/* スタッフ編集モーダル */}
        <StaffEditModal
          isOpen={isEditModalOpen}
          onClose={closeEditModal}
          onSave={handleSaveStaff}
          staff={editingStaff}
          stores={stores}
          scenarios={scenarios}
        />

        {/* 削除確認ダイアログ */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={closeDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>スタッフを削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                {staffToDelete?.name}さんのデータを削除します。この操作は取り消せません。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteStaff} className="bg-red-600 hover:bg-red-700">
                削除する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* スタッフ招待モーダル（既存コードを一時的に簡略化） */}
        <Dialog open={isInviteModalOpen} onOpenChange={closeInviteModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>スタッフを招待</DialogTitle>
              <DialogDescription>
                新しいスタッフメンバーを招待します。
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => {
              setInviteLoading(true)
              handleInviteStaff(e).finally(() => setInviteLoading(false))
            }} className="space-y-4">
              <div>
                <Label htmlFor="email">メールアドレス *</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div>
                <Label htmlFor="name">名前 *</Label>
                <Input id="name" name="name" type="text" required />
              </div>
              <div>
                <Label htmlFor="phone">電話番号</Label>
                <Input id="phone" name="phone" type="tel" />
              </div>
              <div>
                <Label htmlFor="line_name">LINE名</Label>
                <Input id="line_name" name="line_name" type="text" />
              </div>
              <div>
                <Label htmlFor="x_account">X (Twitter)</Label>
                <Input id="x_account" name="x_account" type="text" />
              </div>
              <div>
                <Label htmlFor="discord_id">Discord ID</Label>
                <Input id="discord_id" name="discord_id" type="text" />
              </div>
              <div>
                <Label htmlFor="discord_channel_id">Discord Channel ID</Label>
                <Input id="discord_channel_id" name="discord_channel_id" type="text" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={closeInviteModal}>
                  キャンセル
                </Button>
                <Button type="submit" disabled={inviteLoading}>
                  {inviteLoading ? '送信中...' : '招待する'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* 紐付けモーダル（既存コードを一時的に簡略化） */}
        <Dialog open={isLinkModalOpen} onOpenChange={closeLinkModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>ユーザーと紐付け</DialogTitle>
              <DialogDescription>
                {linkingStaff?.name}さんをユーザーアカウントと紐付けます。
              </DialogDescription>
            </DialogHeader>
            {linkingStaff && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    variant={linkMethod === 'existing' ? 'default' : 'outline'}
                    onClick={() => setLinkMethod('existing')}
                  >
                    既存ユーザー
                  </Button>
                  <Button
                    variant={linkMethod === 'invite' ? 'default' : 'outline'}
                    onClick={() => setLinkMethod('invite')}
                  >
                    新規招待
                  </Button>
                </div>
                
                {linkMethod === 'existing' ? (
                  <form onSubmit={(e) => {
                    setLinkLoading(true)
                    handleLinkExistingUser(e, linkingStaff).finally(() => setLinkLoading(false))
                  }}>
                    <Label htmlFor="link-email">メールアドレス</Label>
                    <Input id="link-email" name="link-email" type="email" required />
                    <div className="flex gap-2 justify-end mt-4">
                      <Button type="button" variant="outline" onClick={closeLinkModal}>
                        キャンセル
                      </Button>
                      <Button type="submit" disabled={linkLoading}>
                        {linkLoading ? '処理中...' : '紐付ける'}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={(e) => {
                    setLinkLoading(true)
                    handleLinkWithInvite(e, linkingStaff).finally(() => setLinkLoading(false))
                  }}>
                    <Label htmlFor="invite-email">メールアドレス</Label>
                    <Input id="invite-email" name="invite-email" type="email" required />
                    <div className="flex gap-2 justify-end mt-4">
                      <Button type="button" variant="outline" onClick={closeLinkModal}>
                        キャンセル
                      </Button>
                      <Button type="submit" disabled={linkLoading}>
                        {linkLoading ? '送信中...' : '招待する'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}

