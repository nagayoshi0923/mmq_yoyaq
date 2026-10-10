/**
 * 「作品について」: キービジュアル・作品名・作者・タグ（人数・所要時間・ジャンル・難易度・事前読み込み）・あらすじ（3 行で畳む）・
 * 注意事項・配慮が必要な表現（作品ページと同じセルフチェック。項目名はネタバレ防止のため出さない）・右上に「作品ページを見る ›」。
 * 招待ページ（参加前）では compact で、注意事項とセルフチェックを省く。
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SensitivityCheck } from '@/components/scenario/SensitivityCheck'
import { difficultyText, durationWithWeekendText, playerRangeText } from '@/components/scenario/scenarioFacts'
import type { GroupScenarioInfo } from '../useGroupScenarioInfo'
import { OverviewSection } from './OverviewSection'

interface ScenarioAboutSectionProps {
  title: string
  imageUrl: string | null
  /** グループの読み取り結果の人数（公開情報が読めないときの代わり） */
  playerRange: { min: number | null; max: number | null }
  info: GroupScenarioInfo | null
  /** 作品ページの URL（分からなければ null） */
  scenarioUrl: string | null
  compact?: boolean
  /** 作品名の下に足す行（招待ページの「参加 2/6名」など） */
  extra?: ReactNode
}

function Tag({ children, strong = false }: { children: string; strong?: boolean }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${strong ? 'bg-violet-50 text-violet-800' : 'bg-muted text-muted-foreground'}`}>{children}</span>
}

function Synopsis({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && !expanded) setOverflowing(el.scrollHeight > el.clientHeight + 1)
  }, [text, expanded])
  return (
    <div className="mt-2.5">
      <p ref={ref} className={`text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap break-words ${expanded ? '' : 'line-clamp-3'}`} data-testid="scenario-synopsis">
        {text}
      </p>
      {(overflowing || expanded) && (
        <button type="button" onClick={() => setExpanded(v => !v)} className="mt-0.5 text-xs text-violet-700 hover:underline">
          {expanded ? '閉じる' : '続きを読む'}
        </button>
      )}
    </div>
  )
}

export function ScenarioAboutSection({ title, imageUrl, playerRange, info, scenarioUrl, compact = false, extra }: ScenarioAboutSectionProps) {
  const players = playerRangeText(info?.playerMin ?? playerRange.min, info?.playerMax ?? playerRange.max)
  const duration = durationWithWeekendText(info?.duration, info?.weekendDuration)
  const difficulty = difficultyText(info?.difficulty)
  const image = imageUrl
    ? <img src={imageUrl} alt="" className="w-[84px] h-28 shrink-0 rounded-md object-cover bg-muted" />
    : <div className="w-[84px] h-28 shrink-0 rounded-md bg-muted" aria-hidden="true" />

  return (
    <OverviewSection
      label="作品について"
      testId="overview-scenario"
      title="作品について"
      aside={scenarioUrl ? <Link to={scenarioUrl} className="text-violet-700 hover:underline" data-testid="open-scenario-page">作品ページを見る ›</Link> : null}
    >
      <div className="flex gap-3">
        {scenarioUrl ? <Link to={scenarioUrl} aria-label={`${title}の作品ページ`}>{image}</Link> : image}
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <p className="text-base font-bold leading-tight break-words">{title}</p>
          {info?.author && <p className="text-xs text-muted-foreground">作者 {info.author}</p>}
          {extra}
          <div className="mt-0.5 flex flex-wrap gap-1">
            {players && <Tag>{players}</Tag>}
            {duration && <Tag>{duration}</Tag>}
            {info?.genre.slice(0, 3).map(g => <Tag key={g}>{g}</Tag>)}
            {difficulty && <Tag>{difficulty}</Tag>}
            {info && <Tag strong={info.hasPreReading}>{info.hasPreReading ? '事前読み込みあり' : '事前読み込みなし'}</Tag>}
          </div>
        </div>
      </div>
      {info?.synopsis && <Synopsis text={info.synopsis} />}
      {!compact && info?.caution && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
          <p className="font-bold">作品の注意事項</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words leading-snug">{info.caution}</p>
        </div>
      )}
      {info && info.sensitiveTags.length > 0 && (
        <div className="mt-2 space-y-2" data-testid="scenario-sensitive">
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
            配慮が必要な表現を含む作品です。ネタバレを避けるため項目名は出していません。{compact ? '作品ページで、避けたい表現が含まれるかを確かめられます。' : '下のチェックで、避けたい表現が含まれるかを確かめられます。'}
          </p>
          {!compact && <SensitivityCheck sensitiveTags={info.sensitiveTags} />}
        </div>
      )}
    </OverviewSection>
  )
}
