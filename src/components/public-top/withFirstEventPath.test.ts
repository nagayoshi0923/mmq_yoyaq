// 新作のカードを押すと、カードの先頭に出している公演を作品ページで選んだ状態で開く（2026-10-26 Codex レビュー）
import { describe, expect, it } from 'vitest'
import { withFirstEventPath, type ScenarioCardData } from './scenarioCards'
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'

const card = (ids: string[]) => ({ path: '/queens-waltz/scenario/kaku', events: ids.map((id) => ({ id })) }) as unknown as ScenarioCardData
const perf = { id: '3b8b521a-c083-468e-9049-7c584d9ae6c4', organization_slug: 'queens-waltz', scenario_slug: 'kaku' } as PublicPerformance

describe('新作のカードの行き先', () => {
  it('先頭の公演の ?event= 付きの作品ページ', () => {
    expect(withFirstEventPath(card([perf.id]), [perf]).path).toBe('/queens-waltz/scenario/kaku?event=3b8b521a-c083-468e-9049-7c584d9ae6c4')
  })
  it('公演が無ければ作品ページのまま', () => {
    expect(withFirstEventPath(card([]), [perf]).path).toBe('/queens-waltz/scenario/kaku')
  })
})
