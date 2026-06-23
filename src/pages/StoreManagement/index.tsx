import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { HelpButton } from '@/components/ui/help-button'
import { StoreEditModal } from '@/components/modals/StoreEditModal'
import { TanStackDataTable, ColumnSettingsPanel } from '@/components/patterns/table'
import { useTablePreferences } from '@/hooks/useTablePreferences'
import { storeApi } from '@/lib/api'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import type { Store, StoreTravelTimeInput } from '@/types'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'
import { Store as StoreIcon, GripVertical, ArrowUp, ArrowDown } from 'lucide-react'
import { devDb } from '@/components/ui/DevField'
import { useOrganization } from '@/hooks/useOrganization'
import { StoreFilters } from './components/StoreFilters'
import { createStoreColumns, getStoreColors, getStatusBadge } from './utils/tableColumns'
import { useStoreQuery, useStoreTravelTimesQuery, useStoreQueryClient } from './hooks/useStoreQuery'

export function StoreManagement() {
  const { data: stores = [], isLoading: loading, error: queryError } = useStoreQuery()
  const { data: travelTimes = [] } = useStoreTravelTimesQuery()
  const { updateStore, addStore, removeStore, updateTravelTimes } = useStoreQueryClient()
  const error = queryError ? (queryError as Error).message : ''

  const [editingStore, setEditingStore] = useState<Store | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortState, setSortState] = useState<{ field: string; direction: 'asc' | 'desc' } | undefined>(undefined)
  const [isReordering, setIsReordering] = useState(false)

  const moveStore = async (storeId: string, direction: 'up' | 'down') => {
    const orderable = [...stores].filter(s => s.ownership_type !== 'office')
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    const idx = orderable.findIndex(s => s.id === storeId)
    if (idx === -1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= orderable.length) return
    const reordered = [...orderable]
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]
    const updates = reordered.map((s, i) => ({ id: s.id, display_order: i + 1 }))
    setIsReordering(true)
    try {
      await storeApi.updateDisplayOrder(updates)
    } catch (error) {
      showToast.error('並び順の更新に失敗しました')
    } finally {
      setIsReordering(false)
    }
  }

  useReportRouteScrollRestoration('store-management', { isLoading: loading })
  const { organization } = useOrganization()

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      const allowedHashes = ['schedule', 'staff', 'stores', 'scenarios', 'settings', 'dashboard']
      if (hash && hash !== 'stores' && allowedHashes.includes(hash)) {
        window.location.href = '/' + hash
      } else if (!hash) {
        window.location.href = '/'
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const openEditModal = useCallback((store: Store | null) => {
    setEditingStore(store)
    setIsEditModalOpen(true)
  }, [])

  async function handleSaveStore(updatedStore: Store) {
    try {
      if (updatedStore.id) {
        const savedStore = await storeApi.update(updatedStore.id, updatedStore)
        updateStore(savedStore)
      } else {
        const newStore = await storeApi.create(updatedStore)
        addStore(newStore)
      }
    } catch (err: any) {
      logger.error('Error saving store:', err)
      showToast.error('店舗の保存に失敗しました', getSafeErrorMessage(err))
      throw err
    }
  }

  async function handleSaveTravelTimes(items: StoreTravelTimeInput[]) {
    try {
      const savedTravelTimes = await storeApi.upsertTravelTimes(items)
      updateTravelTimes(savedTravelTimes)
    } catch (err: any) {
      logger.error('Error saving store travel times:', err)
      showToast.error('店舗間移動時間の保存に失敗しました', getSafeErrorMessage(err))
      throw err
    }
  }

  async function handleDeleteStore(store: Store) {
    try {
      await storeApi.delete(store.id)
      removeStore(store.id)
    } catch (err: any) {
      logger.error('Error deleting store:', err)
      showToast.error('店舗の削除に失敗しました', getSafeErrorMessage(err))
    }
  }

  function handleCloseEditModal() {
    setIsEditModalOpen(false)
    setEditingStore(null)
  }

  const filteredStores = useMemo(() => {
    let result = stores
    if (searchTerm) {
      const lower = searchTerm.toLowerCase()
      result = result.filter(s =>
        s.name.toLowerCase().includes(lower) ||
        s.short_name.toLowerCase().includes(lower)
      )
    }
    if (statusFilter !== 'all') {
      result = result.filter(s => s.status === statusFilter)
    }
    return result
  }, [stores, searchTerm, statusFilter])

  const sortedStores = useMemo(() => {
    if (!sortState) return filteredStores
    return [...filteredStores].sort((a, b) => {
      let aVal: any
      let bVal: any
      switch (sortState.field) {
        case 'name': aVal = a.name; bVal = b.name; break
        case 'capacity': aVal = a.capacity || 0; bVal = b.capacity || 0; break
        case 'rooms': aVal = a.rooms || 0; bVal = b.rooms || 0; break
        default: return 0
      }
      if (aVal < bVal) return sortState.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortState.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredStores, sortState])

  const tableColumns = useMemo(
    () => createStoreColumns({ onEdit: openEditModal }),
    [openEditModal]
  )

  const defaultColumnKeys = useMemo(() => tableColumns.map(c => c.key), [tableColumns])
  const [columnPrefs, setColumnPrefs] = useTablePreferences('store-management', defaultColumnKeys)

  const activeStores = stores.filter(s => s.status === 'active').length
  const totalCapacity = stores.reduce((sum, s) => sum + (s.capacity || 0), 0)
  const totalRooms = stores.reduce((sum, s) => sum + (s.rooms || 0), 0)

  if (loading) {
    return (
      <AppLayout currentPage="stores" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6">
        <div className="flex items-center justify-center py-20">
          <div className="text-muted-foreground text-lg flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
            読み込み中...
          </div>
        </div>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout currentPage="stores" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6">
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
    <AppLayout
      currentPage="stores"
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      className="mx-auto"
    >
      <div className="space-y-6">
        <PageHeader
          title={
            <>
              <StoreIcon className="h-5 w-5 text-primary" />
              {organization?.name ? `${organization.name}の店舗管理` : '店舗管理'}
            </>
          }
          description={`全${stores.length}店舗の管理`}
        >
          <HelpButton topic="store" label="店舗管理マニュアル" />
        </PageHeader>

        {/* 統計カード */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          <Card className="bg-white border shadow-none">
            <CardContent className="p-3 sm:p-4">
              <div className="text-xs text-muted-foreground">総店舗数</div>
              <div className="text-xl sm:text-2xl font-bold" {...devDb('stores.count()')}>{stores.length}</div>
            </CardContent>
          </Card>
          <Card className="bg-white border shadow-none">
            <CardContent className="p-3 sm:p-4">
              <div className="text-xs text-muted-foreground">営業中</div>
              <div className="text-xl sm:text-2xl font-bold text-green-700" {...devDb('stores.filter(status=active).count()')}>{activeStores}</div>
            </CardContent>
          </Card>
          <Card className="bg-white border shadow-none">
            <CardContent className="p-3 sm:p-4">
              <div className="text-xs text-muted-foreground">総収容人数</div>
              <div className="text-xl sm:text-2xl font-bold" {...devDb('stores.sum(capacity)')}>{totalCapacity}名</div>
            </CardContent>
          </Card>
          <Card className="bg-white border shadow-none">
            <CardContent className="p-3 sm:p-4">
              <div className="text-xs text-muted-foreground">総部屋数</div>
              <div className="text-xl sm:text-2xl font-bold" {...devDb('stores.sum(rooms)')}>{totalRooms}室</div>
            </CardContent>
          </Card>
        </div>

        {/* フィルター */}
        <StoreFilters
          searchTerm={searchTerm}
          statusFilter={statusFilter}
          onSearchChange={setSearchTerm}
          onStatusFilterChange={setStatusFilter}
          onAddClick={() => openEditModal(null)}
          resultCount={sortedStores.length}
          columnSettingsPanel={
            <ColumnSettingsPanel
              columns={tableColumns}
              preferences={columnPrefs}
              onPreferencesChange={setColumnPrefs}
              defaultColumnKeys={defaultColumnKeys}
            />
          }
        />

        {/* 表示順 */}
        <details className="bg-white border rounded-lg">
          <summary className="px-4 py-3 cursor-pointer text-sm font-medium flex items-center gap-2 select-none">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            表示順の変更
            <span className="text-xs text-muted-foreground font-normal ml-1">— スケジュール・予約サイトでの並び順</span>
          </summary>
          <div className="px-4 pb-4 space-y-1.5">
            {[...stores]
              .filter(s => s.ownership_type !== 'office')
              .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
              .map((store, index, arr) => (
                <div key={store.id} className="flex items-center gap-3 p-2 rounded-lg border bg-muted/20">
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: store.color || '#3B82F6' }} />
                  <span className="flex-1 text-sm">{store.short_name || store.name}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                      disabled={index === 0 || isReordering}
                      onClick={() => moveStore(store.id, 'up')}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                      disabled={index === arr.length - 1 || isReordering}
                      onClick={() => moveStore(store.id, 'down')}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </details>

        {/* PC用: テーブル形式 */}
        <div className="hidden md:block">
          <div className="bg-white border rounded-lg overflow-hidden">
            <TanStackDataTable
              data={sortedStores}
              columns={tableColumns}
              getRowKey={(store) => store.id}
              sortState={sortState}
              onSort={setSortState}
              emptyMessage={
                searchTerm || statusFilter !== 'all'
                  ? '検索条件に一致する店舗が見つかりません'
                  : '店舗が登録されていません'
              }
              loading={loading}
              columnPreferences={columnPrefs}
            />
          </div>
        </div>

        {/* モバイル用: カード形式 */}
        <div className="md:hidden space-y-2">
          {sortedStores.length > 0 ? (
            sortedStores.map((store) => {
              const colors = getStoreColors(store.short_name)
              return (
                <div
                  key={store.id}
                  className="bg-white border rounded-lg overflow-hidden"
                  onClick={() => openEditModal(store)}
                >
                  <div className="p-3 pb-2">
                    <div className="flex items-start gap-3">
                      <div className={`w-4 h-4 rounded-full flex-shrink-0 mt-0.5 ${colors.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-bold text-sm truncate">{store.name}</h3>
                          {getStatusBadge(store.status)}
                        </div>
                        <div className="text-xs text-muted-foreground">{store.short_name}</div>
                      </div>
                    </div>
                  </div>

                  <div className="px-3 pb-2 space-y-1">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{store.capacity || 0}名収容</span>
                      <span>{store.rooms || 0}室</span>
                      {store.region && <span>{store.region}</span>}
                      {store.ownership_type && (
                        <Badge
                          // @ts-ignore
                          variant={
                            store.ownership_type === 'corporate' ? 'info' :
                            store.ownership_type === 'office' ? 'purple' : 'warning'
                          }
                          className="text-[10px] px-1.5 py-0 font-normal"
                        >
                          {store.ownership_type === 'corporate' ? '直営店' :
                           store.ownership_type === 'office' ? 'オフィス' : 'FC'}
                        </Badge>
                      )}
                    </div>
                    {store.address && (
                      <div className="text-xs text-muted-foreground truncate">{store.address}</div>
                    )}
                  </div>

                  <div className="bg-gray-50 px-3 py-1.5 text-[10px] text-muted-foreground flex items-center justify-between border-t">
                    <span>{store.manager_name || '店長未設定'}</span>
                    <span className="text-primary">編集 →</span>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {searchTerm || statusFilter !== 'all'
                ? '検索条件に一致する店舗が見つかりません'
                : '店舗が登録されていません'}
            </div>
          )}
        </div>
      </div>

      <StoreEditModal
        store={editingStore}
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        onSave={handleSaveStore}
        onSaveTravelTimes={handleSaveTravelTimes}
        onDelete={handleDeleteStore}
        allStores={stores}
        travelTimes={travelTimes}
      />
    </AppLayout>
  )
}
