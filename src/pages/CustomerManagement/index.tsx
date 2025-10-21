import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, UserPlus, ChevronDown, ChevronUp } from 'lucide-react'
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
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">顧客管理</h1>
        <Button onClick={() => {
          setSelectedCustomer(null)
          setIsEditModalOpen(true)
        }}>
          <UserPlus className="mr-2 h-4 w-4" />
          新規顧客
        </Button>
      </div>

      {/* 検索バー */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="顧客名、メール、電話番号で検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* 顧客一覧 */}
      <Card>
        <CardHeader>
          <CardTitle>顧客一覧 ({filteredCustomers.length}件)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">読み込み中...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? '該当する顧客が見つかりません' : '顧客がまだ登録されていません'}
            </div>
          ) : (
            <div className="space-y-2">
              {/* テーブルヘッダー */}
              <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-muted/50 rounded-lg text-sm font-medium">
                <div className="col-span-2">顧客名</div>
                <div className="col-span-2">メールアドレス</div>
                <div className="col-span-2">電話番号</div>
                <div className="col-span-1 text-center">来店回数</div>
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
        </CardContent>
      </Card>

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

