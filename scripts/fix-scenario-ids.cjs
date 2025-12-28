const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://cznpcewciwywcqcxktba.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6bnBjZXdjaXd5d2NxY3hrdGJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzMyMjAsImV4cCI6MjA3NDIwOTIyMH0.GBR1kO877s6iy1WmVXL4xY8wpsyAdmgsXKEQbm0MNLo';

const supabase = createClient(supabaseUrl, supabaseKey);

// シナリオ名のエイリアスマッピング
const SCENARIO_ALIAS = {
  '真渋谷陰陽奇譚': '真・渋谷陰陽奇譚',
  '渋谷陰陽奇譚': '真・渋谷陰陽奇譚',
  '土牢の悲鳴に谺して': '土牢に悲鳴は谺して',
  '百鬼の夜月光の影': '百鬼の夜、月光の影',
  'インビジブル亡霊列車': 'Invisible-亡霊列車-',
  'くずの葉の森': 'くずの葉のもり',
  'ドクターテラスの秘密の実験': 'ドクター・テラスの秘密の実験',
  'あるミステリーについて': 'あるマーダーミステリーについて',
  'ナナイロの迷宮-緑-アペイロン研究所殺人事件': 'ナナイロの迷宮 緑 アペイロン研究所殺人事件',
  'ナナイロの迷宮・緑アペイロン研究所殺人事件': 'ナナイロの迷宮 緑 アペイロン研究所殺人事件',
  'ナナイロの迷宮　緑　アペイロン研究所殺人事件': 'ナナイロの迷宮 緑 アペイロン研究所殺人事件',
  'MurderWonderLand': 'リアルマダミス-MurderWonderLand',
  'GROLIAMEMORIES': 'グロリアメモリーズ',
  '募SORCIER': 'SORCIER〜賢者達の物語〜',
  'SORCIER': 'SORCIER〜賢者達の物語〜',
  'ソルシエ': 'SORCIER〜賢者達の物語〜',
  '藍雨': '藍雨廻逢',
  "THEREALFOLK'30s": "TheRealFork30's",
  'THEREALFOLK': "TheRealFork30's",
  'TheRealFolk': "TheRealFork30's",
  "THEREALFORK30's": "TheRealFork30's",
  'マダミスキネマ2/THEREALFORK30\'s': "TheRealFork30's",
  'マダミスキネマ作品/THEREALFORK30\'s': "TheRealFork30's",
  'トレタリ': '超特急の呪いの館で撮れ高足りてますか？',
  'さきこさん': '裂き子さん',
  '狂気山脈1': '狂気山脈　陰謀の分水嶺（１）',
  '狂気山脈2': '狂気山脈　星降る天辺（２）',
  '狂気山脈3': '狂気山脈　薄明三角点（３）',
  '狂気山脈2.5': '狂気山脈　2.5　頂上戦争',
  'マーダーエクスプローラー': 'マーダーオブエクスプローラー失われし大秘宝',
  'マダミスキネマ3／マーダーエクスプローラー': 'マーダーオブエクスプローラー失われし大秘宝',
};

async function fixScenarioIds() {
  console.log('=== scenario_idの修正を開始 ===');
  
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
    
    let cleanScenarioName = event.scenario
      .replace(/^["「『📗📕]/, '')
      .replace(/["」』]$/, '')
      .replace(/^貸・/, '')
      .replace(/^募・/, '')
      .replace(/^🈵・/, '')
      .replace(/^GMテスト・/, '')
      .replace(/^打診・/, '')
      .replace(/^仮/, '')
      .replace(/^（仮）/, '')
      .replace(/^\(仮\)/, '')
      .replace(/\(.*?\)$/, '') // 末尾の括弧を除去
      .replace(/（.*?）$/, '') // 末尾の全角括弧を除去
      .trim();
    
    // 長さが2文字未満はスキップ
    if (cleanScenarioName.length < 2) {
      continue;
    }
    
    // エイリアスマッピングを適用
    if (SCENARIO_ALIAS[cleanScenarioName]) {
      cleanScenarioName = SCENARIO_ALIAS[cleanScenarioName];
    }
    
    // エイリアスの部分一致も試す
    for (const [alias, formal] of Object.entries(SCENARIO_ALIAS)) {
      if (cleanScenarioName.includes(alias)) {
        cleanScenarioName = formal;
        break;
      }
    }
    
    let matchedScenario = null;
    
    // 1. 完全一致を探す
    matchedScenario = scenarios.find(s => s.title === cleanScenarioName);
    
    // 2. 前方一致
    if (!matchedScenario) {
      matchedScenario = scenarios.find(s => s.title.startsWith(cleanScenarioName));
    }
    
    // 3. シナリオタイトルが入力に含まれている
    if (!matchedScenario) {
      matchedScenario = scenarios.find(s => cleanScenarioName.includes(s.title));
    }
    
    // 4. 入力がシナリオタイトルに含まれている（4文字以上の場合のみ）
    if (!matchedScenario && cleanScenarioName.length >= 4) {
      matchedScenario = scenarios.find(s => s.title.includes(cleanScenarioName));
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

fixScenarioIds().catch(console.error);

