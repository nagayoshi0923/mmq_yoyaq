/**
 * 作品編集画面の保存で書き込む値（画面から切り出した純粋な関数。値と順番は元のまま）。
 */
import { scenarioSlotStartTimesForSave } from '@/lib/privateBookingSlotStartTimes'
import type { ScenarioFormData } from '../types'

/** scenarios（旧テーブル）へ保存する値。入力欄専用の項目を除き、配列の入力を単一の値に直す */
export function buildScenarioSaveData(formData: ScenarioFormData, resolvedTitle: string, saveStatus: string, nowIso: string) {
  // データベースに存在しないUI専用フィールドを除外
  const { 
    gm_assignments,
    use_flexible_pricing, 
    flexible_pricing,
    participation_costs,
    license_rewards,
    franchise_license_rewards,
    ...dbFields 
  } = formData
  
  // UI専用配列からDB用の単一値に変換
  const normalParticipationCost = formData.participation_costs?.find(c => c.time_slot === 'normal')
  const normalLicenseReward = formData.license_rewards?.find(r => r.item === 'normal')
  const gmtestLicenseReward = formData.license_rewards?.find(r => r.item === 'gmtest')
  const normalFranchiseLicenseReward = formData.franchise_license_rewards?.find(r => r.item === 'normal')
  const gmtestFranchiseLicenseReward = formData.franchise_license_rewards?.find(r => r.item === 'gmtest')
  
  return {
    ...dbFields,
    title: resolvedTitle,
    // ステータスを上書き
    status: saveStatus,
    // slugが空文字列の場合はnullとして保存
    slug: dbFields.slug?.trim() || null,
    // 追加準備時間: undefinedやfalsyはnullとして保存（意図しないデフォルト値を防ぐ）
    extra_preparation_time: formData.extra_preparation_time || null,
    // 男女比: nullは「男女問わず」を意味する
    male_count: formData.male_count ?? null,
    female_count: formData.female_count ?? null,
    other_count: formData.other_count ?? null,
    participation_fee: normalParticipationCost?.amount || formData.participation_fee || 3000,
    // 参加費設定（時間帯別料金）を保存
    participation_costs: formData.participation_costs || [],
    license_amount: (normalLicenseReward?.amount ?? formData.license_amount ?? 0),
    gm_test_license_amount: (gmtestLicenseReward?.amount ?? formData.gm_test_license_amount ?? 0),
    is_license_buyout: formData.is_license_buyout === true,
    scenario_type: formData.scenario_type || 'normal',
    // フランチャイズ用ライセンス金額: 配列から取得、なければ従来のフィールドから
    // 0円も保存するため、?? を使用（|| だと0が falsy で null になってしまう）
    franchise_license_amount: normalFranchiseLicenseReward?.amount ?? formData.franchise_license_amount ?? null,
    franchise_gm_test_license_amount: gmtestFranchiseLicenseReward?.amount ?? formData.franchise_gm_test_license_amount ?? null,
    gm_costs: formData.gm_assignments.map(assignment => ({
      role: assignment.role,
      reward: assignment.reward,
      ...(assignment.category && { category: assignment.category })
    })),
    // 公演可能店舗
    available_stores: formData.available_stores || [],
    // 貸切受付時間枠（平日/土日祝）
    private_booking_time_slots: formData.private_booking_time_slots || null,
    private_booking_time_slots_weekend: formData.private_booking_time_slots_weekend ?? null,
    updated_at: nowIso
  }
}

