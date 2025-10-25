const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://cznpcewciwywcqcxktba.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6bnBjZXdjaXd5d2NxY3hrdGJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzMyMjAsImV4cCI6MjA3NDIwOTIyMH0.GBR1kO877s6iy1WmVXL4xY8wpsyAdmgsXKEQbm0MNLo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixScenarioIds() {
  console.log('=== scenario_idの修正を開始 ===');
  
  try {
    // 1. scenario_idがnullの公演を取得
    const { data: nullScenarioEvents, error: nullError } = await supabase
      .from('schedule_events')
      .select('id, scenario, scenario_id')
      .eq('is_cancelled', false)
      .is('scenario_id', null);
    
    if (nullError) {
      console.error('scenario_idがnullの公演取得エラー:', nullError);
      return;
    }
    
    console.log(`scenario_idがnullの公演数: ${nullScenarioEvents?.length || 0}件`);
    
    // 2. 利用可能なシナリオを取得
    const { data: scenarios, error: scenariosError } = await supabase
      .from('scenarios')
      .select('id, title');
    
    if (scenariosError) {
      console.error('シナリオ取得エラー:', scenariosError);
      return;
    }
    
    console.log(`利用可能なシナリオ数: ${scenarios?.length || 0}件`);
    
    // 3. シナリオ名のマッチング
    let matchedCount = 0;
    let updatedCount = 0;
    
    for (const event of nullScenarioEvents || []) {
      if (!event.scenario || event.scenario.trim() === '') {
        console.log(`⚠️ シナリオ名が空: ${event.id}`);
        continue;
      }
      
      // シナリオ名をクリーンアップ（余分な文字を除去）
      const cleanScenarioName = event.scenario
        .replace(/^["「『]/, '') // 先頭の引用符を除去
        .replace(/["」』]$/, '') // 末尾の引用符を除去
        .replace(/^貸・/, '') // 「貸・」プレフィックスを除去
        .replace(/^募・/, '') // 「募・」プレフィックスを除去
        .replace(/^GMテスト・/, '') // 「GMテスト・」プレフィックスを除去
        .replace(/^打診・/, '') // 「打診・」プレフィックスを除去
        .trim();
      
      // 完全一致を探す
      let matchedScenario = scenarios.find(s => s.title === cleanScenarioName);
      
      // 完全一致が見つからない場合、部分一致を探す
      if (!matchedScenario) {
        matchedScenario = scenarios.find(s => 
          s.title.includes(cleanScenarioName) || 
          cleanScenarioName.includes(s.title)
        );
      }
      
      if (matchedScenario) {
        matchedCount++;
        console.log(`✅ マッチ: "${event.scenario}" -> "${matchedScenario.title}" (${matchedScenario.id})`);
        
        // scenario_idを更新
        const { error: updateError } = await supabase
          .from('schedule_events')
          .update({ scenario_id: matchedScenario.id })
          .eq('id', event.id);
        
        if (updateError) {
          console.error(`❌ 更新失敗: ${event.id}`, updateError);
        } else {
          updatedCount++;
          console.log(`✅ 更新完了: ${event.id}`);
        }
      } else {
        console.log(`❌ マッチなし: "${event.scenario}"`);
      }
    }
    
    console.log(`\n=== 修正結果 ===`);
    console.log(`マッチしたシナリオ数: ${matchedCount}件`);
    console.log(`更新された公演数: ${updatedCount}件`);
    console.log(`マッチしなかった公演数: ${(nullScenarioEvents?.length || 0) - matchedCount}件`);
    
  } catch (error) {
    console.error('エラー:', error);
  }
}

fixScenarioIds().catch(console.error);
