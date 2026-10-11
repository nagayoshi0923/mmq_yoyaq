import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { ListView } from './ListView'
import type { PublicStoreRow } from '../hooks/useBookingData'

const captured = vi.hoisted(() => ({useSlots:vi.fn(()=>()=>[])}))
vi.mock('../hooks/usePublicPrivateBookingSlots',()=>({usePublicPrivateBookingSlots:captured.useSlots}))
vi.mock('./BookingFilters',()=>({BookingFilters:()=>null}))
vi.mock('../hooks/useBookingData',()=>({scenarioCardId:()=>'',scenarioCardTitle:()=>''}))
const stores = [{id:'a',name:'A'},{id:'b',name:'B'}] as PublicStoreRow[]
function render(selectedStoreIds:string[]) {
  captured.useSlots.mockClear()
  renderToStaticMarkup(createElement(MemoryRouter,null,createElement(ListView,{
    organizationId:'org',listViewMonth:new Date(2030,0,1),onMonthChange:()=>{},selectedStoreIds,onStoreIdsChange:()=>{},stores,listViewData:[],getEventsForDateStore:()=>[],getColorFromName:()=>'',scenarios:[],onCardClick:()=>{},
  })))
  return captured.useSlots.mock.calls[0] as unknown as [string,string[],Date]
}
describe('リストの公開受付情報の店舗範囲',()=>{
  it('すべて表示では表示対象の全店舗を取得する',()=>{expect(render([])[1]).toEqual(['a','b'])})
  it('店舗を選択したときは選択店だけを取得する',()=>{expect(render(['b'])[1]).toEqual(['b'])})
})
