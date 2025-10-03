#!/usr/bin/env node

/**
 * データベーススキーマ確認スクリプト
 * 使用方法: node scripts/check_schema.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase環境変数が設定されていません');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  console.log('🔍 データベーススキーマを確認中...\n');

  try {
    // scenariosテーブルの構造を確認
    console.log('📋 scenariosテーブルの構造:');
    const { data: scenariosInfo, error: scenariosError } = await supabase
      .from('scenarios')
      .select('*')
      .limit(1);

    if (scenariosError) {
      console.error('❌ scenariosテーブルの確認でエラー:', scenariosError);
    } else if (scenariosInfo && scenariosInfo.length > 0) {
      const columns = Object.keys(scenariosInfo[0]);
      console.log('  カラム一覧:', columns.join(', '));
      
      // 重要なカラムの存在確認
      const importantColumns = [
        'production_cost',
        'production_cost_items', 
        'gm_assignments',
        'participation_fee'
      ];
      
      importantColumns.forEach(col => {
        if (columns.includes(col)) {
          console.log(`  ✅ ${col}: 存在`);
        } else {
          console.log(`  ❌ ${col}: 存在しない`);
        }
      });
    }

    console.log('\n📋 schedule_eventsテーブルの構造:');
    const { data: eventsInfo, error: eventsError } = await supabase
      .from('schedule_events')
      .select('*')
      .limit(1);

    if (eventsError) {
      console.error('❌ schedule_eventsテーブルの確認でエラー:', eventsError);
    } else if (eventsInfo && eventsInfo.length > 0) {
      const columns = Object.keys(eventsInfo[0]);
      console.log('  カラム一覧:', columns.join(', '));
      
      // 重要なカラムの存在確認
      const importantColumns = [
        'category',
        'venue',
        'scenario_id'
      ];
      
      importantColumns.forEach(col => {
        if (columns.includes(col)) {
          console.log(`  ✅ ${col}: 存在`);
        } else {
          console.log(`  ❌ ${col}: 存在しない`);
        }
      });
    }

    // データの統計情報
    console.log('\n📊 データ統計:');
    
    const { count: scenariosCount } = await supabase
      .from('scenarios')
      .select('*', { count: 'exact', head: true });
    console.log(`  scenarios: ${scenariosCount}件`);

    const { count: eventsCount } = await supabase
      .from('schedule_events')
      .select('*', { count: 'exact', head: true });
    console.log(`  schedule_events: ${eventsCount}件`);

    console.log('\n✅ スキーマ確認完了');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

checkSchema();
