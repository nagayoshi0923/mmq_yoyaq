import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/multi-select'
import type { Staff } from '@/types'

interface StaffAssignmentSectionProps {
  staff: Staff[]
  selectedStaffIds: string[]
  setSelectedStaffIds: (ids: string[]) => void
  isNewScenario: boolean
}

export function StaffAssignmentSection({ 
  staff, 
  selectedStaffIds, 
  setSelectedStaffIds,
  isNewScenario 
}: StaffAssignmentSectionProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>担当GM設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isNewScenario ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>シナリオを保存後に担当GMを設定できます</p>
            </div>
          ) : staff.length > 0 ? (
            <>
              <div>
                <Label>このシナリオを担当できるGM</Label>
                <MultiSelect
                  options={staff.map(s => ({ id: s.id, name: s.name }))}
                  selectedValues={selectedStaffIds}
                  onSelectionChange={setSelectedStaffIds}
                  placeholder="GMを選択"
                  useIdAsValue={true}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  このシナリオをGMできるスタッフを選択してください
                </p>
              </div>

              {selectedStaffIds.length > 0 && (
                <div className="border rounded p-4 bg-slate-50">
                  <p className="text-sm font-medium mb-2">選択中のGM:</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedStaffIds.map(id => {
                      const staffMember = staff.find(s => s.id === id)
                      return staffMember ? (
                        <span 
                          key={id}
                          className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm"
                        >
                          {staffMember.name}
                        </span>
                      ) : null
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>スタッフデータを読み込んでいます...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

