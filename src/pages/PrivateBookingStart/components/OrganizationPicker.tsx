import { useState } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { ChipButton } from '@/components/public-top/ChipButton'
import { shortPrefecture } from '@/lib/publicStoreName'
import type { PlatformOrganization } from '@/pages/PlatformTop/hooks/platformTopData'

const SHOWN_STORE_NAMES = 4
const ACCENT = '#7c3aed'

function OrganizationLogo({ org }: { org: PlatformOrganization }) {
  return org.logo_url ? (
    <img src={org.logo_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
  ) : (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-lg font-bold text-muted-foreground">{org.name.slice(0, 1)}</div>
  )
}

function OrganizationSummary({ org }: { org: PlatformOrganization }) {
  const names = org.store_names.slice(0, SHOWN_STORE_NAMES).join('・')
  const more = org.store_count > SHOWN_STORE_NAMES ? ` ほか ${org.store_count} 店舗` : org.store_count > 1 ? ` ${org.store_count} 店舗` : ''
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-bold">{org.name}</div>
      <div className="text-xs text-muted-foreground">{names}{more} ・ {org.scenario_count} 作品</div>
    </div>
  )
}

interface OrganizationListProps {
  organizations: PlatformOrganization[]
  prefectures: string[]
  onSelect: (org: PlatformOrganization) => void
}

/** 組織カードの一覧（エリアのチップで絞る）。押すとその組織を選ぶ */
export function OrganizationList({ organizations, prefectures, onSelect }: OrganizationListProps) {
  const [area, setArea] = useState<string | null>(null)
  const shown = area ? organizations.filter((o) => o.prefectures.includes(area)) : organizations
  return (
    <div data-testid="organization-list">
      {prefectures.length > 1 && (
        <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1 scroll-row" role="group" aria-label="エリアで絞る">
          <ChipButton selected={!area} primaryColor={ACCENT} onClick={() => setArea(null)}>全国</ChipButton>
          {prefectures.map((p) => (
            <ChipButton key={p} selected={area === p} primaryColor={ACCENT} onClick={() => setArea(p)}>{shortPrefecture(p)}</ChipButton>
          ))}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {shown.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onSelect(o)}
            data-org={o.slug}
            className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-white p-2.5 text-left hover:bg-muted/40"
          >
            <OrganizationLogo org={o} />
            <OrganizationSummary org={o} />
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">このエリアの店舗はまだありません。</p>}
    </div>
  )
}

interface SelectedOrganizationProps {
  org: PlatformOrganization
  storeIds: string[]
  onStoreIdsChange: (ids: string[]) => void
  onChangeOrganization: () => void
}

/** 選んだ組織と「希望店舗」のチップ（どれでも可／各店舗。複数選べる） */
export function SelectedOrganization({ org, storeIds, onStoreIdsChange, onChangeOrganization }: SelectedOrganizationProps) {
  const toggle = (id: string) => onStoreIdsChange(storeIds.includes(id) ? storeIds.filter((s) => s !== id) : [...storeIds, id])
  return (
    <div className="space-y-3" data-testid="selected-organization">
      <div className="flex items-center gap-2.5 rounded-lg border-2 bg-white p-2.5" style={{ borderColor: ACCENT }}>
        <OrganizationLogo org={org} />
        <OrganizationSummary org={org} />
        <Check className="h-4 w-4 shrink-0" style={{ color: ACCENT }} aria-label="選択中" />
      </div>
      <button type="button" onClick={onChangeOrganization} className="text-xs text-purple-700 underline" data-testid="choose-another-store">
        別の店舗を選ぶ
      </button>
      {org.stores.length > 1 && (
        <div>
          <p className="mb-1.5 text-xs font-bold">希望店舗（複数選べます）</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="希望店舗">
            <ChipButton selected={storeIds.length === 0} primaryColor={ACCENT} onClick={() => onStoreIdsChange([])}>どれでも可</ChipButton>
            {org.stores.map((s) => (
              <ChipButton key={s.id} selected={storeIds.includes(s.id)} primaryColor={ACCENT} onClick={() => toggle(s.id)}>{s.name}</ChipButton>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">選んだ店舗は、作品ページで作る貸切グループの希望店舗に入ります（あとから変えられます）。</p>
        </div>
      )}
    </div>
  )
}
