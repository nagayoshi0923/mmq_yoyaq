import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmModal } from '@/components/patterns/modal'
import { TanStackDataTable } from '@/components/patterns/table'
import { AppLayout } from '@/components/layout/AppLayout'
import { UnifiedSidebar, SidebarMenuItem } from '@/components/layout/UnifiedSidebar'
import { StaffEditForm } from './components/StaffEditForm'
import { usePageState } from '@/hooks/usePageState'
import { 
  Users, UserCheck, UserX, Clock, Shield,
  List, UserPlus, Search, Mail, StickyNote, MapPin
} from 'lucide-react'

// 分離されたフック
import { useStaffFilters } from './hooks/useStaffFilters'
import { useStoresAndScenarios } from './hooks/useStoresAndScenarios'
import { useStaffModals } from './hooks/useStaffModals'
import { useStaffInvitation } from './hooks/useStaffInvitation'
import { useStaffQuery, useStaffMutation, useDeleteStaffMutation } from './hooks/useStaffQuery'

// 分離されたコンポーネントとユーティリティ
import { StaffFilters } from './components/StaffFilters'
import { createStaffColumns } from './utils/tableColumns'

// サイドバーのメニュー項目定義（定数として外に出す）
const STAFF_LIST_MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'staff-list', label: 'スタッフ一覧', icon: List, description: 'すべてのスタッフを表示' },
  { id: 'new-staff', label: '新規作成', icon: UserPlus, description: '新しいスタッフを追加' },
  { id: 'search-filter', label: '検索・フィルタ', icon: Search, description: 'スタッフを検索・フィルタ' },
  { id: 'invite-staff', label: 'スタッフ招待', icon: Mail, description: 'メールで招待を送信' }
]

const STAFF_EDIT_MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'basic', label: '基本情報', icon: Users, description: '名前、ステータス、連絡先' },
  { id: 'contact', label: '連絡先情報', icon: Mail, description: 'メール、電話、SNS' },
  { id: 'role-store', label: '役割・担当店舗', icon: Shield, description: 'ロール、店舗、特別シナリオ' },
  { id: 'notes', label: '備考', icon: StickyNote, description: 'メモ・特記事項' }
]

