/**
 * AuthorReport関連の型定義
 */

export interface AuthorPerformance {
  author: string
  totalEvents: number
  totalRevenue: number
  totalLicenseCost: number
  totalDuration: number
  scenarios: {
    title: string
    events: number
    revenue: number
    licenseCost: number
    licenseAmountPerEvent: number
    duration: number
    totalDuration: number
    isGMTest?: boolean
    isExternal?: boolean  // 外部公演報告（他社からの報告）
  }[]
}

export interface MonthlyAuthorData {
  month: string
  authors: AuthorPerformance[]
}

