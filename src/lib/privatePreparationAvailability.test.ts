import { describe,it,expect } from 'vitest'
import { isPrivateBookingSlotAvailableForStore } from './privateBookingSlotAvailability'
import { computePrivateBookingSlots } from './computePrivateBookingSlots'
import type { BusinessHoursSettingRow } from './privateGroupCandidateSlots'
const day='2026-09-26'
const store='store-a'
const hours: BusinessHoursSettingRow = { store_id:store,opening_hours:{saturday:{is_open:true,close_time:'23:00',available_slots:['morning','afternoon','evening'],slot_start_times:{morning:'10:00',afternoon:'14:00',evening:'19:00'}}} }
const events=[{id:'before',store_id:store,date:day,start_time:'10:00',end_time:'14:00'},{id:'after',store_id:store,date:day,start_time:'17:00',end_time:'20:00'}]
const timing={ duration:180,weekend_duration:null,extra_preparation_time:30,preparation_minutes_by_store:{[store]:0},preparation_minutes_by_event:{ before:60,after:0 } }
describe('貸切の準備時間継承と空き表示',()=>{
 it('0分指定なら前後の公演と隣接でき、旧追加準備を二重加算しない',()=>{
   expect(isPrivateBookingSlotAvailableForStore(day,'afternoon',14*60,timing,store,events,()=>false,hours,false)).toBe(true)
   expect(computePrivateBookingSlots({date:day,storeIds:[store],businessHoursByStore:new Map([[store,hours]]),scenarioTiming:timing,allStoreEvents:events,isCustomHoliday:()=>false})).toContainEqual(expect.objectContaining({key:'afternoon',startTime:'14:00',endTime:'17:00'}))
 })
 it('後ろの公演の個別準備時間が必要なら空きとして表示しない',()=>{
   const next={...timing,preparation_minutes_by_event:{before:0,after:90}}
   expect(isPrivateBookingSlotAvailableForStore(day,'afternoon',14*60,next,store,events,()=>false,hours,false)).toBe(false)
   expect(computePrivateBookingSlots({date:day,storeIds:[store],businessHoursByStore:new Map([[store,hours]]),scenarioTiming:next,allStoreEvents:events,isCustomHoliday:()=>false}).some(slot=>slot.key==='afternoon')).toBe(false)
 })
 it('予約する作品の店舗別準備時間を前の公演との間に確保する',()=>{
   expect(isPrivateBookingSlotAvailableForStore(day,'afternoon',14*60,{...timing,preparation_minutes_by_store:{[store]:60}},store,events,()=>false,hours,false)).toBe(false)
 })
})

describe('任意の開始時刻の衝突', () => {
 it('枠開始後に始まった公演の途中への予約を拒否する', () => {
  const occupied = [{id:'middle',store_id:store,date:day,start_time:'15:00',end_time:'18:00'}]
  const short = {...timing,duration:60}
  expect(isPrivateBookingSlotAvailableForStore(day,'afternoon',16*60,short,store,occupied,()=>false,hours,false)).toBe(false)
  expect(isPrivateBookingSlotAvailableForStore(day,'afternoon',18*60,short,store,occupied,()=>false,hours,false)).toBe(true)
  expect(isPrivateBookingSlotAvailableForStore(day,'afternoon',18*60,{...short,preparation_minutes_by_store:{[store]:30}},store,occupied,()=>false,hours,false)).toBe(false)
 })
})

describe('日付をまたぐ準備時間', () => {
 it('前日の終了と翌日の準備開始を含めて検査する', () => {
  const prior = [{id:'prior-day',store_id:store,date:'2026-09-25',start_time:'20:00',end_time:'23:00'}]
  const longPrep = {...timing,duration:60,preparation_minutes_by_store:{[store]:720}}
  expect(isPrivateBookingSlotAvailableForStore(day,'morning',10*60,longPrep,store,prior,()=>false,hours,false)).toBe(false)
  expect(isPrivateBookingSlotAvailableForStore(day,'morning',11*60,longPrep,store,prior,()=>false,hours,false)).toBe(true)
  const next = [{id:'next-day',store_id:store,date:'2026-09-27',start_time:'10:00',end_time:'13:00'}]
  const nextPrep = {...timing,duration:60,preparation_minutes_by_event:{'next-day':720}}
  expect(isPrivateBookingSlotAvailableForStore(day,'evening',22*60,nextPrep,store,next,()=>false,hours,false)).toBe(false)
  expect(isPrivateBookingSlotAvailableForStore(day,'evening',21*60,nextPrep,store,next,()=>false,hours,false)).toBe(true)
 })
})
