import { useEffect, useState } from 'react'
import { platformMasterApi, type MasterOrganization } from '@/lib/api/platformMasterApi'

/**
 * マスターだけに出す「組織の切り替え」。切り替えると、その組織の管理者と同じ画面になる。
 * 組織の情報は画面側で覚えているので、切り替えたら切り替え先のダッシュボードを読み込み直す。
 */
export function MasterOrgSwitcher({ navigateTo = (path: string) => window.location.assign(path) }: { navigateTo?: (path: string) => void }) {
  const [organizations, setOrganizations] = useState<MasterOrganization[] | null>(null)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!(await platformMasterApi.isMaster())) return
      const { data, error: listError } = await platformMasterApi.listOrganizations()
      if (!cancelled && !listError && Array.isArray(data)) setOrganizations(data as MasterOrganization[])
    })()
    return () => { cancelled = true }
  }, [])

  if (!organizations || organizations.length < 2) return null
  const current = organizations.find(o => o.is_current)

  const onChange = async (id: string) => {
    if (!id || id === current?.id) return
    setSwitching(true); setError(null)
    const { data, error: switchError } = await platformMasterApi.switchOrganization(id)
    if (switchError || typeof data !== 'string') { setSwitching(false); setError('切り替えられませんでした'); return }
    navigateTo(`/${data}/dashboard`)
  }

  return (
    <div className="px-3 py-2 border-b border-border">
      <label htmlFor="master-org-switcher" className="block text-xs text-muted-foreground mb-1">表示中の組織（マスター）</label>
      <select
        id="master-org-switcher"
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
        value={current?.id ?? ''}
        disabled={switching}
        onChange={e => void onChange(e.target.value)}
      >
        {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
