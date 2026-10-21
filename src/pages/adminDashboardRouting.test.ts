import { describe, expect, it } from 'vitest'
import { ADMIN_PATHS, parsePath } from './adminDashboardRouting'

describe('URL から表示するページを決める', () => {
  it('トップ・マイページ・グループ招待・シナリオ共通詳細', () => {
    expect(parsePath('/').page).toBeTruthy()
    expect(parsePath('/group/invite/ABC123')).toMatchObject({ page: expect.any(String) })
    expect(parsePath('/scenario/some-slug')).toMatchObject({ page: expect.any(String) })
  })
  it('組織の管理ページは組織の略称と管理ページ名に分ける', () => {
    const r = parsePath('/queens-waltz/schedule')
    expect(r.organizationSlug).toBe('queens-waltz')
    expect(r.page).toBe('schedule')
    expect(ADMIN_PATHS).toContain('schedule')
  })
  it('貸切を始めるページ（MMQ 全体トップの「参加店舗から選ぶ」の行き先）は組織の略称として扱わない', () => {
    expect(parsePath('/private-booking/select-organization')).toEqual({ page: 'private-booking-start', scenarioId: null, organizationSlug: null })
    expect(parsePath('/queens-waltz/private-booking-select')).toMatchObject({ page: 'private-booking-select', organizationSlug: 'queens-waltz' })
  })
  it('主な URL の結果を固定する（移す前の規則のまま）', () => {
    const paths = ['/', '/mypage', '/mypage/reservation/r1', '/queens-waltz', '/queens-waltz/private-booking-management', '/blog/abc', '/org/queens-waltz/contact', '/dev/components', '/group/create', '/group/manage/g1', '/admin/scenario-masters', '/scenarios/edit/s1']
    expect(Object.fromEntries(paths.map(p => [p, parsePath(p)]))).toMatchSnapshot()
  })
})
