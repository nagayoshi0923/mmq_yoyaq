import { CustomerListControls, CustomerTableHeader } from '@/pages/CustomerManagement/components/CustomerListControls'
/**
 * 顧客管理コンテンツ
 * 予約顧客の情報管理
 */
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { HelpButton } from '@/components/ui/help-button'
import { UserPlus, Search } from 'lucide-react'
import { useCustomerData } from '@/pages/CustomerManagement/hooks/useCustomerData'
import { CustomerRow } from '@/pages/CustomerManagement/components/CustomerRow'
import { CustomerEditModal } from '@/pages/CustomerManagement/components/CustomerEditModal'
import type { Customer } from '@/types'
import { useOrganization } from '@/hooks/useOrganization'
import { canEditCustomer } from '@/pages/CustomerManagement/utils/customerEditAccess'

export function CustomerManagementContent() {
  const [searchTerm, setSearchTerm] = useState('')
  const {
    organizationId,
    error,
    customers,
    loading,
    couponStats,
    refreshCustomers,
    totalCount,
    page,
    setPage,
    pageSize,
    options, setOptions, toggleSort,
  } = useCustomerData(searchTerm)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null)

  useEffect(() => {
    setIsEditModalOpen(false)
    setSelectedCustomer(null)
    setExpandedCustomerId(null)
  }, [organizationId])

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  const { isLicenseManager } = useOrganization()

  const handleEdit = (customer: Customer) => {
    setSelectedCustomer(customer)
    setIsEditModalOpen(true)
  }

  const handleToggleExpand = (customerId: string) => {
    setExpandedCustomerId(expandedCustomerId === customerId ? null : customerId)
  }

  return (
    <div className="space-y-6">
      {/* アクション行（タイトルは外側 PageHeader に集約） */}
      <div className="flex items-center justify-end gap-2">
        <HelpButton topic="customer" label="顧客管理マニュアル" />
        <Button onClick={() => {
          setSelectedCustomer(null)
          setIsEditModalOpen(true)
        }} size="sm">
          <UserPlus className="mr-1 h-4 w-4" />
          <span className="hidden sm:inline">新規顧客</span>
          <span className="sm:hidden">新規</span>
        </Button>
      </div>

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

        <CustomerListControls options={options} onChange={setOptions} />

      {/* 顧客一覧 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">顧客一覧 ({totalCount}件)</h2>
        </div>

        <p className="text-sm text-muted-foreground">確定・GM確定・完了した予約の割引後金額です。取消予約は含まず、入金額・返金後の残高とは異なります。「要確認」は金額を確定できない旧予約を含みます。</p>

        {error ? (
          <div role="alert" className="space-y-2">
            <p>顧客情報を取得できませんでした。条件を確認して再試行してください。</p>
            <Button variant="outline" onClick={() => refreshCustomers()}>再試行</Button>
          </div>
        ) : loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">読み込み中...</div>
        ) : customers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {'条件に一致する顧客が見つかりません'}
          </div>
        ) : (
          <div className="space-y-2">
            {/* テーブルヘッダー (PCのみ) */}
              <CustomerTableHeader options={options} onSort={toggleSort} />

            {/* 顧客行 */}
            {customers.map((customer) => (
              <CustomerRow
                key={customer.id}
                customer={customer}
                isExpanded={expandedCustomerId === customer.id}
                onToggleExpand={() => handleToggleExpand(customer.id)}
                onEdit={() => handleEdit(customer)}
                canEdit={canEditCustomer(customer, organizationId, isLicenseManager)}
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