export function StaffManagement() {
  // サイドバー状態 (updated)
  const [activeTab, setActiveTab] = useState('staff-list')
  const [sidebarMode, setSidebarMode] = useState<'list' | 'edit'>('list')
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(null)
  
  // ページ状態管理
  const { restoreState, saveState } = usePageState({
    pageKey: 'staff',
    scrollRestoration: true
  })
  
  // URLハッシュからスタッフIDとタブを復元
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (hash.startsWith('staff/edit/')) {
      const parts = hash.split('/')
      const staffId = parts[2]
      setCurrentStaffId(staffId)
      setSidebarMode('edit')
      setActiveTab('basic') // デフォルトタブ
    } else {
      setCurrentStaffId(null)
      setSidebarMode('list')
      setActiveTab('staff-list')
    }
  }, [])

  // React Query でCRUD操作
  const { data: staff = [], isLoading: loading, error: queryError } = useStaffQuery()
  const staffMutation = useStaffMutation()
  const deleteStaffMutation = useDeleteStaffMutation()
  const error = queryError ? (queryError as Error).message : ''

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
    return restored || ''
  })
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const restored = restoreState('statusFilter', 'all')
    // 有効な値かチェック
    const validStatuses = ['all', 'active', 'inactive', 'on_leave']
    if (restored && validStatuses.includes(restored)) {
      return restored
    }
    // 無効な値の場合は 'all' にリセット
    return 'all'
  })

  // ソート状態
  const [sortState, setSortState] = useState<{ field: string; direction: 'asc' | 'desc' } | undefined>(undefined)

  // フィルタリング
  const { filteredStaff } = useStaffFilters({
    staff,
    searchTerm,
    statusFilter
  })

  // ソート処理
  const sortedStaff = useMemo(() => {
    if (!sortState) return filteredStaff

    return [...filteredStaff].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortState.field) {
        case 'name':
          aValue = a.name || ''
          bValue = b.name || ''
          break
        case 'special_scenarios':
          aValue = a.special_scenarios?.length || 0
          bValue = b.special_scenarios?.length || 0
          break
        case 'experienced_scenarios':
          aValue = (a as any).experienced_scenarios?.length || 0
          bValue = (b as any).experienced_scenarios?.length || 0
          break
        default:
          return 0
      }

      if (aValue < bValue) return sortState.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sortState.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredStaff, sortState])

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

  // スタッフ編集ハンドラ（シナリオと同じパターン）
  function handleEditStaff(staff: any) {
    setCurrentStaffId(staff.id)
    setSidebarMode('edit')
    setActiveTab('basic')
    // モーダルは使わない（editingStaffをセットするだけ）
    openEditModal(staff)
    // スタッフIDをハッシュに設定して遷移
    window.location.hash = `staff/edit/${staff.id}`
  }

  // 一覧に戻るハンドラ
  function handleBackToList() {
    setCurrentStaffId(null)
    setSidebarMode('list')
    setActiveTab('staff-list')
    window.location.hash = 'staff'
  }

  // テーブル列定義（メモ化）
  const tableColumns = useMemo(
    () => createStaffColumns(
      { stores, getScenarioName },
      { onEdit: handleEditStaff, onLink: openLinkModal, onDelete: openDeleteDialog }
    ),
    [stores, getScenarioName]
  )

  // スタッフ保存ハンドラ
  const handleSaveStaff = async (staffData: any) => {
    try {
      await staffMutation.mutateAsync({ staff: staffData, isEdit: !!editingStaff })
      closeEditModal()
    } catch (err: any) {
      alert(err.message)
    }
  }

  // スタッフ削除ハンドラ
  const handleDeleteStaff = async () => {
    if (!staffToDelete) return
    try {
      await deleteStaffMutation.mutateAsync(staffToDelete.id)
      closeDeleteDialog()
    } catch (err: any) {
      alert(err.message)
    }
  }

  // ローディング表示
  if (loading) {
    return (
      <AppLayout 
        currentPage="staff" 
        sidebar={
          <UnifiedSidebar
            title="スタッフ管理"
            mode={sidebarMode}
            menuItems={sidebarMode === 'list' ? STAFF_LIST_MENU_ITEMS : STAFF_EDIT_MENU_ITEMS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onBackToList={sidebarMode === 'edit' ? handleBackToList : undefined}
            editModeSubtitle={sidebarMode === 'edit' && editingStaff ? editingStaff.name : undefined}
          />
        } 
        stickyLayout={true}
      >
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
      </AppLayout>
    )
  }

  // エラー表示
  if (error) {
    return (
      <AppLayout 
        currentPage="staff" 
        sidebar={
          <UnifiedSidebar
            title="スタッフ管理"
            mode={sidebarMode}
            menuItems={sidebarMode === 'list' ? STAFF_LIST_MENU_ITEMS : STAFF_EDIT_MENU_ITEMS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onBackToList={sidebarMode === 'edit' ? handleBackToList : undefined}
            editModeSubtitle={sidebarMode === 'edit' && editingStaff ? editingStaff.name : undefined}
          />
        } 
        stickyLayout={true}
      >
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">{error}</p>
            <Button onClick={() => window.location.reload()} className="mt-4" variant="outline">
              再読み込み
            </Button>
          </CardContent>
        </Card>
      </AppLayout>
    )
  }

  return (
    <TooltipProvider>
      <AppLayout 
        currentPage="staff" 
        sidebar={
          <UnifiedSidebar
            title="スタッフ管理"
            mode={sidebarMode}
            menuItems={sidebarMode === 'list' ? STAFF_LIST_MENU_ITEMS : STAFF_EDIT_MENU_ITEMS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onBackToList={sidebarMode === 'edit' ? handleBackToList : undefined}
            editModeSubtitle={sidebarMode === 'edit' && editingStaff ? editingStaff.name : undefined}
          />
        }
        maxWidth="max-w-[1600px]"
        containerPadding="px-6 py-6"
        stickyLayout={true}
      >
        <div className="space-y-6">
            {/* 編集モード時: スタッフ編集フォーム表示 */}
            {sidebarMode === 'edit' && currentStaffId && editingStaff ? (
              <StaffEditForm
                staff={editingStaff}
                stores={stores}
                scenarios={scenarios}
                onSave={handleSaveStaff}
                onCancel={handleBackToList}
                activeTab={activeTab}
              />
            ) : (
              <>
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

            {/* スタッフ一覧テーブル */}
            <TanStackDataTable
              data={sortedStaff}
              columns={tableColumns}
              getRowKey={(staff) => staff.id}
              sortState={sortState}
              onSort={setSortState}
              emptyMessage={
                searchTerm || statusFilter !== 'all'
                  ? '検索条件に一致するスタッフが見つかりません'
                  : 'スタッフが登録されていません'
              }
              loading={loading}
            />
              </>
            )}
          </div>

        {/* 削除確認ダイアログ */}
        <ConfirmModal
          open={deleteDialogOpen}
          onClose={closeDeleteDialog}
          onConfirm={handleDeleteStaff}
          title="スタッフを削除"
          message={`${staffToDelete?.name}さんのデータを削除します。この操作は取り消せません。`}
          variant="danger"
          confirmLabel="削除する"
        />

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
      </AppLayout>
    </TooltipProvider>
  )
}

