import { PageHeader } from '@/components/layout/PageHeader'
import { Link } from 'react-router-dom'
import { useOrganization } from '@/hooks/useOrganization'

interface BusinessHoursSettingsProps {
  storeId?: string
}

export function BusinessHoursSettings({ storeId: _storeId }: BusinessHoursSettingsProps) {
  const { organization } = useOrganization()
  const slug = organization?.slug || ''
  const storesPath = slug ? `/${slug}/stores` : '/stores'

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader
        title="営業時間"
        description="店舗ごとの営業時間と休業は、店舗管理から設定します"
      />
      <section className="bg-white rounded-xl border p-6 space-y-3">
        <p>営業時間・特別営業日・特別休業日・募集停止は、店舗ページの編集モーダルにまとめています。</p>
        <p>
          <Link to={storesPath} className="underline">
            店舗管理
          </Link>
          で店を開き、「営業時間」「休業設定」から変更してください。
        </p>
      </section>
    </div>
  )
}
