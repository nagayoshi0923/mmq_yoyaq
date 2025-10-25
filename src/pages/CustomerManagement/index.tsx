import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AppLayout } from '@/components/layout/AppLayout'
import { UnifiedSidebar, SidebarMenuItem } from '@/components/layout/UnifiedSidebar'
import { Users, UserPlus, Search, Settings } from 'lucide-react'

// サイドバーのメニュー項目定義
const CUSTOMER_MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'customer-list', label: '顧客一覧', icon: Users, description: 'すべての顧客を表示' },
  { id: 'new-customer', label: '新規登録', icon: UserPlus, description: '新しい顧客を追加' },
  { id: 'search', label: '検索', icon: Search, description: '顧客を検索' },
  { id: 'settings', label: '設定', icon: Settings, description: '表示設定' }
]
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
  const [activeTab, setActiveTab] = useState('customer-list')

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

  const handlePageChange = (pageId: string) => {
    window.location.hash = pageId === 'dashboard' ? '' : pageId
  }

  return (
    <AppLayout
      currentPage="customer-management"
      sidebar={
        <UnifiedSidebar
          title="顧客管理"
          mode="list"
          menuItems={CUSTOMER_MENU_ITEMS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      }
      maxWidth="max-w-[1600px]"
      containerPadding="px-8 py-6"
      stickyLayout={true}
    >
      <main className="space-y-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div></div>
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
      </main>
    </AppLayout>
  )
}

