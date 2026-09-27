import { describe, expect, it } from 'vitest'
import { filterPrivateGroups } from './filterPrivateGroups'
import type { PrivateGroupListItem } from '../hooks/usePrivateGroupList'
const group = (values: Partial<PrivateGroupListItem>) => ({id:'g',invite_code:'INVITE',status:'confirmed',confirmed_date:'2026-09-27',reservation_numbers:['PB-OLD','PB-CURRENT'],...values}) as PrivateGroupListItem
const defaults = {searchTerm:'',statusFilter:'all',hideCompleted:true,showSurveyOnly:false}
const now = new Date('2026-09-28T00:30:00+09:00')
describe('貸切履歴検索', () => {
  it('検索中は完了非表示が保存されていても過去・取消予約を検索できる', () => {
    for (const status of ['confirmed','cancelled']) {
      expect(filterPrivateGroups([group({status})],{...defaults,searchTerm:' pb-old '},now)).toHaveLength(1)
      expect(filterPrivateGroups([group({status})],defaults,now)).toHaveLength(0)
    }
  })
  it('JST当日は完了扱いにせず、明示的な他の絞り込みは維持する', () => {
    expect(filterPrivateGroups([group({confirmed_date:'2026-09-28'})],defaults,now)).toHaveLength(1)
    expect(filterPrivateGroups([group({})],{...defaults,searchTerm:'PB',statusFilter:'cancelled'},now)).toHaveLength(0)
    expect(filterPrivateGroups([group({})],{...defaults,searchTerm:'PB',showSurveyOnly:true},now)).toHaveLength(0)
  })
  it('絞り込みを解除すれば過去・取消・予約番号未設定の履歴も表示する', () => {
    expect(filterPrivateGroups([group({}),group({status:'cancelled'}),group({reservation_numbers:undefined})],{...defaults,hideCompleted:false},now)).toHaveLength(3)
  })
})
