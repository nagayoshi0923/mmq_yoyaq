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
      className="w-full h-full min-h-[20px] sm:min-h-[24px] hover:bg-gray-50 border border-transparent p-0.5 sm:p-1"
      onClick={() => onAddPerformance?.(date, venue, timeSlot)}
    >
      <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
      <span className="text-[9px] sm:text-xs md:text-xs">公演追加</span>
    </Button>
  )
}
