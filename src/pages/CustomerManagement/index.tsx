import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { HelpButton } from '@/components/ui/help-button'
import { UserPlus, Search, Users } from 'lucide-react'
import { useCustomerData } from './hooks/useCustomerData'
import { CustomerRow } from './components/CustomerRow'
import { CustomerEditModal } from './components/CustomerEditModal'
import type { Customer } from '@/types'

export default function CustomerManagement() {
  const { customers, loading, refreshCustomers } = useCustomerData()
  const [searchTerm, setSearchTerm] = useState('')
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null)

  // フィルタリング
  const filteredCustomers = customers.filter((customer) => {
    const search = searchTerm.toLowerCase()
    return (
      customer.name.toLowerCase().includes(search) ||
      customer.email?.toLowerCase().includes(search) ||
      customer.phone?.includes(search)
    )
  })

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
          title={
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">顧客管理</span>
            </div>
          }
          description={`全${customers.length}名の顧客を管理`}
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
            <h2 className="text-lg font-bold tracking-tight">顧客一覧 ({filteredCustomers.length}件)</h2>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">読み込み中...</div>
          ) : filteredCustomers.length === 0 ? (
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
                <div className="col-span-1 text-center">来店</div>
                <div className="col-span-2 text-right">累計支払額</div>
                <div className="col-span-2">最終来店日</div>
                <div className="col-span-1 text-center">詳細</div>
              </div>

              {/* 顧客行 */}
              {filteredCustomers.map((customer) => (
                <CustomerRow
                  key={customer.id}
                  customer={customer}
                  isExpanded={expandedCustomerId === customer.id}
                  onToggleExpand={() => handleToggleExpand(customer.id)}
                  onEdit={() => handleEdit(customer)}
                />
              ))}
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
