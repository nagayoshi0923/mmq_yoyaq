import { apiClient } from '@/lib/apiClient'
import {
  buildGmScenarioModesFromAssignments,
  type GmScenarioMode,
} from './gmScenarioMode'

// 担当関係レコードの型（旧 Supabase select で推論されていた構造に合わせる）
type AssignmentRow = any

// スタッフ⇔シナリオの担当関係を管理するAPI
// すべてバックエンド API (/api/assignments) 経由で org_id をサーバー側で強制
export const assignmentApi = {
  // スタッフの担当シナリオ一覧を取得（GM可能なシナリオのみ）
  async getStaffAssignments(staffId: string, _organizationId?: string): Promise<AssignmentRow[]> {
    const data = await apiClient.get<AssignmentRow[]>(
      `/api/assignments?staff_id=${encodeURIComponent(staffId)}`
    )
    return (data || []).filter((assignment: AssignmentRow) =>
      assignment.can_main_gm === true || assignment.can_sub_gm === true
    )
  },

  // スタッフの全アサインメント一覧を取得（体験済み含む）
  async getAllStaffAssignments(staffId: string, _organizationId?: string): Promise<AssignmentRow[]> {
    return apiClient.get<AssignmentRow[]>(`/api/assignments?staff_id=${encodeURIComponent(staffId)}`)
  },

  // スタッフの体験済みシナリオ一覧を取得（GM不可のもののみ）
  async getStaffExperiencedScenarios(staffId: string, _organizationId?: string) {
    const data = await apiClient.get<AssignmentRow[]>(
      `/api/assignments?staff_id=${encodeURIComponent(staffId)}`
    )
    return (data || []).filter(
      (assignment: AssignmentRow) =>
        assignment.can_main_gm === false &&
        assignment.can_sub_gm === false &&
        assignment.is_experienced === true
    )
  },

  // シナリオの担当スタッフ一覧を取得（GM可能なスタッフのみ）
  async getScenarioAssignments(scenarioId: string, _organizationId?: string): Promise<AssignmentRow[]> {
    const data = await apiClient.get<AssignmentRow[]>(
      `/api/assignments?scenario_id=${encodeURIComponent(scenarioId)}`
    )
    return (data || []).filter((assignment: AssignmentRow) =>
      assignment.can_main_gm === true || assignment.can_sub_gm === true
    )
  },

  // シナリオの全スタッフ一覧を取得（体験済み含む）
  async getAllScenarioAssignments(scenarioId: string, _organizationId?: string): Promise<AssignmentRow[]> {
    return apiClient.get<AssignmentRow[]>(`/api/assignments?scenario_id=${encodeURIComponent(scenarioId)}`)
  },

  // シナリオの体験済みスタッフ一覧を取得（GM不可のもののみ）
  async getScenarioExperiencedStaff(scenarioId: string, _organizationId?: string) {
    const data = await apiClient.get<AssignmentRow[]>(
      `/api/assignments?scenario_id=${encodeURIComponent(scenarioId)}`
    )
    return (data || []).filter(
      (assignment: AssignmentRow) =>
        assignment.can_main_gm === false &&
        assignment.can_sub_gm === false &&
        assignment.is_experienced === true
    )
  },

  // 担当関係を追加（既存の体験済みレコードがあれば昇格）
  async addAssignment(staffId: string, scenarioId: string, notes?: string, _organizationId?: string) {
    return apiClient.post<AssignmentRow>('/api/assignments?action=upsert', {
      staff_id: staffId,
      scenario_master_id: scenarioId,
      notes: notes ?? null,
      can_main_gm: true,
      can_sub_gm: true,
      is_experienced: false,
    })
  },

  // GM担当を解除（体験済みに降格）
  async removeAssignment(staffId: string, scenarioId: string, _organizationId?: string) {
    await apiClient.delete(
      `/api/assignments?staff_id=${encodeURIComponent(staffId)}&scenario_master_id=${encodeURIComponent(scenarioId)}`
    )
  },

  // スタッフの担当シナリオを一括更新
  async updateStaffAssignments(
    staffId: string,
    assignments: string[] | Array<{
      scenarioId: string
      can_main_gm: boolean
      can_sub_gm: boolean
      is_experienced: boolean
      status?: 'want_to_learn' | 'experienced' | 'can_gm'
      notes?: string
    }>,
    _organizationId?: string,
    options?: { confirmClear?: boolean }
  ) {
    const isStringArray = assignments.length === 0 || typeof assignments[0] === 'string'

    if (isStringArray) {
      // string[] の場合: GM 更新のみ。体験済みのみレコードは保護する（クライアント側でマージ）
      const newGmScenarioIds = (assignments as string[]).filter((id) => id && typeof id === 'string')
      const current = await apiClient.get<AssignmentRow[]>(
        `/api/assignments?staff_id=${encodeURIComponent(staffId)}`
      )
      // 体験済みのみのレコードは can_main_gm=false, can_sub_gm=false, is_experienced=true として残す
      const expOnly = (current || []).filter(
        (a: AssignmentRow) =>
          a.can_main_gm === false && a.can_sub_gm === false && a.is_experienced === true
      )
      const expOnlyIds: string[] = expOnly.map((a: AssignmentRow) => a.scenario_master_id)

      // 新規 GM リストから体験済みのみのものは除外（重複防止: GM 昇格対象に変換される）
      const combinedMap = new Map<
        string,
        { scenarioId: string; can_main_gm: boolean; can_sub_gm: boolean; is_experienced: boolean }
      >()
      for (const id of newGmScenarioIds) {
        combinedMap.set(id, {
          scenarioId: id,
          can_main_gm: true,
          can_sub_gm: true,
          is_experienced: false,
        })
      }
      for (const id of expOnlyIds) {
        if (!combinedMap.has(id)) {
          combinedMap.set(id, {
            scenarioId: id,
            can_main_gm: false,
            can_sub_gm: false,
            is_experienced: true,
          })
        }
      }

      await apiClient.post('/api/assignments?action=update_staff_assignments', {
        staff_id: staffId,
        assignments: Array.from(combinedMap.values()),
        // string[] 経路 (旧スタッフ管理モーダル) は意図的に全件入れ替えるケースなので
        // 空配列でも全削除を許可（GM個人ページからの保存は別経路で confirmClear を制御）
        confirm_clear: true,
      })
    } else {
      // 詳細オブジェクト配列の場合: 全レコードを置き換え
      const records = (
        assignments as Array<{
          scenarioId: string
          can_main_gm: boolean
          can_sub_gm: boolean
          is_experienced: boolean
          notes?: string
        }>
      ).filter((a) => a.scenarioId && typeof a.scenarioId === 'string')
      await apiClient.post('/api/assignments?action=update_staff_assignments', {
        staff_id: staffId,
        assignments: records,
        confirm_clear: options?.confirmClear === true,
      })
    }
  },

  // シナリオの担当スタッフを一括更新（差分更新）
  async updateScenarioAssignments(
    scenarioId: string,
    staffIds: string[],
    notes?: string,
    _organizationId?: string
  ) {
    await apiClient.post('/api/assignments?action=update_scenario_assignments', {
      scenario_master_id: scenarioId,
      staff_ids: staffIds,
      notes: notes ?? null,
    })
  },

  // 担当関係の詳細を更新
  async updateAssignment(
    staffId: string,
    scenarioId: string,
    updates: {
      notes?: string
      assigned_at?: string
    },
    _organizationId?: string
  ) {
    return apiClient.patch<AssignmentRow>('/api/assignments', {
      staff_id: staffId,
      scenario_master_id: scenarioId,
      ...updates,
    })
  },

  // 複数シナリオのGM情報と体験済みスタッフを一括取得（N+1問題の回避）
  async getBatchScenarioAssignments(
    scenarioIds: string[],
    _organizationId?: string
  ): Promise<Map<string, { gmStaff: string[]; experiencedStaff: string[] }>> {
    const result = new Map<string, { gmStaff: string[]; experiencedStaff: string[] }>()
    if (scenarioIds.length === 0) return result

    // バッチごとに 50 件単位（URL 長対策）
    const batchSize = 50
    type BatchRow = {
      scenario_master_id: string
      staff_id: string
      can_main_gm: boolean | null
      can_sub_gm: boolean | null
      is_experienced: boolean | null
    }
    const allRows: BatchRow[] = []
    for (let i = 0; i < scenarioIds.length; i += batchSize) {
      const slice = scenarioIds.slice(i, i + batchSize)
      const data = await apiClient.get<BatchRow[]>(
        `/api/assignments?scenario_ids=${encodeURIComponent(slice.join(','))}`
      )
      allRows.push(...(data ?? []))
    }

    const filtered = allRows.filter(
      (r) => r.can_main_gm === true || r.can_sub_gm === true || r.is_experienced === true
    )

    // staff_id -> staff name は /api/staff で取得（自組織のみ）
    const uniqueStaffIds = Array.from(new Set(filtered.map((r) => r.staff_id).filter(Boolean)))
    const staffMap = new Map<string, string>()
    if (uniqueStaffIds.length > 0) {
      type StaffRow = { id: string; name: string }
      const allStaff = await apiClient.get<StaffRow[]>('/api/staff')
      for (const s of allStaff ?? []) {
        if (uniqueStaffIds.includes(s.id)) {
          staffMap.set(s.id, s.name)
        }
      }
    }

    for (const r of filtered) {
      const name = staffMap.get(r.staff_id)
      if (!name) continue
      if (!result.has(r.scenario_master_id)) {
        result.set(r.scenario_master_id, { gmStaff: [], experiencedStaff: [] })
      }
      const entry = result.get(r.scenario_master_id)!
      if (r.can_main_gm || r.can_sub_gm) {
        if (!entry.gmStaff.includes(name)) entry.gmStaff.push(name)
      }
      if (r.is_experienced && !r.can_main_gm && !r.can_sub_gm) {
        if (!entry.experiencedStaff.includes(name)) entry.experiencedStaff.push(name)
      }
    }

    return result
  },

  // 複数スタッフの担当シナリオ情報を一括取得（N+1問題の回避）
  async getBatchStaffAssignments(staffIds: string[], _organizationId?: string) {
    const result = new Map<
      string,
      {
        gmScenarios: string[]
        experiencedScenarios: string[]
        gm_scenario_modes: Record<string, GmScenarioMode>
      }
    >()
    if (staffIds.length === 0) return result

    const batchSize = 50
    type BatchRow = {
      staff_id: string
      scenario_master_id: string
      can_main_gm: boolean | null
      can_sub_gm: boolean | null
      is_experienced: boolean | null
    }
    const allRows: BatchRow[] = []
    for (let i = 0; i < staffIds.length; i += batchSize) {
      const slice = staffIds.slice(i, i + batchSize)
      const data = await apiClient.get<BatchRow[]>(
        `/api/assignments?staff_ids=${encodeURIComponent(slice.join(','))}`
      )
      allRows.push(...(data ?? []))
    }

    const filtered = allRows.filter(
      (r) => r.can_main_gm === true || r.can_sub_gm === true || r.is_experienced === true
    )

    for (const r of filtered) {
      if (!result.has(r.staff_id)) {
        result.set(r.staff_id, {
          gmScenarios: [],
          experiencedScenarios: [],
          gm_scenario_modes: {},
        })
      }
      const staffData = result.get(r.staff_id)!
      if ((r.can_main_gm || r.can_sub_gm) && r.scenario_master_id) {
        if (!staffData.gmScenarios.includes(r.scenario_master_id)) {
          staffData.gmScenarios.push(r.scenario_master_id)
        }
      }
      if (
        r.is_experienced &&
        !r.can_main_gm &&
        !r.can_sub_gm &&
        r.scenario_master_id
      ) {
        if (!staffData.experiencedScenarios.includes(r.scenario_master_id)) {
          staffData.experiencedScenarios.push(r.scenario_master_id)
        }
      }
    }

    for (const staffId of staffIds) {
      const staffData = result.get(staffId)
      if (!staffData) continue
      const gmRows = filtered.filter(
        (r) =>
          r.staff_id === staffId &&
          !!r.scenario_master_id &&
          (r.can_main_gm === true || r.can_sub_gm === true)
      )
      staffData.gm_scenario_modes = buildGmScenarioModesFromAssignments(
        gmRows.map((r) => ({
          can_main_gm: r.can_main_gm,
          can_sub_gm: r.can_sub_gm,
          scenarios: r.scenario_master_id ? { id: r.scenario_master_id } : null,
        }))
      )
    }

    return result
  },
}
