import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { HelpButton } from '@/components/ui/help-button'
import { SearchInput } from '@/components/patterns/filter'
import { EmptyState, ListSkeleton } from '@/components/patterns/list'
import { UserPlus, Users } from 'lucide-react'
import { useCustomerData } from './hooks/useCustomerData'
import { CustomerRow } from './components/CustomerRow'
import { CustomerEditModal } from './components/CustomerEditModal'
import type { Customer } from '@/types'

export default function CustomerManagement() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchTerm = searchParams.get('search') ?? ''
  const setSearchTerm = (v: string) => setSearchParams(
    v ? { search: v } : {},
    { replace: true }
  )
  const {
    customers,
    loading,
    couponStats,
    refreshCustomers,
    totalCount,
    page,
    setPage,
    pageSize,
  } = useCustomerData(searchTerm)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  const handleEdit = (customer: Customer) => {
    setSelectedCustomer(customer)
    setIsEditModalOpen(true)
  }

  const handleToggleExpand = (customerId: string) => {
    setExpandedCustomerId(expandedCustomerId === customerId ? null : customerId)
  }

  return (
    <AppLayout
      currentPage="customer-management"
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      className="mx-auto"
    >
      <div className="space-y-6">
        <PageHeader
          title={<><Users className="h-5 w-5 text-primary" />顧客管理</>}
          description={`全${totalCount}名の顧客を管理`}
        >
          <HelpButton topic="customer" label="顧客管理マニュアル" />
          <Button onClick={() => {
            setSelectedCustomer(null)
            setIsEditModalOpen(true)
          }} size="sm">
            <UserPlus className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">新規顧客</span>
            <span className="sm:hidden">新規</span>
          </Button>
        </PageHeader>

        {/* 検索バー */}
        <SearchInput
          placeholder="顧客名、メール、電話番号で検索..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        {/* 顧客一覧 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight">顧客一覧 ({totalCount}件)</h2>
          </div>

          {loading ? (
            <ListSkeleton variant="table" rows={8} />
          ) : customers.length === 0 ? (
            <EmptyState
              icon={Users}
              title={searchTerm ? '該当する顧客が見つかりません' : '顧客がまだ登録されていません'}
            />
          ) : (
            <div className="space-y-2">
              {/* テーブルヘッダー (PCのみ) */}
              <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 bg-muted/50 rounded-lg text-xs font-medium text-muted-foreground">
                <div className="col-span-2">顧客名</div>
                <div className="col-span-2">メールアドレス</div>
                <div className="col-span-2">電話番号</div>
                <div className="col-span-1 text-center">予約数</div>
                <div className="col-span-1 text-center">クーポン</div>
                <div className="col-span-1 text-center">来店</div>
                <div className="col-span-1 text-right">累計支払額</div>
                <div className="col-span-1">最終来店日</div>
                <div className="col-span-1 text-center">詳細</div>
              </div>

              {/* 顧客行 */}
              {customers.map((customer) => (
                <CustomerRow
                  key={customer.id}
                  customer={customer}
                  isExpanded={expandedCustomerId === customer.id}
                  onToggleExpand={() => handleToggleExpand(customer.id)}
                  onEdit={() => handleEdit(customer)}
                  couponStats={couponStats[customer.id]}
                />
              ))}
            </div>
          )}

          {/* ページネーション */}
          {!loading && totalCount > pageSize && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <div className="text-xs text-muted-foreground">
                {(page - 1) * pageSize + 1}〜{Math.min(page * pageSize, totalCount)} / {totalCount}件
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                >
                  前へ
                </Button>
                <span className="text-xs tabular-nums">
                  {page} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                >
                  次へ
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* 編集モーダル */}
        <CustomerEditModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false)
            setSelectedCustomer(null)
          }}
          customer={selectedCustomer}
          onSave={refreshCustomers}
        />
      </div>
    </AppLayout>
  )
}
