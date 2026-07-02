/**
 * 顧客管理コンテンツ
 * 予約顧客の情報管理
 */
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { HelpButton } from '@/components/ui/help-button'
import { UserPlus, Search, Users } from 'lucide-react'
import { useCustomerData } from '@/pages/CustomerManagement/hooks/useCustomerData'
import { CustomerRow } from '@/pages/CustomerManagement/components/CustomerRow'
import { CustomerEditModal } from '@/pages/CustomerManagement/components/CustomerEditModal'
import type { Customer } from '@/types'

export function CustomerManagementContent() {
  const [searchTerm, setSearchTerm] = useState('')
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
    <div className="space-y-6">
      <PageHeader
        title={<><Users className="h-5 w-5 text-primary" />顧客</>}
        description={`全${totalCount}名の予約顧客を管理`}
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
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="顧客名、メール、電話番号で検索..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-10 bg-white w-full max-w-md"
        />
      </div>

      {/* 顧客一覧 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">顧客一覧 ({totalCount}件)</h2>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">読み込み中...</div>
        ) : customers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {searchTerm ? '該当する顧客が見つかりません' : '顧客がまだ登録されていません'}
          </div>
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
  )
}

