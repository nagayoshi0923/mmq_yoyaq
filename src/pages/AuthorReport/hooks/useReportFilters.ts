import { useState, useEffect, useMemo } from 'react'
import type { MonthlyAuthorData } from '../types'

/**
 * レポートフィルター管理フック
 */
export function useReportFilters(monthlyData: MonthlyAuthorData[]) {
  // sessionStorageから保存された値を復元
  const [selectedYear, setSelectedYear] = useState(() => {
    const saved = sessionStorage.getItem('authorReportYear')
    return saved ? parseInt(saved, 10) : new Date().getFullYear()
  })
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const saved = sessionStorage.getItem('authorReportMonth')
    return saved ? parseInt(saved, 10) : new Date().getMonth() + 1
  })
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(() => {
    const saved = sessionStorage.getItem('authorReportStoreIds')
    return saved ? JSON.parse(saved) : []
  })
  const [searchAuthor, setSearchAuthor] = useState('')

  // sessionStorageに保存
  useEffect(() => {
    sessionStorage.setItem('authorReportYear', selectedYear.toString())
  }, [selectedYear])

  useEffect(() => {
    sessionStorage.setItem('authorReportMonth', selectedMonth.toString())
  }, [selectedMonth])

  useEffect(() => {
    sessionStorage.setItem('authorReportStoreIds', JSON.stringify(selectedStoreIds))
  }, [selectedStoreIds])

  // フィルタリング
  const filteredMonthlyData = useMemo(() => {
    return monthlyData.map(monthData => ({
      ...monthData,
      authors: monthData.authors.filter(author =>
        author.author.toLowerCase().includes(searchAuthor.toLowerCase())
      )
    }))
  }, [monthlyData, searchAuthor])

  return {
    selectedYear,
    setSelectedYear,
    selectedMonth,
    setSelectedMonth,
    selectedStoreIds,
    setSelectedStoreIds,
    searchAuthor,
    setSearchAuthor,
    filteredMonthlyData
  }
}

