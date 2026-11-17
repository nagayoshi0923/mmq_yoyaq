import { useMemo, useState, type MouseEvent } from 'react'
import { Heart } from 'lucide-react'
import { ScenarioCardImage } from '@/components/public-top/ScenarioCardImage'
import { NEW_ARRIVAL_CHIP } from '@/components/public-top/newArrivals'
import { cn } from '@/lib/utils'
import { durationLabel, playersLabel } from './labels'

export interface CatalogItem {
  id: string
  /** 押したときに開く作品の slug（無ければ id） */
  key: string
  title: string
  key_visual_url?: string | null
  player_count_min: number
  player_count_max: number
  duration?: number | null
  /** 並び順「公演開始が新しい順」の日付（YYYY-MM-DD…） */
  sortDate?: string | null
}

interface CatalogViewProps {
  /** 「全国の」「この組織の」 */
  scopeLabel: string
  /** カテゴリ・検索語で絞って並べた作品（新作を選んでいるときは新作の並び） */
  items: CatalogItem[]
  isPending: boolean
  /** テーマ（カテゴリ）の選択肢。「新作」を含んでよい（上のチップに出すので下の列からは外す） */
  genres: string[]
  selectedCategories: string[]
  onCategoriesChange: (list: string[]) => void
  searchTerm: string
  onClearSearch: () => void
  /** ログイン中か（「遊んでいない作品」を出す） */
  loggedIn: boolean
  isNew: (id: string) => boolean
  isPlayed: (id: string) => boolean
  isFavorite: (id: string) => boolean
  onToggleFavorite: (id: string, e: MouseEvent) => void
  onOpen: (item: CatalogItem) => void
  onBack: () => void
}

const PLAYER_FILTERS = [
  { value: 'all', label: '指定なし' },
  { value: 'upto4', label: '〜4人' },
  { value: '5to6', label: '5〜6人' },
  { value: '7plus', label: '7人〜' },
] as const
type PlayerBand = typeof PLAYER_FILTERS[number]['value']

function matchesPlayerBand(it: Pick<CatalogItem, 'player_count_min' | 'player_count_max'>, band: PlayerBand): boolean {
  if (band === 'upto4') return it.player_count_min <= 4
  if (band === '5to6') return it.player_count_min <= 6 && it.player_count_max >= 5
  if (band === '7plus') return it.player_count_max >= 7
  return true
}

const chipClass = (on: boolean) => cn(
  'inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm transition-colors',
  on ? 'border-[#111] bg-[#111] font-bold text-white' : 'border-gray-300 bg-white hover:bg-gray-50',
)

/**
 * 作品一覧（刷新版。QW-20261114-001、Figma プロトタイプ「作品一覧（MMQ全国）」）。全体カタログ・組織カタログで共通。
 * 上の白い枠: 新作／すべての作品／初心者向け／遊んでいない作品、テーマのチップ、件数、2 列のカード。
 * その下に「人数で絞る」「並び順」の枠。新作・初心者向け・テーマは URL の genre= に持つ（トップの「すべて見る」と同じ）。
 */
