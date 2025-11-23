import { Users } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

interface GMInfo {
  id: string
  name: string
  available_candidates: number[]
  selected_candidate_index?: number
  notes: string
  isAssigned: boolean
  isAvailable: boolean
}

interface Staff {
  id: string
  name: string
}

interface GMSelectorProps {
  availableGMs: GMInfo[]
  allGMs: Staff[]
  selectedGMId: string
  onSelectGM: (gmId: string) => void
  forceMode?: boolean
}

/**
 * GM選択コンポーネント
 */
export const GMSelector = ({
  availableGMs,
  allGMs,
  selectedGMId,
  onSelectGM,
  forceMode = false
}: GMSelectorProps) => {
  const displayGMs = forceMode ? allGMs : availableGMs

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-purple-800">
        <Users className="w-4 h-4" />
        担当GMを選択
        {forceMode && (
          <Badge variant="secondary" className="ml-2 bg-gray-100 text-gray-800 border-0 rounded-[2px] font-normal">
            強行モード
          </Badge>
        )}
      </h3>
      
      {!forceMode && availableGMs.length === 0 && (
        <div className="text-sm text-muted-foreground mb-2">
          担当可能なGMが見つかりませんでした
        </div>
      )}
      
      <Select value={selectedGMId} onValueChange={onSelectGM}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="GMを選択してください" />
        </SelectTrigger>
        <SelectContent>
          {displayGMs.map(gm => {
            const gmInfo = availableGMs.find(g => g.id === gm.id)
            const isAvailable = gmInfo?.isAvailable
            const isAssigned = gmInfo?.isAssigned

            return (
              <SelectItem key={gm.id} value={gm.id}>
                <div className="flex items-center gap-2">
                  <span>{gm.name}</span>
                  {isAvailable && (
                    <Badge variant="secondary" className="bg-gray-100 text-gray-800 border-0 rounded-[2px] font-normal text-xs">
                      回答済
                    </Badge>
                  )}
                  {isAssigned && !isAvailable && (
                    <Badge variant="secondary" className="bg-gray-100 text-gray-800 border-0 rounded-[2px] font-normal text-xs">
                      担当
                    </Badge>
                  )}
                </div>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      
      {/* 選択されたGMの回答情報を表示 */}
      {selectedGMId && availableGMs.length > 0 && (
        (() => {
          const selectedGM = availableGMs.find(gm => gm.id === selectedGMId)
          if (selectedGM && selectedGM.isAvailable && selectedGM.available_candidates.length > 0) {
            return (
              <div className="mt-2 p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="text-sm text-green-800">
                  <div className="">GM回答情報</div>
                  <div>対応可能な候補: 候補{selectedGM.available_candidates.map(idx => idx + 1).join(', ')}</div>
                  {selectedGM.notes && (
                    <div className="mt-1 text-xs">メモ: {selectedGM.notes}</div>
                  )}
                </div>
              </div>
            )
          }
          return null
        })()
      )}
    </div>
  )
}

