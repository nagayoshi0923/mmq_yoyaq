import React from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

interface EmptySlotProps {
  onAddPerformance?: (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => void
  date: string
  venue: string
  timeSlot: 'morning' | 'afternoon' | 'evening'
}

export function EmptySlot({ onAddPerformance, date, venue, timeSlot }: EmptySlotProps) {
  return (
    <Button
      variant="ghost"
      className="w-full h-full min-h-[32px] hover:bg-gray-50 border border-transparent"
      onClick={() => {
        console.log('EmptySlot onClick:', { date, venue, timeSlot, onAddPerformance: !!onAddPerformance })
        onAddPerformance?.(date, venue, timeSlot)
      }}
    >
      <Plus className="w-3 h-3 mr-1" />
      <span className="text-xs">公演追加</span>
    </Button>
  )
}
