import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { ConfirmModal } from '@/components/patterns/modal'
import { TanStackDataTable } from '@/components/patterns/table'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { StaffEditForm } from './components/StaffEditForm'
import { HelpButton } from '@/components/ui/help-button'
import { usePageState } from '@/hooks/usePageState'
import { supabase } from '@/lib/supabase'
import { staffApi } from '@/lib/api'
import type { Staff } from '@/types'
import { 
  Users, CheckCircle2, Link2, Trash2, Unlink
} from 'lucide-react'
import { StaffAvatar } from '@/components/staff/StaffAvatar'
import { getRoleBadges, getStatusBadge } from './utils/staffFormatters'

// 分離されたフック
import { useStaffFilters } from './hooks/useStaffFilters'
import { useStoresAndScenarios } from './hooks/useStoresAndScenarios'
import { useStaffModals } from './hooks/useStaffModals'
import { useStaffInvitation } from './hooks/useStaffInvitation'
import { useStaffQuery, useStaffMutation, useDeleteStaffMutation } from './hooks/useStaffQuery'
import { useQueryClient } from '@tanstack/react-query'

// 分離されたコンポーネントとユーティリティ
import { StaffFilters } from './components/StaffFilters'
import { UserSearchCombobox } from './components/UserSearchCombobox'
import { createStaffColumns } from './utils/tableColumns'

