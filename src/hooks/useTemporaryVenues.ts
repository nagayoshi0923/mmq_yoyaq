/**
 * 臨時会場管理フック
 * 
 * レンタルスペースなど、特定の日付のみに追加される臨時会場を管理する
 */

import { useState, useCallback, useEffect } from 'react'

export interface TemporaryVenue {
  id: string
  date: string
  name: string
  short_name: string
  created_at: string
}

interface UseTemporaryVenuesReturn {
  temporaryVenues: TemporaryVenue[]
  getVenuesForDate: (date: string) => TemporaryVenue[]
  addTemporaryVenue: (date: string) => void
  removeTemporaryVenue: (venueId: string) => void
}

/**
 * 臨時会場を管理するフック
 */
export function useTemporaryVenues(currentDate: Date): UseTemporaryVenuesReturn {
  const [temporaryVenues, setTemporaryVenues] = useState<TemporaryVenue[]>([])

  // localStorageのキーを生成（年月単位）
  const getStorageKey = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    return `schedule_temporary_venues_${year}_${month}`
  }

  // localStorageから臨時会場を読み込む
  useEffect(() => {
    const key = getStorageKey(currentDate)
    const stored = localStorage.getItem(key)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setTemporaryVenues(parsed)
      } catch (error) {
        console.error('臨時会場データの読み込みに失敗:', error)
        setTemporaryVenues([])
      }
    } else {
      setTemporaryVenues([])
    }
  }, [currentDate])

  // localStorageに臨時会場を保存
  const saveToStorage = useCallback((venues: TemporaryVenue[]) => {
    const key = getStorageKey(currentDate)
    localStorage.setItem(key, JSON.stringify(venues))
  }, [currentDate])

  // 特定の日付の臨時会場を取得
  const getVenuesForDate = useCallback((date: string) => {
    return temporaryVenues.filter(venue => venue.date === date)
  }, [temporaryVenues])

  // 臨時会場を追加
  const addTemporaryVenue = useCallback((date: string) => {
    const existingVenuesForDate = temporaryVenues.filter(v => v.date === date)
    const venueNumber = existingVenuesForDate.length + 1
    
    const newVenue: TemporaryVenue = {
      id: `temp_${date}_${Date.now()}`,
      date,
      name: `臨時会場${venueNumber}`,
      short_name: `臨時${venueNumber}`,
      created_at: new Date().toISOString()
    }
    
    const newVenues = [...temporaryVenues, newVenue]
    setTemporaryVenues(newVenues)
    saveToStorage(newVenues)
  }, [temporaryVenues, saveToStorage])

  // 臨時会場を削除
  const removeTemporaryVenue = useCallback((venueId: string) => {
    const newVenues = temporaryVenues.filter(v => v.id !== venueId)
    setTemporaryVenues(newVenues)
    saveToStorage(newVenues)
  }, [temporaryVenues, saveToStorage])

  return {
    temporaryVenues,
    getVenuesForDate,
    addTemporaryVenue,
    removeTemporaryVenue
  }
}

