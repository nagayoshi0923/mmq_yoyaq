import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

// システムメッセージ設定を取得（カラムが存在しない場合も対応）
export async function getSystemMessageSettings(orgId: string) {
  try {
    // まず全カラムを取得してから必要なものを抽出
    const { data, error } = await supabase
      .from('global_settings')
      .select(
        'system_msg_group_created_title, system_msg_group_created_body, system_msg_group_created_note, system_msg_booking_requested_title, system_msg_booking_requested_body, system_msg_schedule_confirmed_title, system_msg_schedule_confirmed_body'
      )
      .eq('organization_id', orgId)
      .maybeSingle()

    if (error) {
      logger.warn('Failed to fetch system message settings:', error)
      return null
    }

    // データがない場合はnullを返す
    if (!data) return null

    // 必要なフィールドのみ返す（存在しない場合はundefined）
    return {
      system_msg_group_created_title: data.system_msg_group_created_title,
      system_msg_group_created_body: data.system_msg_group_created_body,
      system_msg_group_created_note: data.system_msg_group_created_note,
      system_msg_booking_requested_title: data.system_msg_booking_requested_title,
      system_msg_booking_requested_body: data.system_msg_booking_requested_body,
      system_msg_schedule_confirmed_title: data.system_msg_schedule_confirmed_title,
      system_msg_schedule_confirmed_body: data.system_msg_schedule_confirmed_body,
    }
  } catch (err) {
    logger.warn('Exception fetching system message settings:', err)
    return null
  }
}

// システムメッセージ送信用ヘルパー
export async function sendSystemMessage(
  groupId: string,
  memberId: string | null,
  action: string,
  data: Record<string, unknown> = {}
) {
  const message = JSON.stringify({
    type: 'system',
    action,
    ...data
  })

  try {
    const { error } = await supabase.from('private_group_messages').insert({
      group_id: groupId,
      member_id: memberId,
      message
    })

    if (error) {
      logger.error('Failed to send system message - DB error:', error)
    } else {
      logger.log('System message sent successfully:', { groupId, action })
    }
  } catch (err) {
    logger.error('Failed to send system message - Exception:', err)
  }
}

/**
 * RPC 経由でメンバー名を取得し、グループデータにマージする。
 * anon のカラム制限で guest_name が直接取得できないため、
 * SECURITY DEFINER RPC を使って招待コード検証付きで名前を取得する。
 * その後、ログインユーザーのニックネームを customers テーブルから取得してオーバーライドする。
 * ニックネーム未設定のログインユーザーは「ニックネーム未設定」を表示する。
 */
export async function enrichMembersWithNames(
  data: { members?: any[]; invite_code?: string; organization_id?: string | null },
  inviteCode?: string
) {
  const code = inviteCode || data.invite_code
  if (!code || !data.members?.length) return

  try {
    const { data: rpcMembers } = await supabase.rpc('get_group_members_by_invite_code', {
      p_invite_code: code,
    })
    if (!rpcMembers?.length) return

    const nameMap = new Map<string, string>()
    for (const rm of rpcMembers) {
      if (rm.id && rm.guest_name) nameMap.set(rm.id, rm.guest_name)
    }
    for (const m of data.members) {
      if (nameMap.has(m.id)) {
        m.guest_name = nameMap.get(m.id)
      }
    }
  } catch {
    // RPC 失敗時は名前なしで続行
  }

  // ログインユーザーのニックネームを取得してオーバーライド
  // ニックネーム未設定の場合は「ニックネーム未設定」を表示（本名は表示しない）
  const userIds = data.members?.filter(m => m.user_id).map(m => m.user_id) || []
  if (userIds.length > 0) {
    try {
      let query = supabase
        .from('customers')
        .select('user_id, nickname')
        .in('user_id', userIds)
      if (data.organization_id) {
        query = (query as any).eq('organization_id', data.organization_id)
      }
      const { data: customers } = await query
      if (customers?.length) {
        const nicknameMap = new Map(
          (customers as Array<{ user_id: string; nickname: string | null }>).map(c => [c.user_id, c.nickname])
        )
        for (const m of data.members || []) {
          if (m.user_id && nicknameMap.has(m.user_id)) {
            // 取得できたレコードのみ上書き（RLS でブロックされた他ユーザーは既存 guest_name を維持）
            const nickname = nicknameMap.get(m.user_id)
            m.guest_name = nickname || 'ニックネーム未設定'
          }
        }
      }
    } catch {
      // RLS 制約でアクセスできない場合はスキップ（既存の guest_name をそのまま使用）
    }
  }
}

/** ビュー経由でキャラクター・人数上限を取得し scenario_masters に反映 */
export async function enrichGroupWithViewData(
  data: {
    scenario_masters?: Record<string, unknown> | null
    scenario_master_id?: string | null
    organization_id?: string | null
  }
) {
  if (!data.scenario_master_id || !data.organization_id) return
  try {
    const { data: viewRow } = await supabase
      .from('organization_scenarios_with_master')
      .select('characters, player_count_min, player_count_max, survey_enabled')
      .eq('scenario_master_id', data.scenario_master_id)
      .eq('organization_id', data.organization_id)
      .maybeSingle()

    if (!viewRow || !data.scenario_masters) return
    if (viewRow.characters) {
      (data.scenario_masters as Record<string, unknown>).characters = viewRow.characters
    }
    (data.scenario_masters as Record<string, unknown>).survey_enabled = viewRow.survey_enabled ?? false
    if (typeof viewRow.player_count_min === 'number' && typeof viewRow.player_count_max === 'number') {
      data.scenario_masters.effective_player_count_min = viewRow.player_count_min
      data.scenario_masters.effective_player_count_max = viewRow.player_count_max
    }
  } catch {
    // ゲストユーザーはRLSでアクセスできない場合がある
  }
}
