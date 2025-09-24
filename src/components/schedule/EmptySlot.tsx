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
      className="w-full h-full min-h-[60px] border-2 border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50"
      onClick={() => onAddPerformance?.(date, venue, timeSlot)}
    >
      <Plus className="w-4 h-4 mr-1" />
      <span className="text-xs">公演追加</span>
    </Button>
  )
}
