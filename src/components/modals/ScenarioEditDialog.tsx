import React from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ScenarioEdit } from '@/pages/ScenarioEdit'

interface ScenarioEditDialogProps {
  isOpen: boolean
  onClose: () => void
  scenarioId: string | null
}

export function ScenarioEditDialog({ isOpen, onClose, scenarioId }: ScenarioEditDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <ScenarioEdit 
            scenarioId={scenarioId} 
            onClose={onClose}
            isDialog={true}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

