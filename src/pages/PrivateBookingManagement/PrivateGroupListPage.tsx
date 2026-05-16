import { AppLayout } from '@/components/layout/AppLayout'
import { PrivateGroupList } from './components/PrivateGroupList'

export default function PrivateGroupListPage() {
  return (
    <AppLayout
      currentPage="private-booking-groups"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
    >
      <PrivateGroupList />
    </AppLayout>
  )
}
