import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CustomerListOptions, CustomerSortKey } from '@/types/customerList'

const columns: Array<{ key: CustomerSortKey; label: string; span: string }> = [
  { key: 'name', label: '顧客名', span: 'col-span-2' },
  { key: 'email', label: 'メールアドレス', span: 'col-span-2' },
  { key: 'phone', label: '電話番号', span: 'col-span-2' },
  { key: 'reservation_count', label: '予約数', span: 'col-span-1' },
  { key: 'remaining_coupons', label: 'クーポン', span: 'col-span-1' },
  { key: 'visit_count', label: '来店', span: 'col-span-1' },
  { key: 'reservation_amount', label: '累計予約金額（割引後）', span: 'col-span-1' },
  { key: 'last_visit', label: '最終来店日', span: 'col-span-1' },
]
interface Props { options: CustomerListOptions; onChange: (options: CustomerListOptions) => void }
export function CustomerListControls({ options, onChange }: Props) {
  const numeric = (key: 'minReservations' | 'minVisits' | 'minAmount', label: string) => (
    <label className="space-y-1 text-sm" key={key}>{label}
      <Input type="number" min="0" step="1" aria-label={label} value={options[key] ?? ''}
        onChange={e => onChange({ ...options, [key]: e.target.value === '' ? undefined : Number(e.target.value) })} />
    </label>
  )
  return <div className="space-y-3 rounded-lg border p-3">
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm">並び順
        <select aria-label="並び順" className="block h-10 rounded-md border bg-background px-3" value={options.sortBy ?? 'created_at'} onChange={e => onChange({ ...options, sortBy: e.target.value as CustomerSortKey })}>
          <option value="created_at">登録日時</option>
          {columns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </label>
      <Button variant="outline" onClick={() => onChange({ ...options, sortDir: options.sortDir === 'asc' ? 'desc' : 'asc' })}>{options.sortDir === 'asc' ? '昇順 ↑' : '降順 ↓'}</Button>
      <Button variant="ghost" onClick={() => onChange({ sortBy: 'created_at', sortDir: 'desc' })}>条件をリセット</Button>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {numeric('minReservations', '予約数（件以上）')}
      {numeric('minVisits', '来店回数（回以上）')}
      {numeric('minAmount', '累計予約金額（円以上）')}
      <label className="space-y-1 text-sm">クーポン残数
        <select aria-label="クーポン残数" className="block h-10 w-full rounded-md border bg-background px-3" value={options.hasCoupons === undefined ? '' : String(options.hasCoupons)} onChange={e => onChange({ ...options, hasCoupons: e.target.value === '' ? undefined : e.target.value === 'true' })}>
          <option value="">すべて</option><option value="true">残りあり</option><option value="false">残りなし</option>
        </select>
      </label>
      <label className="space-y-1 text-sm">最終来店日（開始）<Input type="date" aria-label="最終来店日（開始）" value={options.visitFrom ?? ''} onChange={e => onChange({ ...options, visitFrom: e.target.value || undefined })} /></label>
      <label className="space-y-1 text-sm">最終来店日（終了）<Input type="date" aria-label="最終来店日（終了）" value={options.visitTo ?? ''} onChange={e => onChange({ ...options, visitTo: e.target.value || undefined })} /></label>
    </div>
    <p className="text-xs text-muted-foreground">すべての顧客を対象に絞り込み・並び替えます。金額「要確認」は金額条件では対象外です。</p>
  </div>
}
export function CustomerTableHeader({ options, onSort }: { options: CustomerListOptions; onSort: (key: CustomerSortKey) => void }) {
  return <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 bg-muted/50 rounded-lg text-xs font-medium text-muted-foreground">
    {columns.map(c => <button type="button" key={c.key} className={`${c.span} text-left`} onClick={() => onSort(c.key)} aria-label={`${c.label}で並び替え`}>
      {c.label}{options.sortBy === c.key ? options.sortDir === 'asc' ? ' ↑' : ' ↓' : ''}
    </button>)}
    <div className="col-span-1 text-center">詳細</div>
  </div>
}
