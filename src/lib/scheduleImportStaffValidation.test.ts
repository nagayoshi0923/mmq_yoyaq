import { describe,expect,it } from 'vitest'
import { validateScheduleImportStaff } from './scheduleImportStaffValidation'
describe('インポートの担当名事前確認',()=>{
  const event={date:'2026-09-01',scenario:'作品',gms:['Alice']}
  it('正常行を変更せず、不明名を公演とともに示す',()=>{
    const rows=[event,{...event,date:'2026-09-02',gms:['Alise']}]
    expect(validateScheduleImportStaff(rows,[{name:'Alice'}])).toEqual(['2026-09-02 作品: 未登録の担当名 Alise'])
    expect(rows[1].gms).toEqual(['Alise'])
  })
  it('重複を検出し、メモと担当0名は受け付ける',()=>{
    expect(validateScheduleImportStaff([{...event,gms:['Alice','Alice']},{...event,isMemo:true,gms:['メモ']},{...event,gms:[]}],[{name:'Alice'}])).toEqual(['2026-09-01 作品: 重複した担当名 Alice'])
  })
  it('スタッフ一覧が空なら名前を推測しない',()=>{
    expect(validateScheduleImportStaff([event],[])).toHaveLength(1)
  })
})
