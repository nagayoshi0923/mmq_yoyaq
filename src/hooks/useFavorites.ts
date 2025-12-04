import { useState, useEffect, useCallback } from 'react'
import { logger } from '@/utils/logger'

const FAVORITES_KEY = 'scenario_favorites'

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_KEY)
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)))
    } catch (error) {
      logger.error('Failed to save favorites:', error)
    }
  }, [favorites])

  const toggleFavorite = useCallback((scenarioId: string) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev)
      if (newFavorites.has(scenarioId)) {
        newFavorites.delete(scenarioId)
      } else {
        newFavorites.add(scenarioId)
      }
      return newFavorites
    })
  }, [])

  const isFavorite = useCallback((scenarioId: string) => favorites.has(scenarioId), [favorites])

  return {
    favorites,
    toggleFavorite,
    isFavorite
  }
}

