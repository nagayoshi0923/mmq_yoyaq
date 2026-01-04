import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { HelpButton } from '@/components/ui/help-button'
import { StoreEditModal } from '@/components/modals/StoreEditModal'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { storeApi } from '@/lib/api'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import type { Store } from '@/types'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { 
  Store as StoreIcon, 
  Plus, 
  Edit, 
  Users,
  Building,
  DoorOpen
} from 'lucide-react'


export function StoreManagement() {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingStore, setEditingStore] = useState<Store | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  // スクロール位置の保存と復元（汎用フックを使用）
  useScrollRestoration({ pageKey: 'store', isLoading: loading })

  useEffect(() => {
    loadStores()
  }, [])

  // ハッシュ変更でページ切り替え
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (hash && hash !== 'stores') {
        // 他のページに切り替わった場合、AdminDashboardに戻る
        window.location.href = '/#' + hash
      } else if (!hash) {
        // ダッシュボードに戻る
        window.location.href = '/'
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  async function loadStores() {
    try {
      setLoading(true)
      setError('')
      const data = await storeApi.getAll()
      setStores(data)
    } catch (err: any) {
      logger.error('Error loading stores:', err)
      setError('店舗データの読み込みに失敗しました: ' + err.message)
      // エラー時は空配列を設定
      setStores([])
    } finally {
      setLoading(false)
    }
  }


  function handleEditStore(store: Store) {
    setEditingStore(store)
    setIsEditModalOpen(true)
  }

  function openEditModal(store: Store | null) {
    setEditingStore(store)
    setIsEditModalOpen(true)
  }

  async function handleSaveStore(updatedStore: Store) {
    try {
      // idの有無で新規作成か更新かを判定
      if (updatedStore.id) {
        // 更新
        const savedStore = await storeApi.update(updatedStore.id, updatedStore)
        setStores(prev => prev.map(s => s.id === savedStore.id ? savedStore : s))
      } else {
        // 新規作成
        const newStore = await storeApi.create(updatedStore)
        setStores(prev => [...prev, newStore])
      }
    } catch (err: any) {
      logger.error('Error saving store:', err)
      showToast.error('店舗の保存に失敗しました', err.message)
      throw err // モーダルでエラーハンドリングするため再throw
    }
  }

  async function handleDeleteStore(store: Store) {
    try {
      await storeApi.delete(store.id)
      // 削除成功後、リストから除去
      setStores(prev => prev.filter(s => s.id !== store.id))
    } catch (err: any) {
      logger.error('Error deleting store:', err)
      showToast.error('店舗の削除に失敗しました', err.message)
    }
  }

  function handleCloseEditModal() {
    setIsEditModalOpen(false)
    setEditingStore(null)
  }

  // 店舗識別色を返すヘルパー関数
  const getStoreThemeClasses = (shortName: string) => {
    switch (shortName) {
      case '馬場': return { dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-800' }
      case '別館①': return { dot: 'bg-green-500', badge: 'bg-green-100 text-green-800' }
      case '別館②': return { dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-800' }
      case '大久保': return { dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-800' }
      case '大塚': return { dot: 'bg-red-500', badge: 'bg-red-100 text-red-800' }
      case '埼玉大宮': return { dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800' }
      default: return { dot: 'bg-gray-500', badge: 'bg-gray-100 text-gray-800' }
    }
  }

  // ステータスバッジを返すヘルパー関数
  const getStatusBadge = (status: string) => {
    switch (status) {
      // @ts-ignore
      case 'active': return <Badge variant="success">営業中</Badge>
      // @ts-ignore
      case 'temporarily_closed': return <Badge variant="warning">一時休業</Badge>
      // @ts-ignore
      case 'closed': return <Badge variant="gray">閉鎖</Badge>
      default: return <Badge variant="outline">不明</Badge>
    }
  }

  const totalCapacity = stores.reduce((sum, store) => sum + (store.capacity || 0), 0)
  const totalRooms = stores.reduce((sum, store) => sum + (store.rooms || 0), 0)
  const activeStores = stores.filter(store => store.status === 'active').length

  return (
    <AppLayout
      currentPage="stores"
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
    >
      <div className="space-y-6">
          <PageHeader
            title={
              <div className="flex items-center gap-2">
                <StoreIcon className="h-5 w-5 text-primary" />
                <span className="text-lg font-bold">店舗管理</span>
              </div>
            }
            description={`Queens Waltz 全${stores.length}店舗の管理`}
          >
            <HelpButton topic="store" label="店舗管理マニュアル" />
            <Button 
              onClick={() => openEditModal(null)}
              size="sm"
            >
              <Plus className="mr-1 h-4 w-4" />
              <span className="hidden sm:inline">新規店舗</span>
              <span className="sm:hidden">新規</span>
            </Button>
          </PageHeader>

          {error && (
            <Card className="border-red-500 bg-red-50 shadow-none">
              <CardContent className="p-4 text-red-800 text-sm">
                {error}
              </CardContent>
            </Card>
          )}

          {/* 統計情報 */}
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
            <Card className="shadow-none border">
              <CardContent className="p-3 sm:p-4 md:pt-6">
                <div className="flex items-center gap-2">
                  <StoreIcon className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xl sm:text-2xl font-bold">{stores.length}</p>
                    <p className="text-xs text-muted-foreground truncate">総店舗数</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-none border">
              <CardContent className="p-3 sm:p-4 md:pt-6">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xl sm:text-2xl font-bold">{totalCapacity}名</p>
                    <p className="text-xs text-muted-foreground truncate">総収容人数</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-none border">
              <CardContent className="p-3 sm:p-4 md:pt-6">
                <div className="flex items-center gap-2">
                  <DoorOpen className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xl sm:text-2xl font-bold">{totalRooms}室</p>
                    <p className="text-xs text-muted-foreground truncate">総部屋数</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-none border">
              <CardContent className="p-3 sm:p-4 md:pt-6">
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xl sm:text-2xl font-bold">{activeStores}</p>
                    <p className="text-xs text-muted-foreground truncate">営業中店舗</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 店舗一覧テーブル */}
          <Card className="shadow-none border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[200px]">店舗名</TableHead>
                      <TableHead className="w-[100px]">ステータス</TableHead>
                      <TableHead className="w-[100px]">タイプ</TableHead>
                      <TableHead className="w-[100px]">都道府県</TableHead>
                      <TableHead className="w-[80px] text-center">収容</TableHead>
                      <TableHead className="w-[80px] text-center">部屋</TableHead>
                      <TableHead className="hidden md:table-cell">住所</TableHead>
                      <TableHead className="hidden lg:table-cell">店長</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stores.map((store) => {
                      const colors = getStoreThemeClasses(store.short_name)
                      
                      return (
                        <TableRow 
                          key={store.id} 
                          className="hover:bg-muted/30 cursor-pointer"
                          onClick={() => handleEditStore(store)}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${colors.dot}`}></div>
                              <div>
                                <div className="font-medium">{store.name}</div>
                                <div className="text-xs text-muted-foreground">{store.short_name}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(store.status)}
                          </TableCell>
                          <TableCell>
                            {store.ownership_type && (
                              <Badge 
                                // @ts-ignore
                                variant={
                                  store.ownership_type === 'corporate' ? 'info' : 
                                  store.ownership_type === 'office' ? 'purple' :
                                  'warning'
                                }
                                className="text-[10px] px-1.5 py-0 font-normal"
                              >
                                {store.ownership_type === 'corporate' ? '直営店' : 
                                 store.ownership_type === 'office' ? 'オフィス' : 'FC'}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {store.region || '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-medium">{store.capacity || 0}</span>
                            <span className="text-xs text-muted-foreground">名</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-medium">{store.rooms || 0}</span>
                            <span className="text-xs text-muted-foreground">室</span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className="text-sm text-muted-foreground line-clamp-1">
                              {store.address || '-'}
                            </span>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <span className="text-sm">
                              {store.manager_name || '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEditStore(store)
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {stores.length === 0 && !loading && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          店舗が登録されていません
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
      </div>

      {/* 編集モーダル */}
      <StoreEditModal
        store={editingStore}
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        onSave={handleSaveStore}
        onDelete={handleDeleteStore}
      />
    </AppLayout>
  )
}