/** organization_scenarios（組織ごとの作品設定）へ保存する値。sourcePayload は設定元（共通・作品）の切り替え */
export function buildOrgScenarioPayload({ organizationId, masterId, scenarioData, formData, saveStatus, sourcePayload }: {
  organizationId: string
  masterId: string
  scenarioData: any
  formData: ScenarioFormData
  saveStatus: string
  sourcePayload: Record<string, unknown>
}) {
  return {
    organization_id: organizationId,
    scenario_master_id: masterId,
    slug: scenarioData.slug,
    duration: scenarioData.duration,
    participation_fee: scenarioData.participation_fee,
    extra_preparation_time: scenarioData.extra_preparation_time ?? null,
    org_status: saveStatus === 'draft' ? 'coming_soon' : (saveStatus === 'available' ? 'available' : 'unavailable'),
    // override フィールド（マスター情報の組織固有上書き）
    override_title: scenarioData.title || null,
    override_author: scenarioData.author || null,
    override_genre: scenarioData.genre || null,
    override_difficulty: scenarioData.difficulty ? String(scenarioData.difficulty) : null,
    override_player_count_min: scenarioData.player_count_min || null,
    override_player_count_max: scenarioData.player_count_max || null,
    // custom フィールド
    custom_key_visual_url: scenarioData.key_visual_url || null,
    custom_description: scenarioData.description || null,
    custom_caution: formData.caution || null,
    // 空配列 = マスタ (scenario_masters.sensitive_tags) 準拠にフォールバック
    custom_sensitive_tags: formData.sensitive_tags && formData.sensitive_tags.length > 0 ? formData.sensitive_tags : null,
    ...sourcePayload,
    // 運用フィールド
    available_stores: scenarioData.available_stores || [],
    participation_costs: scenarioData.participation_costs || [],
    gm_costs: scenarioData.gm_costs || [],
    // 必要GM数（担当作品ページのメイン／サブ表示やシフト計算用。organization_scenarios に必ず同期する）
    gm_count: formData.gm_count ?? 1,
    // ライセンス関連フィールド
    license_amount: scenarioData.license_amount,
    gm_test_license_amount: scenarioData.gm_test_license_amount,
    is_license_buyout: formData.is_license_buyout === true,
    franchise_license_amount: scenarioData.franchise_license_amount,
    franchise_gm_test_license_amount: scenarioData.franchise_gm_test_license_amount,
    external_license_amount: formData.external_license_amount,
    external_gm_test_license_amount: formData.external_gm_test_license_amount,
    // フランチャイズ公演時
    fc_receive_license_amount: formData.fc_receive_license_amount,
    fc_receive_gm_test_license_amount: formData.fc_receive_gm_test_license_amount,
    fc_author_license_amount: formData.fc_author_license_amount,
    fc_author_gm_test_license_amount: formData.fc_author_gm_test_license_amount,
    // アンケート設定
    survey_url: formData.survey_url || null,
    survey_enabled: formData.survey_enabled || false,
    survey_deadline_days: formData.survey_deadline_days ?? 1,
    // キャラクター情報
    characters: formData.characters || [],
    // 男女比
    male_count: formData.male_count ?? null,
    female_count: formData.female_count ?? null,
    other_count: formData.other_count ?? null,
    // シナリオタイプ
    scenario_type: formData.scenario_type || 'normal',
    // 貸切受付枠（平日・土日祝は別々。新規作成時もここで確実に保存する）
    private_booking_time_slots: formData.private_booking_time_slots || null,
    private_booking_time_slots_weekend: formData.private_booking_time_slots_weekend ?? null,
    // 貸切受付不可時間帯
    private_booking_blocked_slots: formData.private_booking_blocked_slots || null,
    // 作品ごとの貸切開始時刻（未設定の枠は店舗の営業時間設定）
    private_booking_slot_start_times: scenarioSlotStartTimesForSave(formData.private_booking_slot_start_times),
    // 貸切募集期間
    booking_start_date: formData.booking_start_date || null,
    booking_end_date: formData.booking_end_date || null,
    // シナリオ種別・貸切受付フラグ・公演期間
    scenario_kind: formData.scenario_kind || 'regular',
    accepts_private_booking: formData.accepts_private_booking ?? true,
    available_from: formData.available_from || null,
    available_until: formData.available_until || null,
  }
}
