/**
 * 11月の公演にデモ参加者を追加するスクリプト
 * 
 * 対象:
 * - 2025年11月の公演
 * - 中止になっていない公演（is_cancelled = false）
 * - カテゴリ: open, gmtest, private, offsite, testplay
 * 
 * 除外:
 * - venue_rental, venue_rental_free, mtg, package（参加者概念なし）
 * - シナリオ未設定
 * - 既にデモ予約があるもの
 * 
 * スタッフ参加:
 * - GM配列に含まれるスタッフは参加者としてはカウントしない（別枠）
 * - 既存の予約（staff_entry, staff_participation等）を考慮
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://cznpcewciwywcqcxktba.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ Supabase key が未設定です。SUPABASE_PUBLISHABLE_KEY（推奨）を設定してください。');
  process.exit(1);
}
if (String(SUPABASE_KEY).startsWith('eyJ')) {
  console.error('❌ Legacy JWT API keys は無効化されています。sb_publishable_... を使用してください。');
  process.exit(1);
}

// Queens Waltzの組織ID
const ORGANIZATION_ID = 'a0000000-0000-0000-0000-000000000001';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 参加者が必要なカテゴリ
const PARTICIPANT_CATEGORIES = ['open', 'gmtest', 'private', 'offsite', 'testplay'];

// 予約番号生成
function generateReservationNumber() {
  const now = new Date();
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');
  const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${dateStr}-${randomStr}`;
}

// シナリオ情報をキャッシュ
const scenarioCache = new Map();
const storeCache = new Map();

async function getScenarioInfo(scenarioTitle) {
  if (!scenarioTitle || scenarioTitle.trim() === '') return null;
  
  const title = scenarioTitle.trim();
  if (scenarioCache.has(title)) {
    return scenarioCache.get(title);
  }
  
  const { data, error } = await supabase
    .from('scenarios')
    .select('id, title, duration, participation_fee, gm_test_participation_fee, player_count_max')
    .eq('title', title)
    .maybeSingle();
  
  if (error || !data) {
    scenarioCache.set(title, null);
    return null;
  }
  
  scenarioCache.set(title, data);
  return data;
}

async function getStoreId(venueName) {
  if (!venueName) return null;
  
  if (storeCache.has(venueName)) {
    return storeCache.get(venueName);
  }
  
  // nameで検索
  let { data, error } = await supabase
    .from('stores')
    .select('id')
    .eq('name', venueName)
    .maybeSingle();
  
  if (!data) {
    // short_nameで検索
    const result = await supabase
      .from('stores')
      .select('id')
      .eq('short_name', venueName)
      .maybeSingle();
    data = result.data;
  }
  
  const storeId = data ? data.id : null;
  storeCache.set(venueName, storeId);
  return storeId;
}

async function getOrCreateDemoCustomer() {
  // 既存のデモ顧客を検索
  const { data: existing } = await supabase
    .from('customers')
    .select('id, name')
    .ilike('name', '%デモ%')
    .limit(1);
  
  if (existing && existing.length > 0) {
    return existing[0];
  }
  
  // なければ作成
  const { data: created, error } = await supabase
    .from('customers')
    .insert({
      organization_id: ORGANIZATION_ID,
      name: 'デモ顧客（自動生成）',
      email: 'demo@example.com',
      notes: '売上計算用のデモ顧客',
      visit_count: 0,
      total_spent: 0
    })
    .select()
    .single();
  
  if (error) throw error;
  return created;
}

async function getExistingReservations(eventId) {
  const { data, error } = await supabase
    .from('reservations')
    .select('id, participant_count, participant_names, reservation_source, status')
    .eq('schedule_event_id', eventId)
    .in('status', ['pending', 'confirmed', 'gm_confirmed', 'completed']);
  
  return data || [];
}

async function addDemoParticipant(event, scenario, storeId, demoCustomer, participantCount) {
  const isGmTest = event.category === 'gmtest';
  
  let participationFee;
  if (isGmTest) {
    participationFee = scenario.gm_test_participation_fee || scenario.participation_fee || 0;
  } else {
    participationFee = scenario.participation_fee || 0;
  }
  
  const totalPrice = participationFee * participantCount;
  const duration = scenario.duration || 120;
  
  const reservation = {
    organization_id: ORGANIZATION_ID,
    reservation_number: generateReservationNumber(),
    schedule_event_id: event.id,
    title: event.scenario || '',
    scenario_id: scenario.id,
    store_id: storeId,
    customer_id: demoCustomer.id,
    customer_notes: `デモ参加者（自動追加） - ${participantCount}名`,
    requested_datetime: `${event.date}T${event.start_time}+09:00`,
    duration: duration,
    participant_count: participantCount,
    participant_names: [],
    assigned_staff: event.gms || [],
    base_price: totalPrice,
    options_price: 0,
    total_price: totalPrice,
    discount_amount: 0,
    final_price: totalPrice,
    payment_method: 'onsite',
    payment_status: 'paid',
    status: 'confirmed',  // confirmedにしてUIで表示されるようにする
    reservation_source: 'demo'
  };
  
  const { data, error } = await supabase
    .from('reservations')
    .insert(reservation)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function main() {
  console.log('='.repeat(80));
  console.log('11月公演デモ参加者追加スクリプト');
  console.log('='.repeat(80));
  
  // デモ顧客を取得/作成
  const demoCustomer = await getOrCreateDemoCustomer();
  console.log(`\n📋 デモ顧客: ${demoCustomer.name} (ID: ${demoCustomer.id})`);
  
  // 11月の公演を取得
  const { data: events, error: eventsError } = await supabase
    .from('schedule_events')
    .select('id, date, venue, scenario, gms, start_time, end_time, category, is_cancelled, current_participants, max_participants')
    .gte('date', '2025-11-01')
    .lte('date', '2025-11-30')
    .eq('is_cancelled', false)
    .order('date');
  
  if (eventsError) {
    console.error('公演取得エラー:', eventsError);
    return;
  }
  
  console.log(`\n📅 11月の実施公演: ${events.length}件`);
  console.log('\n' + '-'.repeat(80));
  
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  
  for (const event of events) {
    const category = event.category;
    const date = event.date;
    const venue = event.venue;
    const scenarioTitle = event.scenario;
    const gms = event.gms || [];
    
    // 参加者概念がないカテゴリはスキップ
    if (!PARTICIPANT_CATEGORIES.includes(category)) {
      // console.log(`⏭️  [${date}] ${venue} - ${category}（参加者概念なし）`);
      skipCount++;
      continue;
    }
    
    // シナリオ未設定はスキップ
    if (!scenarioTitle || scenarioTitle.trim() === '' || scenarioTitle === '???') {
      console.log(`⏭️  [${date}] ${venue} - シナリオ未設定`);
      skipCount++;
      continue;
    }
    
    // 工事予定など特殊なものはスキップ
    if (scenarioTitle.includes('工事') || scenarioTitle.includes('MTG') || scenarioTitle.includes('出張')) {
      console.log(`⏭️  [${date}] ${venue} - ${scenarioTitle}（特殊公演）`);
      skipCount++;
      continue;
    }
    
    // シナリオ情報を取得
    const scenario = await getScenarioInfo(scenarioTitle);
    if (!scenario) {
      console.log(`⏭️  [${date}] ${venue} - ${scenarioTitle}（シナリオ未登録）`);
      skipCount++;
      continue;
    }
    
    // 店舗IDを取得
    const storeId = await getStoreId(venue);
    if (!storeId) {
      console.log(`❌ [${date}] ${venue} - ${scenarioTitle}（店舗ID取得エラー）`);
      errorCount++;
      continue;
    }
    
    // 既存の予約を取得
    const existingReservations = await getExistingReservations(event.id);
    
    // 既存の参加者数を計算
    const existingParticipantCount = existingReservations.reduce((sum, r) => sum + (r.participant_count || 0), 0);
    
    // 既にデモ予約があるかチェック
    const hasDemo = existingReservations.some(r => 
      r.reservation_source === 'demo' || r.reservation_source === 'demo_auto'
    );
    if (hasDemo) {
      // console.log(`⏭️  [${date}] ${venue} - ${scenarioTitle}（デモ予約済み）`);
      skipCount++;
      continue;
    }
    
    // 最大参加者数を取得
    const maxParticipants = event.max_participants || scenario.player_count_max || 8;
    
    // デモで追加すべき参加者数を計算
    const neededParticipants = maxParticipants - existingParticipantCount;
    
    if (neededParticipants <= 0) {
      // console.log(`⏭️  [${date}] ${venue} - ${scenarioTitle}（既に満員: ${existingParticipantCount}/${maxParticipants}）`);
      skipCount++;
      continue;
    }
    
    // デモ参加者を追加
    try {
      await addDemoParticipant(event, scenario, storeId, demoCustomer, neededParticipants);
      console.log(`✅ [${date}] ${venue} - ${scenarioTitle} (${neededParticipants}名追加, GM: ${gms.length}名)`);
      successCount++;
    } catch (e) {
      console.log(`❌ [${date}] ${venue} - ${scenarioTitle}（追加失敗: ${e.message}）`);
      errorCount++;
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`処理完了: 成功 ${successCount}件, スキップ ${skipCount}件, 失敗 ${errorCount}件`);
  console.log('='.repeat(80));
}

main().catch(console.error);

