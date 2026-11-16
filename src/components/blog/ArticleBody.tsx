/**
 * 特集記事（ブログ記事）の本文。見出し・文章・画像に加えて、作品カード・タグの作品一覧・キャラ紹介を差し込む。
 * QW-20261116-001（見本: Figma「特集・キャンペーン」の 特集記事 1）。
 * 作品の次の公演・空席は表示のたびに get_public_feature_scenarios で最新を読む。
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchFeatureScenarios } from '@/lib/blogPublicFetch'
import { articleHeadings, articleReferences, featuredWorkIds, parseArticleBlocks, type ArticleBlock } from '@/lib/blogArticle'
import { KeyVisualThumb } from '@/components/public-top/KeyVisualThumb'
import { privateScenarioTabPath } from '@/pages/PrivateBookingStart/paths'
import { formatJstMonthDay } from '@/utils/jstDate'
import { storeDisplayName } from '@/lib/publicStoreName'
import type { FeatureCharacter, FeatureScenario } from '@/types'

const PRIVATE_COLOR = '#6B21D6'

function scenarioPath(s: FeatureScenario): string {
  return `/${s.organization_slug}/scenario/${encodeURIComponent(s.slug || s.scenario_master_id)}`
}

function metaLine(s: FeatureScenario): string {
  const players = s.player_count_min && s.player_count_max
    ? (s.player_count_min === s.player_count_max ? `${s.player_count_min}人` : `${s.player_count_min}〜${s.player_count_max}人`)
    : null
  const hours = s.duration ? `${Math.floor(s.duration / 60)}時間${s.duration % 60 ? `${s.duration % 60}分` : ''}` : null
  return [players, hours].filter(Boolean).join('・')
}

function nextEventLine(s: FeatureScenario): string {
  const e = s.next_events[0]
  if (!e) return '今は予約できる公演がありません（貸切で遊べることがあります）'
  const seats = e.available_seats > 0 ? `残り${e.available_seats}席` : '満席'
  const store = storeDisplayName(
    {
      name: e.store_name,
      short_name: e.store_short_name,
      public_name: e.store_public_name,
      is_temporary: e.store_is_temporary,
      temporary_venue_names: e.store_venue_name ? { [e.date]: e.store_venue_name } : null,
    },
    { organizationName: s.organization_name, date: e.date, fallback: e.venue },
  )
  return `次の公演 ${formatJstMonthDay(e.date, true)} ${e.start_time.slice(0, 5)} ${store} ・ ${seats}`
}

function WorkCard({ scenario }: { scenario: FeatureScenario }) {
  return (
    <div className="flex gap-3 border border-border bg-white p-3 sm:gap-4 sm:p-4">
      <Link to={scenarioPath(scenario)} className="shrink-0">
        <KeyVisualThumb src={scenario.key_visual_url} alt={scenario.title} seed={scenario.scenario_master_id} className="h-[119px] w-[84px] rounded-none sm:h-[156px] sm:w-[110px]" />
      </Link>
      <div className="min-w-0 flex-1 space-y-1.5">
        <span className="inline-block bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground">作品</span>
        <Link to={scenarioPath(scenario)} className="block font-bold hover:underline">{scenario.title}</Link>
        {metaLine(scenario) && <p className="text-xs text-muted-foreground">{metaLine(scenario)}</p>}
        <p className="text-xs font-bold text-primary">{nextEventLine(scenario)}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link to={scenarioPath(scenario)} className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-white">公演を見る</Link>
          {scenario.accepts_private_booking && (
            <Link
              to={privateScenarioTabPath(scenario.organization_slug, { id: scenario.scenario_master_id, slug: scenario.slug })}
              className="rounded-full px-3 py-1 text-xs font-bold text-white"
              style={{ backgroundColor: PRIVATE_COLOR }}
            >
              貸切で遊ぶ
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function TagList({ scenarios, tag }: { scenarios: FeatureScenario[]; tag: string }) {
  if (scenarios.length === 0) {
    return <p className="text-xs text-muted-foreground">「{tag}」の作品は、いま公開中のものがありません。</p>
  }
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
      {scenarios.map((s) => (
        <Link key={s.scenario_master_id} to={scenarioPath(s)} className="group space-y-1">
          <KeyVisualThumb src={s.key_visual_url} alt={s.title} seed={s.scenario_master_id} className="aspect-[1/1.414] w-full rounded-none" />
          <p className="line-clamp-2 text-xs font-bold group-hover:underline">{s.title}</p>
        </Link>
      ))}
    </div>
  )
}

function CharacterCard({ scenario, character }: { scenario: FeatureScenario; character: FeatureCharacter }) {
  const sub = [character.age, character.occupation].filter(Boolean).join('・')
  return (
    <Link to={scenarioPath(scenario)} className="flex gap-3 border border-border bg-white p-3 hover:bg-muted/40 sm:gap-4">
      <div
        className="h-[120px] w-[96px] shrink-0 overflow-hidden bg-muted"
        style={character.background_color ? { backgroundColor: character.background_color } : undefined}
      >
        {character.image_url && (
          <img
            src={character.image_url}
            alt={character.name ?? ''}
            loading="lazy"
            className="h-full w-full object-cover"
            style={character.image_position ? { objectPosition: character.image_position } : undefined}
          />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <span className="inline-block bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground">キャラ</span>
        <p className="font-bold">{character.name}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        {character.description && <p className="line-clamp-3 text-sm">{character.description}</p>}
        <p className="pt-1 text-xs font-bold text-primary">登場作品 {scenario.title} ›</p>
      </div>
    </Link>
  )
}

function slugifyHeading(text: string, index: number): string {
  return `section-${index + 1}`
}

export function ArticleBody({ content, organizationId }: { content: string; organizationId: string }) {
  const blocks = useMemo(() => parseArticleBlocks(content), [content])
  const refs = useMemo(() => articleReferences(blocks), [blocks])
  const featured = useMemo(() => featuredWorkIds(blocks), [blocks])
  const headings = useMemo(() => articleHeadings(blocks), [blocks])
  const needsScenarios = refs.scenarioIds.length > 0 || refs.tags.length > 0

  const { data: scenarios, isLoading, isError } = useQuery({
    queryKey: ['feature-article-scenarios', organizationId, refs.scenarioIds.join(','), refs.tags.join(',')],
    queryFn: () => fetchFeatureScenarios({ organizationId, scenarioIds: refs.scenarioIds, tags: refs.tags }),
    enabled: needsScenarios,
    staleTime: 60_000,
    // 記事を開くたびに次の公演・空席を最新にする（アプリ全体は refetchOnMount: false）
    refetchOnMount: 'always',
  })
  const byId = useMemo(() => new Map((scenarios ?? []).map((s) => [s.scenario_master_id, s])), [scenarios])

  let h2Index = -1
  const render = (b: ArticleBlock, i: number) => {
    switch (b.kind) {
      case 'h1':
        return <h2 key={i} className="pt-4 text-xl font-bold sm:text-2xl">{b.text}</h2>
      case 'h2': {
        h2Index += 1
        return (
          <h2 key={i} id={slugifyHeading(b.text, h2Index)} className="flex scroll-mt-4 items-center gap-2.5 pt-4 text-lg font-bold sm:text-xl">
            <span className="h-6 w-1 shrink-0 bg-primary" aria-hidden />
            {b.text}
          </h2>
        )
      }
      case 'h3':
        return <h3 key={i} className="pt-2 font-bold">{b.text}</h3>
      case 'list_item':
        return <li key={i} className="ml-5 list-disc">{b.text}</li>
      case 'spacer':
        return null
      case 'paragraph':
        return <p key={i}>{b.text}</p>
      case 'image':
        return (
          <figure key={i} className="space-y-1">
            <img src={b.url} alt={b.caption} loading="lazy" className="w-full" />
            {b.caption && <figcaption className="text-xs text-muted-foreground">{b.caption}</figcaption>}
          </figure>
        )
      case 'work': {
        const s = byId.get(b.scenarioId)
        if (!s) return isLoading ? <div key={i} className="h-32 animate-pulse bg-muted" /> : null
        return <WorkCard key={i} scenario={s} />
      }
      case 'tag': {
        if (isLoading) return <div key={i} className="h-40 animate-pulse bg-muted" />
        if (isError) return null
        const exclude = new Set(b.excludeIds)
        const list = (scenarios ?? [])
          .filter((s) => (s.genre ?? []).includes(b.tag) && !exclude.has(s.scenario_master_id) && !featured.has(s.scenario_master_id))
          .sort((a, c) => (a.next_events[0]?.date ?? '9999').localeCompare(c.next_events[0]?.date ?? '9999') || a.title.localeCompare(c.title, 'ja'))
        return <TagList key={i} scenarios={list} tag={b.tag} />
      }
      case 'character': {
        const s = byId.get(b.scenarioId)
        const c = s?.characters.find((x) => x.id === b.characterId)
        if (!s || !c) return isLoading ? <div key={i} className="h-32 animate-pulse bg-muted" /> : null
        return <CharacterCard key={i} scenario={s} character={c} />
      }
    }
  }

  return (
    <div className="space-y-4 leading-relaxed">
      {headings.length >= 2 && (
        <nav className="space-y-1 bg-muted/60 px-4 py-3">
          <p className="text-xs font-bold text-muted-foreground">この記事の目次</p>
          <ol className="space-y-0.5 text-sm">
            {headings.map((h, i) => (
              <li key={h + i}>
                <a href={`#${slugifyHeading(h, i)}`} className="hover:underline">{i + 1}. {h}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {blocks.map(render)}
      {isError && needsScenarios && (
        <p className="text-xs text-muted-foreground">作品の情報を読み込めませんでした。時間をおいて開き直してください。</p>
      )}
    </div>
  )
}
