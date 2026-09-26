import { PageHeader } from '@/components/layout/PageHeader'
import { BookingCutoffSection } from '@/components/modals/ScenarioEditDialogV2/sections/BookingCutoffSection'
import '@/components/modals/ScenarioEditDialogV2.css'

export function BookingCutoffSettings() {
  return <div className="space-y-6 max-w-4xl pb-12">
    <PageHeader title="通常予約の受付締切" description="組織共通 → シナリオの個別指定 → 公演の個別指定の順に設定します。" />
    <BookingCutoffSection common />
  </div>
}
