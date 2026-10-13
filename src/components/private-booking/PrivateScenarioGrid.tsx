import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ChipButton } from '@/components/public-top/ChipButton'
import { ScenarioCard } from '@/components/public-top/ScenarioCard'
import type { ScenarioCardData } from '@/components/public-top/scenarioCards'

/** 貸切できる作品の一覧に出す作品（公開用の作品一覧の 1 行） */
export interface PrivateScenario {
  id: string
  slug?: string | null
  title: string
  author: string
  duration: number
  player_count_min: number
  player_count_max: number
  key_visual_url?: string | null
  participation_fee?: number | null
  /** 募集期間の外（いまは貸切を受け付けていない） */
  closed?: boolean
}

/** 作品カードの材料。次回公演の行は出さず、料金は下の欄（1 人あたり）に出す */
export function privateScenarioCard(s: PrivateScenario, path: string): ScenarioCardData {
  return {
    key: s.id,
    scenario_id: s.id,
    title: s.title,
    key_visual_url: s.key_visual_url ?? null,
    author: s.author ?? '',
    player_count_min: s.player_count_min,
    player_count_max: s.player_count_max,
    duration_minutes: s.duration || null,
    fee: null,
    events: [],
    total_events_count: 0,
    is_recommended: false,
    favorite_count: 0,
    release_date: null,
    path,
  }
}

/** 人数のチップ（作品の人数の幅に含まれる人数。多すぎるときは上限で切る） */
export function participantChoices(scenarios: readonly Pick<PrivateScenario, 'player_count_min' | 'player_count_max'>[]): number[] {
  const set = new Set<number>()
  for (const s of scenarios) {
    for (let n = Math.max(1, s.player_count_min); n <= Math.min(s.player_count_max, 20); n++) set.add(n)
  }
  return [...set].sort((a, b) => a - b)
}

export function filterPrivateScenarios<T extends PrivateScenario>(scenarios: readonly T[], term: string, count: number | null): T[] {
  const q = term.trim().toLowerCase()
  return scenarios.filter((s) => {
    if (q && !(s.title ?? '').toLowerCase().includes(q) && !(s.author ?? '').toLowerCase().includes(q)) return false
    if (count !== null && (count < s.player_count_min || count > s.player_count_max)) return false
    return true
  })
}

interface PrivateScenarioGridProps {
  scenarios: PrivateScenario[]
  loading: boolean
  /** 押したときの行き先（作品ページの貸切リクエストのタブ）。選ぶ使い方では使わない */
  pathFor: (s: PrivateScenario) => string
  onOpen: (s: PrivateScenario) => void
  /** 選ぶ使い方（日時を選んだあと）のときの選択中の作品 */
  selectedId?: string | null
}

/**
 * 貸切できる作品の一覧（作品名・作者の検索、人数のチップ、作品カード）。
 * 日時なし: カードを押すと作品ページの貸切リクエストのタブへ。日時あり: カードを押すとその作品を選ぶ。
 */
export function PrivateScenarioGrid({ scenarios, loading, pathFor, onOpen, selectedId }: PrivateScenarioGridProps) {
  const [term, setTerm] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const choices = useMemo(() => participantChoices(scenarios), [scenarios])
  const shown = useMemo(() => filterPrivateScenarios(scenarios, term, count), [scenarios, term, count])
  const selecting = selectedId !== undefined

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" placeholder="作品名・作者で探す" value={term} onChange={(e) => setTerm(e.target.value)} className="pl-10" aria-label="作品名・作者で探す" />
      </div>
      {choices.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scroll-row" role="group" aria-label="人数で絞る">
          <ChipButton selected={count === null} onClick={() => setCount(null)}>人数すべて</ChipButton>
          {choices.map((n) => (
            <ChipButton key={n} selected={count === n} onClick={() => setCount(count === n ? null : n)}>{n}人</ChipButton>
          ))}
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">読み込み中...</p>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {scenarios.length === 0 ? 'いま貸切できる作品はありません。' : '条件に合う作品がありません。'}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{shown.length === scenarios.length ? `全 ${scenarios.length} 作品` : `${shown.length} 作品（全 ${scenarios.length}）`}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4" data-testid="private-scenario-grid">
            {shown.map((s) => (
              <ScenarioCard
                key={s.id}
                card={privateScenarioCard(s, pathFor(s))}
                onOpen={() => { if (!s.closed) onOpen(s) }}
                selected={selecting ? selectedId === s.id : undefined}
                className={s.closed ? 'cursor-not-allowed opacity-60' : undefined}
                note={
                  <div className="space-y-0.5 ts-11">
                    {!!s.participation_fee && <p className="text-muted-foreground">1 人あたり ¥{s.participation_fee.toLocaleString('ja-JP')}</p>}
                    {s.closed
                      ? <p className="font-bold text-muted-foreground">現在は受け付けていません</p>
                      : <p className="font-bold text-purple-700">貸切できます</p>}
                  </div>
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
