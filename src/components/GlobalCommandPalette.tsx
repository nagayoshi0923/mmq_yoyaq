import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Calendar, Users, BookOpen, LayoutDashboard,
  Store, UserCheck, Settings, BarChart3, Tag, Keyboard,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface CustomerResult {
  id: string
  name: string
  email: string | null
  phone: string | null
}

interface ReservationResult {
  id: string
  reservation_number: string | null
  customer_name: string | null
  title: string | null
  status: string | null
  actual_datetime: string | null
}

const ADMIN_PAGES = [
  { id: 'dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { id: 'schedule', label: 'スケジュール管理', icon: Calendar },
  { id: 'reservations', label: '予約管理', icon: BookOpen },
  { id: 'customer-management', label: '顧客管理', icon: Users },
  { id: 'scenarios', label: 'シナリオ管理', icon: Tag },
  { id: 'stores', label: '店舗管理', icon: Store },
  { id: 'staff', label: 'スタッフ管理', icon: UserCheck },
  { id: 'sales', label: '売上管理', icon: BarChart3 },
  { id: 'settings', label: '設定', icon: Settings },
]

const STATUS_LABEL: Record<string, string> = {
  pending: '仮予約',
  confirmed: '確定',
  gm_confirmed: 'GM確認済',
  checked_in: '来店済',
  cancelled: 'キャンセル',
  no_show: '無断欠席',
}

// ショートカット一覧（ヘルプダイアログ用）
const SHORTCUT_GROUPS = [
  {
    heading: 'グローバル',
    items: [
      { keys: ['⌘', 'K'], label: 'グローバル検索を開く' },
      { keys: ['?'], label: 'キーボードショートカット一覧' },
    ],
  },
  {
    heading: 'スケジュール管理',
    items: [
      { keys: ['←'], label: '前月へ移動' },
      { keys: ['→'], label: '次月へ移動' },
      { keys: ['T'], label: '今月へ戻る' },
    ],
  },
]

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 text-[11px] font-mono font-medium bg-muted border border-border rounded shadow-sm">
      {children}
    </kbd>
  )
}

function ShortcutsHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="h-4 w-4" />
            キーボードショートカット
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.heading}>
              <p className="text-xs font-medium text-muted-foreground mb-2">{group.heading}</p>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-sm">{item.label}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((k, i) => (
                        <Kbd key={i}>{k}</Kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function GlobalCommandPalette() {
  const [open, setOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<CustomerResult[]>([])
  const [reservations, setReservations] = useState<ReservationResult[]>([])
  const [loading, setLoading] = useState(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { user } = useAuth()
  const { organizationId, organization } = useOrganization()
  const navigate = useNavigate()

  const orgSlug = organization?.slug

  // Cmd+K → 検索パレット / ? → ショートカット一覧
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const tag = target.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
        return
      }

      if (e.key === '?' && !inInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setHelpOpen(prev => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 閉じたらクエリをリセット
  const handleOpenChange = useCallback((value: boolean) => {
    setOpen(value)
    if (!value) {
      setQuery('')
      setCustomers([])
      setReservations([])
    }
  }, [])

  // 検索（デバウンス付き）
  useEffect(() => {
    if (!query.trim() || !organizationId) {
      setCustomers([])
      setReservations([])
      return
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    debounceTimer.current = setTimeout(async () => {
      setLoading(true)
      const q = `%${query.trim()}%`

      const [customerRes, reservationRes] = await Promise.all([
        supabase
          .from('customers')
          .select('id, name, email, phone')
          .eq('organization_id', organizationId)
          .or(`name.ilike.${q},email.ilike.${q},phone.ilike.${q}`)
          .limit(5),
        supabase
          .from('reservations')
          .select('id, reservation_number, customer_name, title, status, actual_datetime')
          .eq('organization_id', organizationId)
          .or(`customer_name.ilike.${q},reservation_number.ilike.${q},title.ilike.${q}`)
          .order('actual_datetime', { ascending: false })
          .limit(5),
      ])

      setCustomers((customerRes.data as CustomerResult[]) ?? [])
      setReservations((reservationRes.data as ReservationResult[]) ?? [])
      setLoading(false)
    }, 300)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [query, organizationId])

  const navigateTo = useCallback((path: string) => {
    navigate(path)
    setOpen(false)
    setQuery('')
  }, [navigate])

  // スタッフ以外には表示しない（顧客ユーザー等）
  if (!user || !orgSlug) return null

  return (
    <>
      <CommandDialog open={open} onOpenChange={handleOpenChange}>
        <CommandInput
          placeholder="ページ、顧客名、予約番号を検索..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {!query.trim() && (
            <CommandGroup heading="ページ">
              {ADMIN_PAGES.map((page) => (
                <CommandItem
                  key={page.id}
                  value={page.label}
                  onSelect={() => navigateTo(`/${orgSlug}/${page.id}`)}
                >
                  <page.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {page.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {!query.trim() && (
            <>
              <CommandSeparator />
              <CommandGroup heading="その他">
                <CommandItem
                  value="キーボードショートカット一覧"
                  onSelect={() => { setOpen(false); setHelpOpen(true) }}
                >
                  <Keyboard className="mr-2 h-4 w-4 text-muted-foreground" />
                  キーボードショートカット一覧
                  <CommandShortcut>?</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            </>
          )}

          {query.trim() && !loading && customers.length === 0 && reservations.length === 0 && (
            <CommandEmpty>「{query}」に一致する結果が見つかりません</CommandEmpty>
          )}

          {query.trim() && loading && (
            <div className="py-6 text-center text-sm text-muted-foreground">検索中...</div>
          )}

          {customers.length > 0 && (
            <CommandGroup heading="顧客">
              {customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`customer-${c.id}-${c.name}`}
                  onSelect={() => navigateTo(`/${orgSlug}/customer-management?search=${encodeURIComponent(c.name)}`)}
                >
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{c.name}</span>
                  {(c.email || c.phone) && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {c.email ?? c.phone}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {customers.length > 0 && reservations.length > 0 && <CommandSeparator />}

          {reservations.length > 0 && (
            <CommandGroup heading="予約">
              {reservations.map((r) => (
                <CommandItem
                  key={r.id}
                  value={`reservation-${r.id}-${r.customer_name ?? ''}-${r.reservation_number ?? ''}`}
                  onSelect={() => navigateTo(`/${orgSlug}/reservations?search=${encodeURIComponent(r.reservation_number ?? r.customer_name ?? '')}`)}
                >
                  <BookOpen className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{r.customer_name ?? r.title ?? '予約'}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {r.reservation_number && `#${r.reservation_number}`}
                    {r.status && ` · ${STATUS_LABEL[r.status] ?? r.status}`}
                  </span>
                  {r.actual_datetime && (
                    <CommandShortcut>
                      {new Date(r.actual_datetime).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                    </CommandShortcut>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>

      <ShortcutsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  )
}
