import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ScenarioMarks } from './useScenarioMarks'
import { BEGINNER_GENRES } from '@/lib/publicPerformanceSearch'
import { ChipButton } from './ChipButton'
import { ScenarioCard } from './ScenarioCard'
import type { ScenarioCardData } from './scenarioCards'
import { TopSection } from './TopSection'

/** 「作品から探す」の 1 作品（店舗トップ・全体トップで共通） */
export interface BrowseScenario {
  id: string
  title: string
  author: string
  genres: string[]
  player_count_min: number
  player_count_max: number
  is_new: boolean
  is_popular: boolean
  /** 並び順（次回公演日。無ければ後ろ） */
  next_date: string | null
  /** 本番の作品カードの中身（帯・次回公演も出す） */
  card: ScenarioCardData
}

interface BrowseTag {
  key: string
  label: string
  /** カタログへ渡すジャンル（無ければカタログは絞らない） */
  genre?: string
  match: (s: BrowseScenario) => boolean
}

/** ジャンルに入っているが、ジャンルのチップとしては出さないもの（別のチップで扱う） */
const META_GENRES = new Set(['新作', 'オススメ', 'ロングセラー', ...BEGINNER_GENRES])
/** PC は 4 列 × 2 段。スマホは 2 列 × 2 段（見本どおり 4 枚、残りは「すべての作品を見る」へ） */
const GRID_COUNT = 8
const MOBILE_COUNT = 4

interface ScenarioBrowseSectionProps {
  scenarios: BrowseScenario[]
  catalogPath: string
  /** 右上のリンクの文字（既定「すべて（N）›」） */
  allLabel?: (count: number) => string
  /** カードの下の注記 */
  footnote?: string
  /** キーワードを渡して開くカタログの URL（無ければ欄内の絞り込みだけ） */
  searchPath?: (keyword: string) => string
  /** ログイン中だけ: 遊びたい・体験済み */
  marks?: ScenarioMarks | null
  primaryColor: string
  /** 下のボタンの文字（既定「すべての作品を見る」） */
  allButtonLabel?: string
  onOpen: (card: ScenarioCardData) => void
}

/** 作品から探す（タグと、本番の作品カードを 2 列で。すべては既存のカタログへ） */
export function ScenarioBrowseSection({ scenarios, catalogPath, allLabel = (n) => `すべて（${n}）›`, footnote, searchPath, marks, primaryColor, allButtonLabel = 'すべての作品を見る', onOpen }: ScenarioBrowseSectionProps) {
  const [tagKey, setTagKey] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const term = keyword.trim().toLowerCase()

  const tags = useMemo<BrowseTag[]>(() => {
    const list: BrowseTag[] = [
      { key: 'new', label: '新作', genre: '新作', match: (s) => s.is_new },
      { key: 'popular', label: '人気', match: (s) => s.is_popular },
      { key: 'beginner', label: '初心者向け', genre: '初心者におすすめ', match: (s) => s.genres.some((g) => BEGINNER_GENRES.includes(g)) },
    ]
    const counts = new Map<string, number>()
    scenarios.forEach((s) => s.genres.forEach((g) => { if (!META_GENRES.has(g)) counts.set(g, (counts.get(g) ?? 0) + 1) }))
    ;[...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([g]) => {
      list.push({ key: `genre:${g}`, label: g, genre: g, match: (s) => s.genres.includes(g) })
    })
    ;[4, 6, 8].forEach((n) => {
      list.push({ key: `players:${n}`, label: `${n} 人`, match: (s) => s.player_count_min <= n && n <= s.player_count_max })
    })
    return list.filter((t) => scenarios.some(t.match))
  }, [scenarios])

  const activeTag = tags.find((t) => t.key === tagKey) ?? null
  const shown = useMemo(() => {
    const byTag = activeTag ? scenarios.filter(activeTag.match) : scenarios
    const filtered = term
      ? byTag.filter((s) => s.title.toLowerCase().includes(term) || s.author.toLowerCase().includes(term))
      : byTag
    return [...filtered].sort((a, b) => {
      if (a.next_date && b.next_date) return a.next_date.localeCompare(b.next_date)
      if (a.next_date) return -1
      if (b.next_date) return 1
      return a.title.localeCompare(b.title, 'ja')
    }).slice(0, GRID_COUNT)
  }, [activeTag, scenarios, term])

  const allPath = activeTag?.genre ? `${catalogPath}?genre=${encodeURIComponent(activeTag.genre)}` : catalogPath

  return (
    <TopSection id="scenarios" title="作品から探す" aside={<Link to={allPath} className="hover:underline">{allLabel(scenarios.length)}</Link>}>
      <form
        role="search"
        className="mb-2"
        onSubmit={(e) => { e.preventDefault() }}
      >
        <label className="flex items-center gap-2 rounded-md border border-input bg-white px-2.5 py-1.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="text"
            enterKeyHint="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="作品名・作者で検索"
            aria-label="作品名・作者で検索"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
          />
          {keyword && (
            <button type="button" aria-label="検索をクリア" onClick={() => setKeyword('')} className="text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
      </form>
      <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1 scroll-row">
        {tags.map((t) => (
          <ChipButton key={t.key} selected={t.key === tagKey} primaryColor={primaryColor} className="px-2.5 py-1 text-xs" onClick={() => setTagKey(t.key === tagKey ? null : t.key)}>
            {t.label}
          </ChipButton>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {shown.map((s, i) => (
          <ScenarioCard key={s.id} card={s.card} marks={marks} onOpen={onOpen} className={cn(i >= MOBILE_COUNT && 'hidden md:block')} />
        ))}
      </div>
      {shown.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {term ? `「${keyword.trim()}」に合う作品はこの中にありません。` : '該当する作品がありません。'}
        </p>
      )}
      {term && searchPath && (
        <Link to={searchPath(keyword.trim())} className="mt-2 block text-center text-xs text-muted-foreground hover:underline">
          「{keyword.trim()}」をカタログで探す ›
        </Link>
      )}
      {footnote && <p className="mt-2 text-xs text-muted-foreground">{footnote}</p>}
      {!term && !activeTag && (
        <Link to={allPath} className="mt-2 block w-full rounded-md border border-input bg-white px-4 py-2.5 text-center text-sm font-medium hover:bg-muted">
          {allButtonLabel}
        </Link>
      )}
      {activeTag && (
        <Link to={allPath} className="mt-2 block text-center text-xs text-muted-foreground hover:underline">
          「{activeTag.label}」の作品をカタログで見る ›
        </Link>
      )}
    </TopSection>
  )
}
