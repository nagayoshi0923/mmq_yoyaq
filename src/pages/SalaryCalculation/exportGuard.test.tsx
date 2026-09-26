// @vitest-environment jsdom
import { beforeEach,describe,expect,it,vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const mock=vi.hoisted(()=>({data:null as any}))
vi.mock('./hooks/useSalaryData',()=>({useSalaryData:()=>({salaryData:mock.data,loading:false,error:null,refresh:vi.fn()})}))
vi.mock('@/lib/api',()=>({storeApi:{getAll:async()=>[]}}))
vi.mock('@/components/patterns/calendar',()=>({MonthSwitcher:()=>null}))
vi.mock('@/components/ui/store-multi-select',()=>({StoreMultiSelect:()=>null}))
import SalaryCalculation from './index'
beforeEach(()=>{
  mock.data={month:'2026年9月',totalAmount:7000,totalNormalPay:7000,totalGMTestPay:0,totalEventCount:1,totalNormalCount:1,totalGMTestCount:0,unresolvedEvents:[],unresolvedStaff:[],staffList:[{
    staffId:'id',staffName:'名前',role:'gm',totalGMCount:1,totalGMPay:7000,totalSalary:7000,totalNormalGMCount:1,totalGMTestCount:0,totalNormalGMPay:7000,totalGMTestPay:0,gmAssignments:[],shifts:[],
  }]}
})
function exportButton(){document.body.innerHTML=renderToStaticMarkup(<SalaryCalculation/>);return [...document.querySelectorAll('button')].find(button=>button.textContent?.includes('CSVエクスポート'))!}
describe('給与CSVの確定前ガード',()=>{
  it('確認済みの集計は出力できる',()=>{expect(exportButton().disabled).toBe(false)})
  it('未確認担当や役割を含む集計を確定CSVとして出力しない',()=>{
    mock.data.unresolvedStaff=[{eventId:'event',date:'2026-09-01',scenario:'作品',staffName:'名前',reason:'role_unconfirmed'}]
    expect(exportButton().disabled).toBe(true)
    expect(document.body.textContent).toContain('役割未確認')
    expect(document.body.textContent).toContain('参考値')
  })
  it('作品不明で除外された公演も出力を止める',()=>{
    mock.data.unresolvedEvents=[{date:'2026-09-01',scenario:'無題',gmCount:1}]
    expect(exportButton().disabled).toBe(true)
  })
})
