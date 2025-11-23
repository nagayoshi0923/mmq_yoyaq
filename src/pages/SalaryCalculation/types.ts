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
}

