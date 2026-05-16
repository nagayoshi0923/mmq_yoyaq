import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { HelpButton } from '@/components/ui/help-button'
import { StoreEditModal } from '@/components/modals/StoreEditModal'
import { TanStackDataTable, ColumnSettingsPanel } from '@/components/patterns/table'
import { useTablePreferences } from '@/hooks/useTablePreferences'
import { storeApi } from '@/lib/api'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import type { Store } from '@/types'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'
import { Store as StoreIcon, Users, Building, DoorOpen } from 'lucide-react'
import { devDb } from '@/components/ui/DevField'
import { useOrganization } from '@/hooks/useOrganization'
import { StoreFilters } from './components/StoreFilters'
import { createStoreColumns } from './utils/tableColumns'

export function StoreManagement() {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingStore, setEditingStore] = useState<Store | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useReportRouteScrollRestoration('store-management', { isLoading: loading })
  const { organization } = useOrganization()

  useEffect(() => {
    loadStores()
  }, [])

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

  async function loadStores() {
    try {
      setLoading(true)
      setError('')
      const data = await storeApi.getAll()
      setStores(data)
    } catch (err: any) {
      logger.error('Error loading stores:', err)
      setError('店舗データの読み込みに失敗しました: ' + err.message)
      setStores([])
    } finally {
      setLoading(false)
    }
  }

  function openEditModal(store: Store | null) {
    setEditingStore(store)
    setIsEditModalOpen(true)
  }

  async function handleSaveStore(updatedStore: Store) {
    try {
      if (updatedStore.id) {
        const savedStore = await storeApi.update(updatedStore.id, updatedStore)
        setStores(prev => prev.map(s => s.id === savedStore.id ? savedStore : s))
      } else {
        const newStore = await storeApi.create(updatedStore)
        setStores(prev => [...prev, newStore])
      }
    } catch (err: any) {
      logger.error('Error saving store:', err)
      showToast.error('店舗の保存に失敗しました', getSafeErrorMessage(err))
      throw err
    }
  }

  async function handleDeleteStore(store: Store) {
    try {
      await storeApi.delete(store.id)
      setStores(prev => prev.filter(s => s.id !== store.id))
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

  const tableColumns = useMemo(
    () => createStoreColumns({ onEdit: openEditModal }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const defaultColumnKeys = useMemo(() => tableColumns.map(c => c.key), [tableColumns])
  const [columnPrefs, setColumnPrefs] = useTablePreferences('store-management', defaultColumnKeys)

  const totalCapacity = stores.reduce((sum, s) => sum + (s.capacity || 0), 0)
  const totalRooms = stores.reduce((sum, s) => sum + (s.rooms || 0), 0)
  const activeStores = stores.filter(s => s.status === 'active').length

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
    >
      <div className="space-y-6">
        <PageHeader
          title={
            <div className="flex items-center gap-2">
              <StoreIcon className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">
                {organization?.name ? `${organization.name}の店舗管理` : '店舗管理'}
              </span>
            </div>
          }
          description={`全${stores.length}店舗の管理`}
        >
          <HelpButton topic="store" label="店舗管理マニュアル" />
        </PageHeader>

        {/* 統計カード */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          <Card className="bg-white border shadow-none">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <StoreIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold" {...devDb('stores.count()')}>{stores.length}</p>
                  <p className="text-xs text-muted-foreground">総店舗数</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border shadow-none">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold" {...devDb('stores.sum(capacity)')}>{totalCapacity}名</p>
                  <p className="text-xs text-muted-foreground">総収容人数</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border shadow-none">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <DoorOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold" {...devDb('stores.sum(rooms)')}>{totalRooms}室</p>
                  <p className="text-xs text-muted-foreground">総部屋数</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border shadow-none">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold" {...devDb('stores.filter(status=active).count()')}>{activeStores}</p>
                  <p className="text-xs text-muted-foreground">営業中店舗</p>
                </div>
              </div>
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
          resultCount={filteredStores.length}
          columnSettingsPanel={
            <ColumnSettingsPanel
              columns={tableColumns}
              preferences={columnPrefs}
              onPreferencesChange={setColumnPrefs}
              defaultColumnKeys={defaultColumnKeys}
            />
          }
        />

        {/* 店舗テーブル */}
        <div className="bg-white border rounded-lg overflow-hidden">
          <TanStackDataTable
            data={filteredStores}
            columns={tableColumns}
            getRowKey={(store) => store.id}
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

      <StoreEditModal
        store={editingStore}
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        onSave={handleSaveStore}
        onDelete={handleDeleteStore}
        allStores={stores}
      />
    </AppLayout>
  )
}
