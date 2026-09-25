import { PageHeader } from '@/components/layout/PageHeader'
import { SectionTitle } from '@/components/settings/SectionTitle'
import { OperatingTextSettings } from '@/components/settings/OperatingTextSettings'
import { PAYMENT_SETTING_FIELDS } from '@/components/settings/operatingSettingFields'
import { CreditCard } from 'lucide-react'

export function ReservationSettings({ storeId, common = false }: { storeId?: string; common?: boolean }) {
  return <div className="space-y-6 max-w-4xl pb-12">
    <PageHeader title="支払い方法の案内" description={common
      ? '組織共通の案内です。店舗・シナリオ・公演で個別指定できます。'
      : '店舗で個別指定した項目を使い、それ以外は組織共通の案内を引き継ぎます。'} />
    {!common && !storeId ? <p>設定する店舗を選択してください。組織全体の初期値は「組織共通」の支払い方法の案内から変更できます。</p>
      : <section className="bg-white rounded-xl border p-6 space-y-4">
        <SectionTitle icon={CreditCard} label="予約時に表示する支払い方法" description="シナリオ・公演に個別指定がある場合は、その案内を優先します。" />
        <OperatingTextSettings scope={common ? 'organization' : 'store'} targetId={storeId} fields={PAYMENT_SETTING_FIELDS} />
      </section>}
  </div>
}
