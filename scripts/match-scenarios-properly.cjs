const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://cznpcewciwywcqcxktba.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6bnBjZXdjaXd5d2NxY3hrdGJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzMyMjAsImV4cCI6MjA3NDIwOTIyMH0.GBR1kO877s6iy1WmVXL4xY8wpsyAdmgsXKEQbm0MNLo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function matchScenariosProper() {
  console.log('=== 適切な範囲でscenario_idをマッチング ===');
  
  const { data: nullScenarioEvents, error: nullError } = await supabase
    .from('schedule_events')
    .select('id, scenario, scenario_id')
    .eq('is_cancelled', false)
    .is('scenario_id', null);
  
  if (nullError) {
    console.error('エラー:', nullError);
    return;
  }
  
  console.log(`scenario_idがnullの公演数: ${nullScenarioEvents?.length || 0}件`);
  
  const { data: scenarios, error: scenariosError } = await supabase
    .from('scenarios')
    .select('id, title');
  
  if (scenariosError) {
    console.error('エラー:', scenariosError);
    return;
  }
  
  console.log(`利用可能なシナリオ数: ${scenarios?.length || 0}件\n`);
  
  let matchedCount = 0;
  let updatedCount = 0;
  
  for (const event of nullScenarioEvents || []) {
    if (!event.scenario || event.scenario.trim() === '') {
      continue;
    }
    
    // シナリオ名をクリーンアップ
    const cleanScenarioName = event.scenario
      .replace(/^["「『📗📕]/, '')
      .replace(/["」』]$/, '')
      .replace(/^貸・/, '')
      .replace(/^募・/, '')
      .replace(/^GMテスト・/, '')
      .replace(/^打診・/, '')
      .replace(/^仮/, '')
      .replace(/^（仮）/, '')
      .replace(/^\(仮\)/, '')
      .trim();
    
    // 長さが2文字以下はスキップ
    if (cleanScenarioName.length <= 2) {
      continue;
    }
    
    let matchedScenario = null;
    
    // 1. 完全一致を探す
    matchedScenario = scenarios.find(s => s.title === cleanScenarioName);
    
    // 2. 完全一致が見つからない場合、より長い文字列での部分一致（5文字以上）
    if (!matchedScenario && cleanScenarioName.length >= 5) {
      matchedScenario = scenarios.find(s => 
        s.title.includes(cleanScenarioName) || 
        cleanScenarioName.includes(s.title)
      );
    }
    
    if (matchedScenario) {
      matchedCount++;
      console.log(`✅ マッチ: "${event.scenario}" -> "${matchedScenario.title}"`);
      
      const { error: updateError } = await supabase
        .from('schedule_events')
        .update({ scenario_id: matchedScenario.id })
        .eq('id', event.id);
      
      if (updateError) {
        console.error(`❌ 更新失敗: ${event.id}`, updateError);
      } else {
        updatedCount++;
      }
    }
  }
  
  console.log(`\n=== 修正結果 ===`);
  console.log(`マッチしたシナリオ数: ${matchedCount}件`);
  console.log(`更新された公演数: ${updatedCount}件`);
  console.log(`マッチしなかった公演数: ${(nullScenarioEvents?.length || 0) - matchedCount}件`);
}

matchScenariosProper().catch(console.error);

