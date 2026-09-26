import { useEffect, useRef, useState } from 'react'
import { assignmentApi } from '@/lib/assignmentApi'
import { getScenarioAssignmentChanges, type ScenarioGmAssignment } from '@/lib/scenarioAssignmentChanges'

export function useScenarioGmAssignments(scenarioId: string | null | undefined) {
  const [currentAssignments, setCurrentAssignments] = useState<ScenarioGmAssignment[]>([])
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([])
  const [loadedId, setLoadedId] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState(false)
  const original = useRef<ScenarioGmAssignment[]>([])
  const requestedId = scenarioId || null
  const accept = (rows: ScenarioGmAssignment[]) => {
    const gm = rows.filter(a => a.can_main_gm === true || a.can_sub_gm === true)
    original.current = gm
    setCurrentAssignments(gm)
    setSelectedStaffIds(gm.map(a => a.staff_id))
  }

  useEffect(() => {
    let cancelled = false
    setLoadedId(undefined)
    setError(false)
    original.current = []
    setCurrentAssignments([])
    setSelectedStaffIds([])
    if (!requestedId) {
      setLoadedId(null)
      return
    }
    void assignmentApi.getAllScenarioAssignments(requestedId).then(rows => {
      if (cancelled) return
      accept(rows || [])
      setLoadedId(requestedId)
    }).catch(() => {
      if (!cancelled) setError(true)
    })
    return () => { cancelled = true }
  }, [requestedId])

  const ready = loadedId === requestedId && !error
  return {
    currentAssignments, setCurrentAssignments, selectedStaffIds, setSelectedStaffIds,
    isLoadingAssignments: !ready && !error,
    assignmentsReady: ready,
    assignmentsError: error,
    getChanges: () => {
      if (!ready) throw new Error('担当GMの読み込みが完了していません。開き直してください。')
      return getScenarioAssignmentChanges(original.current, currentAssignments, selectedStaffIds)
    },
    acceptAssignments: accept,
  }
}
