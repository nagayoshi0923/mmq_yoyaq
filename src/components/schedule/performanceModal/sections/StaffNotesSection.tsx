/**
 * 公演モーダル「スタッフ・備考」セクション（PerformanceModal から子コンポーネント抽出・挙動不変）。
 * GM 選択（MultiSelect）／役割バッジ（Popover で役割変更・削除）／予約者名（貸切）／備考。
 *
 * ⚠️ 役割バッジの削除と役割ラジオ変更には「スタッフ参加」予約の DB 同期インライン処理を含む。
 * これらの async ハンドラは元 PerformanceModal の該当ブロックを逐語移植し、クロージャ参照を
 * 同名 props 化しただけ（挙動不変・byte 一致確認済み）。DB 同期本体は staffReservationSync へ。
 */
import React from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { badgeVariants } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { MultiSelect } from '@/components/ui/multi-select'
import { X, UserCog, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/utils/logger'
import { getCurrentOrganizationId } from '@/lib/organization'
import type { Staff as StaffType, Scenario } from '@/types'
import { ScheduleEvent, EventFormData } from '@/types/schedule'
import { CATEGORY_TONE } from '../constants'
import { ensureStaffReservation, removeStaffReservation } from '../staffReservationSync'

interface StaffNotesSectionProps {
  formData: EventFormData
  setFormData: Dispatch<SetStateAction<EventFormData>>
  mode: 'add' | 'edit'
  event?: ScheduleEvent | null
  staff: StaffType[]
  scenarios: Scenario[]
  allAvailableStaff: StaffType[]
  staffParticipantsFromDB: string[]
  setStaffParticipantsFromDB: Dispatch<SetStateAction<string[]>>
  setIsStaffModalOpen: Dispatch<SetStateAction<boolean>>
}

export function StaffNotesSection({
  formData,
  setFormData,
  mode,
  event,
  staff,
  scenarios,
  allAvailableStaff,
  staffParticipantsFromDB,
  setStaffParticipantsFromDB,
  setIsStaffModalOpen,
}: StaffNotesSectionProps) {
  return (
    <div className="rounded-lg border p-3 space-y-2" style={CATEGORY_TONE[formData.category] ? { backgroundColor: CATEGORY_TONE[formData.category].section, borderColor: CATEGORY_TONE[formData.category].border } : { backgroundColor: "rgb(248 250 252 / 0.7)" }}>
      <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
        <Users className="h-3.5 w-3.5" />スタッフ・備考
      </p>

    {/* GM */}
    <div className="flex items-start gap-3">
      <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right pt-1.5">GM</Label>
      <div className="flex-1 min-w-0">
      <MultiSelect
        options={(() => {
          const options = staff
            .filter(s => s.status === 'active')
            .map(staffMember => {
              const matchedScenario = formData.scenario ? scenarios.find(sc => sc.title === formData.scenario) : null
              const isAssignedGM = formData.scenario && matchedScenario &&
                (staffMember.special_scenarios?.includes(matchedScenario.scenario_master_id || matchedScenario.id) ||
                 staffMember.special_scenarios?.includes(matchedScenario.id))
              const isAvailable = allAvailableStaff.some(gm => gm.id === staffMember.id)
              const badges: React.ReactNode[] = []
              if (isAvailable) {
                badges.push(
                  <span key="shift" className="inline-flex items-center px-1 py-0 rounded text-[11px] font-medium bg-green-100 text-green-700 border border-green-200">シフト済</span>
                )
              }
              if (isAssignedGM) {
                badges.push(
                  <span key="gm" className="inline-flex items-center px-1 py-0 rounded text-[11px] font-medium bg-blue-100 text-blue-700 border border-blue-200">担当</span>
                )
              }
              const searchText = (isAvailable && isAssignedGM) ? 'シフト提出済 担当GM' : ''
              let sortOrder = 3
              if (isAvailable && isAssignedGM) sortOrder = 0
              else if (isAssignedGM) sortOrder = 1
              else if (isAvailable) sortOrder = 2
              return {
                id: staffMember.id,
                name: staffMember.name,
                displayInfo: badges.length > 0 ? <span className="flex gap-1">{badges}</span> : undefined,
                displayInfoSearchText: searchText || undefined,
                sortOrder
              }
            })
            .sort((a, b) => a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.name.localeCompare(b.name, 'ja'))
            .map(({ id, name, displayInfo, displayInfoSearchText }) => ({ id, name, displayInfo, displayInfoSearchText }))
          return options
        })()}
        selectedValues={formData.gms}
        onSelectionChange={(values) => setFormData((prev: any) => ({ ...prev, gms: values }))}
        placeholder="GM"
        closeOnSelect={false}
        emptyText="GMが見つかりません"
        emptyActionLabel="+ GMを作成"
        onEmptyAction={() => setIsStaffModalOpen(true)}
        className="h-7 text-xs"
      />
      {(formData.gms.length > 0 || staffParticipantsFromDB.length > 0) && (
        <div className="flex flex-wrap gap-1 mt-1">
          {formData.gms.map((gm: string, index: number) => {
            const role = formData.gmRoles?.[gm] || 'main'
            // staff 役割は常に「参加 (緑)」に統一 (保存時 or role 変更時に予約も自動同期される)
            // ボーダーは -400 系で背景 (薄色 dialog tone) からはっきり浮き上がるようにする
            // main 役割はカテゴリ色 (CATEGORY_TONE) を inline style で適用
            const catTone = CATEGORY_TONE[formData.category]
            const badgeStyle = role === 'observer'
              ? 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200 border-indigo-400'
              : role === 'reception'
                ? 'bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-400'
                : role === 'staff'
                  ? 'bg-green-100 text-green-800 hover:bg-green-200 border-green-400'
                  : role === 'sub'
                    ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-400'
                    : '' // main はインライン style で適用
            const badgeInlineStyle = role === 'main' && catTone
              ? { backgroundColor: catTone.section, borderColor: catTone.border, color: '#1f2937' }
              : undefined
            return (
              <Popover key={`gm-${index}`}>
                <PopoverTrigger asChild>
                  <div
                    className={cn(badgeVariants({ variant: "outline" }), "flex items-center gap-0.5 font-normal border cursor-pointer rounded-[3px] pr-0.5 text-[11px] py-0 h-5", badgeStyle)}
                    style={badgeInlineStyle}
                    role="button"
                  >
                    <span className="flex items-center">
                      <UserCog className="h-2.5 w-2.5 mr-0.5 opacity-70" />
                      {gm}
                      {role === 'sub' && <span className="text-[11px] ml-0.5 font-bold">(サブ)</span>}
                      {role === 'reception' && <span className="text-[11px] ml-0.5 font-bold">(受付)</span>}
                      {role === 'staff' && <span className="text-[11px] ml-0.5 font-bold">{staffParticipantsFromDB.includes(gm) ? '(参加)' : '(参加予定)'}</span>}
                      {role === 'observer' && <span className="text-[11px] ml-0.5 font-bold">(見学)</span>}
                    </span>
                    <div
                      role="button"
                      className="h-3 w-3 flex items-center justify-center rounded-full hover:bg-black/10 ml-0.5"
                      onClick={async (e) => {
                        e.stopPropagation()
                        const removedGm = gm
                        const removedRole = formData.gmRoles?.[removedGm]
                        const newGms = formData.gms.filter((g: string) => g !== removedGm)
                        const newRoles = { ...formData.gmRoles }
                        delete newRoles[removedGm]
                        setFormData((prev: EventFormData) => ({ ...prev, gms: newGms, gmRoles: newRoles }))
                        // role が staff だったなら、対応する予約を削除
                        if (mode === 'edit' && event?.id && removedRole === 'staff') {
                          try {
                            await removeStaffReservation(event.id, removedGm)
                            setStaffParticipantsFromDB(prev => prev.filter(n => n !== removedGm))
                          } catch (err) {
                            logger.error('スタッフ参加予約の削除に失敗:', err)
                          }
                        }
                      }}
                    >
                      <X className="h-2.5 w-2.5" />
                    </div>
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-2" align="start">
                  <div className="space-y-1.5">
                    <div className="space-y-0.5">
                      <h4 className="font-medium text-[11px] text-muted-foreground">役割を選択</h4>
                      <RadioGroup
                        value={role}
                        onValueChange={async (value) => {
                          const prevRole = formData.gmRoles?.[gm] || 'main'
                          setFormData((prev: any) => ({ ...prev, gmRoles: { ...prev.gmRoles, [gm]: value } }))
                          // 役割が staff になった瞬間に reservations へ INSERT
                          // 役割が staff から外れた瞬間に対応する予約を DELETE
                          if (mode === 'edit' && event?.id) {
                            try {
                              const orgId = await getCurrentOrganizationId()
                              const scenarioObj = scenarios.find(s => s.title === formData.scenario)
                              if (value === 'staff' && prevRole !== 'staff') {
                                await ensureStaffReservation({
                                  eventId: event.id,
                                  staffName: gm,
                                  organizationId: orgId,
                                  scenarioTitle: formData.scenario || '',
                                  scenarioMasterId: scenarioObj?.id ?? null,
                                  storeId: event.store_id ?? null,
                                })
                                setStaffParticipantsFromDB(prev => prev.includes(gm) ? prev : [...prev, gm])
                              } else if (prevRole === 'staff' && value !== 'staff') {
                                await removeStaffReservation(event.id, gm)
                                setStaffParticipantsFromDB(prev => prev.filter(n => n !== gm))
                              }
                            } catch (err) {
                              logger.error('スタッフ参加予約の同期に失敗:', err)
                            }
                          }
                        }}
                        className="gap-0.5"
                      >
                        <div className="flex items-center space-x-1.5 py-0.5">
                          <RadioGroupItem value="main" id={`role-main-${index}`} className="h-3 w-3" />
                          <Label htmlFor={`role-main-${index}`} className="text-xs cursor-pointer">メインGM</Label>
                        </div>
                        <div className="flex items-center space-x-1.5 py-0.5">
                          <RadioGroupItem value="sub" id={`role-sub-${index}`} className="h-3 w-3" />
                          <Label htmlFor={`role-sub-${index}`} className="text-xs cursor-pointer">サブGM</Label>
                        </div>
                        <div className="flex items-center space-x-1.5 py-0.5">
                          <RadioGroupItem value="reception" id={`role-reception-${index}`} className="h-3 w-3" />
                          <Label htmlFor={`role-reception-${index}`} className="text-xs cursor-pointer">受付</Label>
                        </div>
                        <div className="flex items-center space-x-1.5 py-0.5">
                          <RadioGroupItem value="staff" id={`role-staff-${index}`} className="h-3 w-3" />
                          <Label htmlFor={`role-staff-${index}`} className="text-xs cursor-pointer">スタッフ参加</Label>
                        </div>
                        <div className="flex items-center space-x-1.5 py-0.5">
                          <RadioGroupItem value="observer" id={`role-observer-${index}`} className="h-3 w-3" />
                          <Label htmlFor={`role-observer-${index}`} className="text-xs cursor-pointer">スタッフ見学</Label>
                        </div>
                      </RadioGroup>
                    </div>
                    {role === 'sub' && <p className="text-[11px] text-blue-600 bg-blue-50 p-0.5 rounded">※サブGM給与適用</p>}
                    {role === 'reception' && <p className="text-[11px] text-orange-600 bg-orange-50 p-0.5 rounded">※受付（2,000円）</p>}
                    {role === 'staff' && (
                      <p className="text-[11px] p-0.5 rounded text-green-600 bg-green-50">
                        ※ 予約タブのスタッフ予約として自動追加されます
                      </p>
                    )}
                    {role === 'observer' && <p className="text-[11px] text-indigo-600 bg-indigo-50 p-0.5 rounded">※見学のみ</p>}
                  </div>
                </PopoverContent>
              </Popover>
            )
          })}
          {staffParticipantsFromDB
            .filter((staffName: string) => !formData.gms.includes(staffName) || formData.gmRoles?.[staffName] !== 'staff')
            .map((staffName: string, index: number) => (
            <div
              key={`staff-${index}`}
              className={cn(badgeVariants({ variant: "outline" }), "flex items-center gap-0.5 font-normal border rounded-[3px] text-[11px] py-0 h-5", "bg-green-100 text-green-800 border-green-200")}
              title="予約タブで編集できます"
            >
              <span className="flex items-center">
                <UserCog className="h-2.5 w-2.5 mr-0.5 opacity-70" />
                {staffName}
                <span className="text-[11px] ml-0.5 font-bold">(参加)</span>
              </span>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>

    {/* 予約者名（貸切の場合のみ表示） */}
    {(formData.category === 'private' || formData.is_private_request) && (
      <div className="flex items-center gap-3">
        <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">予約者名</Label>
        <div className="flex-1">
          <Input id="reservation_name" value={formData.reservation_name || ''}
            onChange={(e) => setFormData((prev: any) => ({ ...prev, reservation_name: e.target.value }))}
            placeholder="予約者名（MMQ予約は自動設定）" className="h-7 text-xs" />
        </div>
      </div>
    )}

    {/* 備考 */}
    <div className="flex items-start gap-3">
      <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right pt-1.5">備考</Label>
      <div className="flex-1">
        <Textarea id="notes" value={formData.notes}
          onChange={(e) => setFormData((prev: any) => ({ ...prev, notes: e.target.value }))}
          placeholder="備考" rows={2} className="text-xs min-h-[40px] py-1" />
      </div>
    </div>
    </div>
  )
}