export function CatalogView({
  scopeLabel, items, isPending, genres, selectedCategories, onCategoriesChange, searchTerm, onClearSearch, loggedIn,
  isNew, isPlayed, isFavorite, onToggleFavorite, onOpen, onBack,
}: CatalogViewProps) {
  const [playerBand, setPlayerBand] = useState<PlayerBand>('all')
  const [sortOrder, setSortOrder] = useState<'release' | 'name'>('release')
  const [unplayedOnly, setUnplayedOnly] = useState(false)

  const isNewMode = selectedCategories.includes(NEW_ARRIVAL_CHIP)
  const beginnerGenre = genres.find((g) => g.includes('初心者')) ?? null
  const themeGenres = genres.filter((g) => g !== NEW_ARRIVAL_CHIP && g !== beginnerGenre)
  const mode = unplayedOnly ? 'unplayed' : isNewMode ? 'new' : beginnerGenre && selectedCategories.includes(beginnerGenre) ? 'beginner' : 'all'

  const listed = useMemo(() => {
    let list = items.filter((it) => matchesPlayerBand(it, playerBand))
    if (unplayedOnly) list = list.filter((it) => !isPlayed(it.id))
    if (sortOrder === 'name') list = [...list].sort((x, y) => x.title.localeCompare(y.title, 'ja'))
    else if (!isNewMode) list = [...list].sort((x, y) => (y.sortDate ?? '').slice(0, 10).localeCompare((x.sortDate ?? '').slice(0, 10)))
    return list
  }, [items, playerBand, unplayedOnly, isPlayed, sortOrder, isNewMode])

  const setMode = (next: 'new' | 'all' | 'beginner' | 'unplayed') => {
    const keep = selectedCategories.filter((g) => g !== NEW_ARRIVAL_CHIP && g !== beginnerGenre)
    if (next === 'new') keep.push(NEW_ARRIVAL_CHIP)
    if (next === 'beginner' && beginnerGenre) keep.push(beginnerGenre)
    onCategoriesChange([...new Set(keep)])
    setUnplayedOnly(next === 'unplayed')
  }
  const toggleTheme = (g: string) => onCategoriesChange(selectedCategories.includes(g) ? selectedCategories.filter((x) => x !== g) : [...selectedCategories, g])

  const countLabel = mode === 'new'
    ? `${scopeLabel}新作 ${listed.length}作品（公演開始が新しい順）`
    : `${scopeLabel}${mode === 'beginner' ? '初心者向けの' : mode === 'unplayed' ? 'まだ遊んでいない' : ''}作品 ${listed.length}作品`

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-12 max-w-4xl items-center gap-2 px-2">
          <button type="button" onClick={onBack} aria-label="戻る" data-testid="back" className="flex h-10 w-10 items-center justify-center text-xl">‹</button>
          <h1 className="text-base font-bold">作品一覧</h1>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-3 px-3 py-3">
        <section className="rounded-lg bg-white p-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="表示する作品" data-testid="category-chips">
            <button type="button" data-chip={NEW_ARRIVAL_CHIP} data-selected={mode === 'new' || undefined} aria-pressed={mode === 'new'} className={chipClass(mode === 'new')} onClick={() => setMode(mode === 'new' ? 'all' : 'new')}>新作</button>
            <button type="button" data-chip="すべて" aria-pressed={mode === 'all'} className={chipClass(mode === 'all')} onClick={() => setMode('all')}>すべての作品</button>
            {beginnerGenre && (
              <button type="button" data-chip={beginnerGenre} data-selected={mode === 'beginner' || undefined} aria-pressed={mode === 'beginner'} className={chipClass(mode === 'beginner')} onClick={() => setMode(mode === 'beginner' ? 'all' : 'beginner')}>初心者向け</button>
            )}
            {loggedIn && (
              <button type="button" aria-pressed={mode === 'unplayed'} className={chipClass(mode === 'unplayed')} onClick={() => setMode(mode === 'unplayed' ? 'all' : 'unplayed')}>遊んでいない作品</button>
            )}
          </div>
          {themeGenres.length > 0 && (
            <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 scroll-row" role="group" aria-label="テーマ" data-testid="theme-chips">
              {themeGenres.map((g) => {
                const on = selectedCategories.includes(g)
                return (
                  <button key={g} type="button" data-chip={g} data-selected={on || undefined} aria-pressed={on} className={cn(chipClass(on), 'h-8 px-3 text-xs')} onClick={() => toggleTheme(g)}>
                    {g}
                  </button>
                )
              })}
            </div>
          )}
          {searchTerm && (
            <p className="mt-3 text-sm">
              「{searchTerm}」で探しています
              <button type="button" className="ml-2 underline underline-offset-4" onClick={onClearSearch}>外す</button>
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{isPending ? '読み込み中…' : countLabel}</p>

          {isPending ? (
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse bg-muted" />)}
            </div>
          ) : listed.length === 0 ? (
            <div className="mt-3 bg-muted/50 p-6 text-center text-sm text-muted-foreground">該当するシナリオが見つかりませんでした。</div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3">
              {listed.map((it) => (
                <div
                  key={it.id}
                  role="link"
                  tabIndex={0}
                  aria-label={it.title}
                  className="min-w-0 cursor-pointer"
                  onClick={() => onOpen(it)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onOpen(it) }}
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden">
                    <ScenarioCardImage src={it.key_visual_url} alt={it.title} />
                    <button
                      type="button"
                      aria-label={isFavorite(it.id) ? '遊びたいから外す' : '遊びたいに入れる'}
                      aria-pressed={isFavorite(it.id)}
                      onClick={(e) => onToggleFavorite(it.id, e)}
                      className="absolute right-1.5 top-1.5 rounded-full bg-black/40 p-1.5"
                    >
                      <Heart className={cn('h-4 w-4', isFavorite(it.id) ? 'fill-red-500 text-red-500' : 'text-white')} />
                    </button>
                  </div>
                  {isNew(it.id) && <span className="mt-2 inline-block border border-[#003437] px-1.5 text-[11px] font-bold text-[#003437]">新作</span>}
                  <h3 className="mt-1.5 line-clamp-2 text-sm font-bold leading-snug">{it.title}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[playersLabel(it.player_count_min, it.player_count_max), durationLabel(it.duration), isPlayed(it.id) ? '遊んだ' : null].filter(Boolean).join('・')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg bg-white p-4">
          <h2 className="text-base font-bold">人数で絞る</h2>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="人数">
            {PLAYER_FILTERS.map((f) => (
              <button key={f.value} type="button" aria-pressed={playerBand === f.value} className={chipClass(playerBand === f.value)} onClick={() => setPlayerBand(f.value)}>{f.label}</button>
            ))}
          </div>
        </section>

        <section className="rounded-lg bg-white p-4">
          <h2 className="text-base font-bold">並び順</h2>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="並び順">
            <button type="button" aria-pressed={sortOrder === 'release'} className={chipClass(sortOrder === 'release')} onClick={() => setSortOrder('release')}>公演開始が新しい順</button>
            <button type="button" aria-pressed={sortOrder === 'name'} className={chipClass(sortOrder === 'name')} onClick={() => setSortOrder('name')}>名前順</button>
          </div>
        </section>
      </div>
    </>
  )
}
