import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BEGINNER_GENRES } from '@/lib/publicPerformanceSearch'
import { ChipButton } from './ChipButton'
import { KeyVisualThumb } from './KeyVisualThumb'
import { TopSection } from './TopSection'

/** 「作品から探す」の 1 作品（店舗トップ・全体トップで共通） */
export interface BrowseScenario {
  id: string
  title: string
  key_visual_url: string | null | undefined
  genres: string[]
  player_count_min: number
  player_count_max: number
  is_new: boolean
  is_popular: boolean
  /** 並び順（次回公演日。無ければ後ろ） */
  next_date: string | null
  /** カードの 2 行目（「次回 10/25」「2 店舗で上演・次回 10/25」など） */
  note: string
  path: string
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
const GRID_COUNT = 12

interface ScenarioBrowseSectionProps {
  scenarios: BrowseScenario[]
  catalogPath: string
  /** 右上のリンクの文字（既定「すべて（N）›」） */
  allLabel?: (count: number) => string
  /** カードの下の注記 */
  footnote?: string
  primaryColor: string
}

/** 作品から探す（タグと 3 列のカード。すべては既存のカタログへ） */
export function ScenarioBrowseSection({ scenarios, catalogPath, allLabel = (n) => `すべて（${n}）›`, footnote, primaryColor }: ScenarioBrowseSectionProps) {
  const [tagKey, setTagKey] = useState<string | null>(null)

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
    const filtered = activeTag ? scenarios.filter(activeTag.match) : scenarios
    return [...filtered].sort((a, b) => {
      if (a.next_date && b.next_date) return a.next_date.localeCompare(b.next_date)
      if (a.next_date) return -1
      if (b.next_date) return 1
      return a.title.localeCompare(b.title, 'ja')
    }).slice(0, GRID_COUNT)
  }, [activeTag, scenarios])

  const allPath = activeTag?.genre ? `${catalogPath}?genre=${encodeURIComponent(activeTag.genre)}` : catalogPath

  return (
    <TopSection id="scenarios" title="作品から探す" aside={<Link to={allPath} className="hover:underline">{allLabel(scenarios.length)}</Link>}>
      <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1 scroll-row">
        {tags.map((t) => (
          <ChipButton key={t.key} selected={t.key === tagKey} primaryColor={primaryColor} className="px-2.5 py-1 text-xs" onClick={() => setTagKey(t.key === tagKey ? null : t.key)}>
            {t.label}
          </ChipButton>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {shown.map((s) => (
          <Link key={s.id} to={s.path} className="min-w-0">
            <KeyVisualThumb src={s.key_visual_url} alt={s.title} seed={s.id} width={240} className="aspect-[3/4] w-full" />
            <div className="mt-1 truncate text-xs font-bold">{s.title}</div>
            <div className="line-clamp-2 text-xs text-muted-foreground">{s.note}</div>
          </Link>
        ))}
      </div>
      {footnote && <p className="mt-2 text-xs text-muted-foreground">{footnote}</p>}
      {activeTag && (
        <Link to={allPath} className="mt-2 block text-center text-xs text-muted-foreground hover:underline">
          「{activeTag.label}」の作品をカタログで見る ›
        </Link>
      )}
    </TopSection>
  )
}
