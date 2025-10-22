import { useState, useEffect } from 'react'

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
      console.error('Failed to save favorites:', error)
    }
  }, [favorites])

  const toggleFavorite = (scenarioId: string) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev)
      if (newFavorites.has(scenarioId)) {
        newFavorites.delete(scenarioId)
      } else {
        newFavorites.add(scenarioId)
      }
      return newFavorites
    })
  }

  const isFavorite = (scenarioId: string) => favorites.has(scenarioId)

  return {
    favorites,
    toggleFavorite,
    isFavorite
  }
}

