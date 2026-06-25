/**
 * SalaryCalculation関連の型定義
 */

export interface StaffSalary {
  staffId: string
  staffName: string
  role: string
  totalShiftHours: number
  totalShiftPay: number
  totalGMCount: number
  totalNormalGMCount: number
  totalGMTestCount: number
  totalGMPay: number
  totalNormalGMPay: number
  totalGMTestPay: number
  totalSalary: number
  shifts: ShiftDetail[]
  gmAssignments: GMDetail[]
}

export interface ShiftDetail {
  date: string
  storeName: string
  hours: number
  hourlyRate: number
  pay: number
}

export interface GMDetail {
  date: string
  scenarioTitle: string
  storeName: string
  gmRole: string
  pay: number
  isGMTest?: boolean
  isCancelled?: boolean
}

/** シナリオマスタに解決できず給与集計から外れた公演（サイレントな漏れを可視化するため） */
export interface UnresolvedSalaryEvent {
  date: string
  scenario: string
  gmCount: number
}

export interface MonthlySalaryData {
  month: string
  staffList: StaffSalary[]
  totalAmount: number
  totalNormalPay: number
  totalGMTestPay: number
  totalEventCount: number
  totalNormalCount: number
  totalGMTestCount: number
  /** scenario_master_id 未設定でタイトル解決もできず集計対象外になった公演（GMあり・非シナリオcat除く） */
  unresolvedEvents: UnresolvedSalaryEvent[]
}

