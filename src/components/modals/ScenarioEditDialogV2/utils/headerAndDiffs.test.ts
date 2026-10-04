import { describe, expect, it } from 'vitest'
import { buildHeaderScenarioOptions, computeMasterDiffs, emptyScenarioStats, scenarioSaveErrorMessage } from './headerAndDiffs'
import { newScenarioFormData } from './formData'
import type { Scenario } from '@/types'

describe('作品編集の見出し・マスターとの違い・保存失敗の文', () => {
  it('見出しの選択肢は一覧の順で重複を除き、開いている作品が無ければ先頭に足す', () => {
    const org = [{ id: 'os1', scenario_master_id: 'm1', title: '作品A' }, { id: 'os2', scenario_master_id: 'm2', title: '作品B' }]
    expect(buildHeaderScenarioOptions(org, [], ['m2', 'm1', 'm1'], 'm1', '作品A')).toEqual([{ id: 'm2', title: '作品B' }, { id: 'm1', title: '作品A' }])
    expect(buildHeaderScenarioOptions(org, [], undefined, 'new', '新作')[0]).toEqual({ id: 'new', title: '新作' })
    expect(buildHeaderScenarioOptions([], [{ id: 's1', scenario_master_id: 'm9', title: '旧' } as Scenario], undefined, null, '')).toEqual([{ id: 'm9', title: '旧' }])
  })
  it('マスターとの違いを項目とタブごとに数える', () => {
    const form = { ...newScenarioFormData(), title: '新題', duration: 180, genre: ['ホラー'] }
    const r = computeMasterDiffs({ title: '旧題', official_duration: 120, genre: [], author: '', description: '', key_visual_url: '', player_count_min: 8, player_count_max: 8 } as never, form)
    expect(Object.keys(r.fields).sort()).toEqual(['description', 'duration', 'genre', 'key_visual_url', 'title'].filter(k => k in r.fields).sort())
    expect(r.fields.title).toEqual({ master: '旧題', current: '新題' })
    expect(r.byTab.game).toBeGreaterThanOrEqual(2)
    expect(computeMasterDiffs(null, form)).toEqual({ count: 0, fields: {}, byTab: {} })
  })
  it('保存失敗の文: 題名・略称の重複、入力値の誤り', () => {
    expect(scenarioSaveErrorMessage({ code: '23505', message: 'scenarios_title_unique' })).toContain('同じタイトル')
    expect(scenarioSaveErrorMessage({ code: '23505', message: 'scenarios_slug_key' })).toContain('同じslug')
    expect(scenarioSaveErrorMessage({ code: '23514' })).toContain('入力値が無効')
    expect(scenarioSaveErrorMessage(new Error('x'))).toBe('x')
  })
  it('統計の初期値は呼ぶたびに新しい物', () => {
    expect(emptyScenarioStats()).toEqual(emptyScenarioStats())
    expect(emptyScenarioStats().performanceDates).not.toBe(emptyScenarioStats().performanceDates)
  })
})