export function StaffManagement() {
  // ページ状態管理
  const { restoreState, saveState } = usePageState({
    pageKey: 'staff',
    scrollRestoration: true
  })

  // React Query でCRUD操作
  const queryClient = useQueryClient()
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
    searchEmail,
    setSearchEmail,
    searchedUser,
    setSearchedUser,
    deleteDialogOpen,
    staffToDelete,
    openDeleteDialog,
    closeDeleteDialog
  } = useStaffModals()

  // 招待・紐付け・連携解除
  const {
    handleInviteStaff,
    handleLinkWithInvite,
    handleUnlinkUser
  } = useStaffInvitation({
    onSuccess: async () => {
      closeInviteModal()
      closeLinkModal()
      closeUnlinkDialog()
      // React Queryが自動でリロード
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

  // スタッフ編集ハンドラ
  function handleEditStaff(staff: any) {
    openEditModal(staff)
  }

  // 連携解除モーダル
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false)
  const [staffToUnlink, setStaffToUnlink] = useState<Staff | null>(null)
  
  const openUnlinkDialog = (staff: Staff) => {
    setStaffToUnlink(staff)
    setUnlinkDialogOpen(true)
  }
  
  const closeUnlinkDialog = () => {
    setUnlinkDialogOpen(false)
    setStaffToUnlink(null)
  }
  
  const handleConfirmUnlink = async () => {
    if (!staffToUnlink) return
    await handleUnlinkUser(staffToUnlink)
  }

  // テーブル列定義（メモ化）
  const tableColumns = useMemo(
    () => createStaffColumns(
      { stores, getScenarioName },
      { 
        onEdit: handleEditStaff, 
        onLink: openLinkModal, 
        onUnlink: openUnlinkDialog,
        onDelete: openDeleteDialog 
      }
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

  // コンボボックスからユーザー選択
  const handleUserSelect = (userId: string, user: { id: string; email: string; role: string } | null) => {
    setSearchEmail(userId)
    setSearchedUser(user)
  }

  // 選択したユーザーと紐付けハンドラ
  const handleConfirmLink = async () => {
    if (!searchedUser || !linkingStaff) return

    setLinkLoading(true)
    try {
      // 1. 既に同じuser_idを持つスタッフレコードを検索
      const { data: existingStaff, error: searchError } = await supabase
        .from('staff')
        .select('id, name')
        .eq('user_id', searchedUser.id)
        .neq('id', linkingStaff.id)

      if (searchError) {
        console.error('既存スタッフ検索エラー:', searchError)
      }

      // 2. 既存の紐付けを解除（user_idをNULLに）
      if (existingStaff && existingStaff.length > 0) {
        console.log(`既存の紐付けを解除: ${existingStaff.map(s => s.name).join(', ')}`)
        
        const { error: unlinkError } = await supabase
          .from('staff')
          .update({ user_id: null, email: null })
          .eq('user_id', searchedUser.id)
          .neq('id', linkingStaff.id)

        if (unlinkError) {
          console.warn('既存紐付け解除エラー:', unlinkError)
        }
      }

      // 3. 新しいスタッフレコードにuser_idを設定
      await staffApi.update(linkingStaff.id, {
        ...linkingStaff,
        user_id: searchedUser.id,
        email: searchedUser.email
      })

      // 4. usersテーブルのroleをstaffに更新（既にadminの場合は変更しない）
      if (searchedUser.role !== 'admin') {
      const { error: updateError } = await supabase
        .from('users')
        .update({ role: 'staff' })
        .eq('id', searchedUser.id)

      if (updateError) {
        console.warn('usersテーブルの更新に失敗しました:', updateError)
      }
      }

      // React Queryのキャッシュを無効化して最新データを取得
      await queryClient.invalidateQueries({ queryKey: ['staff'] })

      alert(`✅ ${linkingStaff.name}さんを ${searchedUser.email} と紐付けました！`)
      closeLinkModal()
    } catch (err: any) {
      alert('紐付けに失敗しました: ' + err.message)
    } finally {
      setLinkLoading(false)
    }
  }

  // ローディング表示
  if (loading) {
    return (
      <AppLayout currentPage="staff">
        <div className="flex items-center justify-center py-20">
          <div className="text-muted-foreground text-lg flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            読み込み中...
          </div>
        </div>
      </AppLayout>
    )
  }

  // エラー表示
  if (error) {
    return (
      <AppLayout currentPage="staff">
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
        maxWidth="max-w-[1440px]"
        containerPadding="px-2 py-4 sm:px-6"
        className="mx-auto"
      >
        <div className="space-y-6">
            <PageHeader
              title={
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <span className="text-lg font-bold">スタッフ管理</span>
                </div>
              }
              description={`全${staff.length}名のスタッフを管理`}
            >
              <HelpButton topic="staff" label="スタッフ管理マニュアル" />
            </PageHeader>

            {/* 統計情報 - モバイル対応（2列グリッド） */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
              <Card className="bg-white border shadow-none">
                <CardContent className="p-3 sm:p-4">
                  <div className="text-xs text-muted-foreground">総スタッフ数</div>
                  <div className="text-xl sm:text-2xl font-bold">{staff.length}</div>
                </CardContent>
              </Card>
              
              <Card className="bg-white border shadow-none">
                <CardContent className="p-3 sm:p-4">
                  <div className="text-xs text-muted-foreground">研修中</div>
                  <div className="text-xl sm:text-2xl font-bold text-orange-700">
                    {staff.filter(s => s.role && s.role.includes('trainee')).length}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border shadow-none">
                <CardContent className="p-3 sm:p-4">
                  <div className="text-xs text-muted-foreground">GM</div>
                  <div className="text-xl sm:text-2xl font-bold text-blue-700">
                    {staff.filter(s => s.role && s.role.includes('GM')).length}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border shadow-none">
                <CardContent className="p-3 sm:p-4">
                  <div className="text-xs text-muted-foreground">平均経験年数</div>
                  <div className="text-xl sm:text-2xl font-bold">
                    {Math.round(staff.reduce((sum, s) => sum + s.experience, 0) / staff.length) || 0}年
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
            />

            {/* スタッフ一覧テーブル (PC表示) */}
            <div className="hidden md:block bg-white border rounded-lg overflow-hidden">
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
            </div>

            {/* スタッフ一覧リスト (モバイル表示) */}
            <div className="md:hidden space-y-2">
              {sortedStaff.length > 0 ? (
                sortedStaff.map((staffItem) => {
                  const gmScenarios = staffItem.special_scenarios || []
                  const expScenarios = (staffItem as any).experienced_scenarios || []
                  
                  return (
                    <div key={staffItem.id} className="bg-white border rounded-lg overflow-hidden" onClick={() => handleEditStaff(staffItem)}>
                      {/* ヘッダー：アバター、名前 */}
                      <div className="p-3 pb-2">
                        <div className="flex items-start gap-3">
                        <StaffAvatar
                            name={staffItem.name}
                            avatarUrl={staffItem.avatar_url}
                            avatarColor={staffItem.avatar_color}
                          size="md"
                        />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-sm truncate">{staffItem.name}</h3>
                              {getStatusBadge(staffItem.status)}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {getRoleBadges(staffItem.role)}
                              {!staffItem.user_id && (
                                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">未連携</Badge>
                              )}
                          </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* 詳細：店舗、シナリオ */}
                      <div className="px-3 pb-2 space-y-1.5">
                        {staffItem.stores && staffItem.stores.length > 0 && (
                          <div className="flex items-start gap-2 text-xs">
                            <span className="text-muted-foreground shrink-0 w-10">店舗</span>
                            <div className="flex flex-wrap gap-1">
                              {staffItem.stores.slice(0, 3).map((storeId, idx) => {
                                const store = stores.find(s => s.id === storeId)
                                return <Badge key={idx} variant="outline" className="text-xs font-normal py-0.5 px-1.5">{store?.name || storeId}</Badge>
                              })}
                              {staffItem.stores.length > 3 && <span className="text-muted-foreground">+{staffItem.stores.length - 3}</span>}
                            </div>
                          </div>
                        )}
                        
                        {gmScenarios.length > 0 && (
                          <div className="flex items-start gap-2 text-xs">
                            <span className="text-blue-600 shrink-0 w-10">GM可</span>
                            <div className="flex flex-wrap gap-1">
                              {gmScenarios.slice(0, 5).map((scenarioId: string, idx: number) => (
                                <Badge key={idx} variant="outline" className="text-xs font-normal py-0.5 px-1.5 bg-blue-50 border-blue-200 text-blue-700">
                                  {getScenarioName(scenarioId)}
                                </Badge>
                              ))}
                              {gmScenarios.length > 5 && <span className="text-muted-foreground">+{gmScenarios.length - 5}</span>}
                            </div>
                          </div>
                        )}
                        
                        {expScenarios.length > 0 && (
                          <div className="flex items-start gap-2 text-xs">
                            <span className="text-green-600 shrink-0 w-10">体験</span>
                            <div className="flex flex-wrap gap-1">
                              {expScenarios.slice(0, 5).map((scenarioId: string, idx: number) => (
                                <Badge key={idx} variant="outline" className="text-xs font-normal py-0.5 px-1.5 bg-green-50 border-green-200 text-green-700">
                                  {getScenarioName(scenarioId)}
                                </Badge>
                              ))}
                              {expScenarios.length > 5 && <span className="text-muted-foreground">+{expScenarios.length - 5}</span>}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* フッター */}
                      <div className="bg-gray-50 px-3 py-1.5 text-[10px] text-muted-foreground flex items-center justify-between border-t">
                        <div className="flex gap-3">
                          <span>店舗{staffItem.stores?.length || 0}</span>
                          <span className="text-blue-600">GM可{gmScenarios.length}</span>
                          <span className="text-green-600">体験{expScenarios.length}</span>
                        </div>
                        <span className="text-primary">編集 →</span>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {searchTerm || statusFilter !== 'all'
                    ? '検索条件に一致するスタッフが見つかりません'
                    : 'スタッフが登録されていません'}
                </div>
              )}
            </div>
          </div>

        {/* スタッフ編集モーダル */}
        <Dialog open={isEditModalOpen} onOpenChange={(open) => !open && closeEditModal()}>
          <DialogContent className="max-w-[95vw] sm:max-w-7xl max-h-[90vh] sm:max-h-[85vh] p-0 flex flex-col overflow-hidden">
            <DialogHeader className="px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 md:pt-6 pb-2 sm:pb-4 border-b shrink-0">
              <DialogTitle>{editingStaff?.id ? 'スタッフ編集' : '新規スタッフ作成'}</DialogTitle>
              <DialogDescription>
                {editingStaff?.name ? `${editingStaff.name}の情報を編集します` : 'スタッフの情報を入力してください'}
              </DialogDescription>
            </DialogHeader>
            <StaffEditForm
              staff={editingStaff}
              stores={stores}
              scenarios={scenarios as any}
              onSave={handleSaveStaff}
              onCancel={closeEditModal}
              onLink={editingStaff && !editingStaff.user_id ? () => { closeEditModal(); openLinkModal(editingStaff); } : undefined}
              onUnlink={editingStaff?.user_id ? () => { closeEditModal(); openUnlinkDialog(editingStaff); } : undefined}
              onDelete={editingStaff?.id ? () => { closeEditModal(); openDeleteDialog(editingStaff); } : undefined}
            />
          </DialogContent>
        </Dialog>

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

        {/* 連携解除確認ダイアログ */}
        <ConfirmModal
          open={unlinkDialogOpen}
          onClose={closeUnlinkDialog}
          onConfirm={handleConfirmUnlink}
          title="アカウント連携を解除"
          message={`${staffToUnlink?.name}さんとアカウントの連携を解除します。このスタッフはログインできなくなりますが、データは残ります。`}
          variant="warning"
          confirmLabel="連携解除"
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
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="user-search">ユーザーを選択</Label>
                      <div className="mt-1">
                        <UserSearchCombobox
                          value={searchEmail}
                          onValueChange={handleUserSelect}
                          placeholder="メールアドレスで検索..."
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        メールアドレスの一部を入力すると候補が表示されます
                      </p>
                    </div>

                    {/* 選択結果 */}
                    {searchedUser && (
                      <div className="space-y-3">
                        <div className="flex items-start gap-2 p-4 bg-green-50 border border-green-200 rounded-md">
                          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-green-900">ユーザーが選択されました</p>
                            <p className="text-sm text-green-700 mt-1">
                              <span className="">メール:</span> {searchedUser.email}
                            </p>
                            <p className="text-sm text-green-700">
                              <span className="">現在のロール:</span> {searchedUser.role}
                            </p>
                          </div>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                          <p className="text-sm text-blue-800">
                            <strong>{linkingStaff.name}</strong>さんを <strong>{searchedUser.email}</strong> と紐付けます。
                            <br />
                            ユーザーのロールは自動的に <strong>staff</strong> に変更されます。
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 justify-end pt-2">
                      <Button type="button" variant="outline" onClick={closeLinkModal}>
                        キャンセル
                      </Button>
                      <Button
                        onClick={handleConfirmLink}
                        disabled={!searchedUser || linkLoading}
                      >
                        {linkLoading ? '処理中...' : '紐付ける'}
                      </Button>
                    </div>
                  </div>
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
