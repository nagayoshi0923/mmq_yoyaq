const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://cznpcewciwywcqcxktba.supabase.co';
const supabaseKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('❌ Supabase key が未設定です。');
  console.error('   SUPABASE_PUBLISHABLE_KEY（推奨）または VITE_SUPABASE_PUBLISHABLE_KEY を設定してください。');
  process.exit(1);
}
if (String(supabaseKey).startsWith('eyJ')) {
  console.error('❌ Legacy JWT API keys は無効化されています。sb_publishable_... を使用してください。');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function revertBadMatches() {
  console.log('=== 不適切なマッチングを取り消します ===');
  
  // 以下のシナリオIDにマッチングされた公演を探す（明らかに不適切なマッチング）
  const badScenarioIds = [
    'b13aefa8-f75c-4b85-97d1-5f4271c11565', // アンフィスバエナと聖女の祈り
    '6ff3e69d-00f9-4eaa-86fe-1bc49d523d04', // クリエイターズハイ
    '3099fb6f-3969-404f-a50d-7eec273aec72', // BrightChoice
    'cebb827f-9ee5-4cdd-b81a-8ee572e17410', // 僕らの未来について
    '73912835-b208-4c20-a97d-bcc7b4784053', // GARDENリーガー殺人事件
    '1a2dc765-681c-491d-9ecf-e6b72e0749b4', // 桜の散る夜に
    '400b9967-7999-473a-b607-9d626cf22f7a', // こぼれた情景
    '112554a2-b917-4860-9449-3f9826fb9b25', // ひぐらしのなく頃に　恨返し編
    'c75e086c-b30e-47f9-9143-ebd1bc74e5bc', // REDRUM01泉涌館の変転
  ];
  
  // これらのシナリオIDで、シナリオ名が全く異なる公演を見つける
  const { data: events, error } = await supabase
    .from('schedule_events')
    .select('id, scenario, scenario_id')
    .in('scenario_id', badScenarioIds)
    .eq('is_cancelled', false);
  
  if (error) {
    console.error('エラー:', error);
    return;
  }
  
  console.log(`対象シナリオIDの公演数: ${events?.length || 0}件`);
  
  // シナリオ情報を取得
  const { data: scenarios, error: scenariosError } = await supabase
    .from('scenarios')
    .select('id, title')
    .in('id', badScenarioIds);
  
  if (scenariosError) {
    console.error('エラー:', scenariosError);
    return;
  }
  
  const scenarioMap = {};
  scenarios.forEach(s => scenarioMap[s.id] = s.title);
  
  let revertCount = 0;
  
  for (const event of events || []) {
    const scenarioTitle = scenarioMap[event.scenario_id];
    
    // シナリオ名が全く一致しない場合はrevert
    const cleanScenarioName = event.scenario
      .replace(/^["「『📗📕]/, '')
      .replace(/["」』]$/, '')
      .replace(/^(貸・|募・|GMテスト・|打診・|仮|（仮）|\(仮\))/, '')
      .trim();
    
    const shouldRevert = !scenarioTitle.includes(cleanScenarioName) && 
                        !cleanScenarioName.includes(scenarioTitle) &&
                        cleanScenarioName.length > 0;
    
    if (shouldRevert) {
      console.log(`🔄 Revert: "${event.scenario}" (was matched to "${scenarioTitle}")`);
      
      const { error: updateError } = await supabase
        .from('schedule_events')
        .update({ scenario_id: null })
        .eq('id', event.id);
      
      if (!updateError) {
        revertCount++;
      } else {
        console.error(`❌ 更新失敗:`, updateError);
      }
    }
  }
  
  console.log(`\n取り消した公演数: ${revertCount}件`);
}

revertBadMatches().catch(console.error);

