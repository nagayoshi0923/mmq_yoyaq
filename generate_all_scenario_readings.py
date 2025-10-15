#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全シナリオのタイトルから読み仮名を自動生成
pykakasiを使って日本語を自動的にローマ字に変換
"""

from pykakasi import kakasi
import re
from typing import Dict, Tuple, Set

def extract_scenario_titles(filepath: str = 'gm_data.txt') -> Set[str]:
    """GMデータファイルから全シナリオタイトルを抽出"""
    titles = set()
    
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    for line in lines[1:]:  # ヘッダー行をスキップ
        line = line.strip()
        if not line:
            continue
        
        parts = line.split('\t')
        if len(parts) >= 1:
            title = parts[0].strip()
            if title:
                # 注釈を削除
                title = re.sub(r'※.*', '', title).strip()
                title = re.sub(r'"', '', title).strip()
                titles.add(title)
    
    return titles

def generate_readings(title: str, kks) -> Tuple[str, str]:
    """
    タイトルから読み仮名を自動生成
    
    Returns:
        Tuple[str, str]: (カタカナ, アルファベット)
    """
    # pykakasiで変換
    result = kks.convert(title)
    
    # カタカナ  
    katakana = ''.join([item['kana'] for item in result])
    
    # ローマ字（ヘボン式）
    alphabet = ''.join([item['hepburn'] for item in result])
    
    # アルファベットを小文字に、スペースや記号を削除
    alphabet = re.sub(r'[^a-zA-Z0-9]', '', alphabet.lower())
    
    # 長すぎる場合は短縮
    if len(alphabet) > 50:
        alphabet = alphabet[:50]
    
    return katakana, alphabet

def generate_readings_sql(readings: Dict[str, Tuple[str, str]]) -> str:
    """読み仮名の一括UPDATE SQLを生成"""
    statements = []
    
    for title, (katakana, alphabet) in sorted(readings.items()):
        escaped_title = title.replace("'", "''")
        escaped_katakana = katakana.replace("'", "''")
        escaped_alphabet = alphabet.replace("'", "''")
        
        stmt = f"""
UPDATE scenarios 
SET 
  reading_katakana = '{escaped_katakana}',
  reading_alphabet = '{escaped_alphabet}'
WHERE title = '{escaped_title}';
"""
        statements.append(stmt)
    
    return '\n'.join(statements)

def main():
    print("📚 シナリオタイトルを抽出中...")
    titles = extract_scenario_titles('gm_data.txt')
    
    print(f"✅ {len(titles)}件のシナリオを検出しました\n")
    
    print("🔄 pykakasiで読み仮名を自動生成中...")
    
    # pykakasiの初期化
    kks = kakasi()
    
    readings = {}
    
    for i, title in enumerate(sorted(titles), 1):
        katakana, alphabet = generate_readings(title, kks)
        readings[title] = (katakana, alphabet)
        
        if i <= 20:  # 最初の20件を表示
            print(f"  {i:3d}. {title}")
            print(f"       カタカナ: {katakana}")
            print(f"       ローマ字: {alphabet}")
            print()
    
    if len(titles) > 20:
        print(f"  ... 残り {len(titles) - 20}件")
    
    print("\n💾 SQLを生成中...")
    sql = generate_readings_sql(readings)
    
    header = f"""-- シナリオ読み仮名の一括インポート（自動生成）
-- 
-- 生成件数: {len(readings)}件
-- pykakasiを使用して自動生成
-- カタカナ・アルファベット（ローマ字）での検索を可能にする

{sql}

SELECT '✅ {len(readings)}件のシナリオ読み仮名を登録しました' as status;

-- 確認: アルファベット順で確認
SELECT 
  title,
  reading_alphabet,
  reading_katakana
FROM scenarios
WHERE reading_alphabet IS NOT NULL
ORDER BY reading_alphabet
LIMIT 30;
"""
    
    with open('database/import_all_scenario_readings.sql', 'w', encoding='utf-8') as f:
        f.write(header)
    
    print("✅ database/import_all_scenario_readings.sql を作成しました")
    
    print("\n🎉 完了！以下を実行してください:")
    print("   1. database/add_scenario_reading.sql （カラム追加）")
    print("   2. database/import_all_scenario_readings.sql （読み仮名登録）")
    
    print("\n📋 検索例:")
    sample_scenarios = list(sorted(readings.items()))[:5]
    for title, (katakana, alphabet) in sample_scenarios:
        print(f"  '{alphabet}' → {title}")

if __name__ == '__main__':
    main()

