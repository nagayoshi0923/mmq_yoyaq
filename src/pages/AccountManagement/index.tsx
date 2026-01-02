/**
 * @page アカウント管理
 * @path #accounts
 * @purpose ユーザー（スタッフ/管理者）と顧客の統合管理
 * @access admin
 * @organization 全組織
 */
import { useMemo } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { UnifiedSidebar, SidebarMenuItem } from '@/components/layout/UnifiedSidebar'
import { Users, UserCog } from 'lucide-react'
import { useSessionState } from '@/hooks/useSessionState'

// サブページコンポーネント
import { UserManagementContent } from './pages/UserManagementContent'
import { CustomerManagementContent } from './pages/CustomerManagementContent'

// サイドバーメニュー項目
const ACCOUNT_MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'users', label: 'ユーザー', icon: UserCog, description: 'スタッフ・管理者のアカウント' },
  { id: 'customers', label: '顧客', icon: Users, description: '予約顧客の管理' },
]

export function AccountManagement() {
  const [activeTab, setActiveTab] = useSessionState('accountManagementActiveTab', 'users')

  const renderContent = () => {
    switch (activeTab) {
      case 'users':
        return <UserManagementContent />
      case 'customers':
        return <CustomerManagementContent />
      default:
        return <UserManagementContent />
    }
  }

  return (
    <AppLayout
      currentPage="accounts"
      sidebar={
        <UnifiedSidebar
          title="アカウント管理"
          mode="list"
          menuItems={ACCOUNT_MENU_ITEMS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      }
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      {renderContent()}
    </AppLayout>
  )
}

export default AccountManagement

