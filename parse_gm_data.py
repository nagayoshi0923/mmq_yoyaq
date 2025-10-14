#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GMアサインメントデータをパースしてSQL INSERTステートメントを生成
"""

import re
from typing import Dict, List, Set, Tuple

def normalize_staff_name(name: str) -> str:
    """スタッフ名を正規化（空白や特殊文字を除去）"""
    name = name.strip()
    # 括弧内のコメントを除去（例: "あんころ(11/7テスト)" -> "あんころ"）
    name = re.sub(r'\([^)]*\)', '', name)
    name = re.sub(r'（[^）]*）', '', name)
    # カタカナの大文字/小文字を統一（例: "キュウ" and "きゅう"）
    name = name.strip()
    return name if name else None

def parse_staff_list(staff_str: str) -> List[str]:
    """カンマ区切りのスタッフリストをパースして正規化"""
    if not staff_str or staff_str.strip() == '':
        return []
    
    # カンマまたは、で分割
    names = re.split(r'[,、]', staff_str)
    result = []
    for name in names:
        normalized = normalize_staff_name(name)
        if normalized and normalized not in ['準備中', '未定', '予定', 'GM増やしたい', 'やりたい']:
            result.append(normalized)
    return result

def parse_gm_data_file(filepath: str) -> Dict[str, Tuple[List[str], List[str]]]:
    """
    GMデータファイルをパースしてシナリオ別のGMアサインメントを返す
    
    Returns:
        Dict[str, Tuple[List[str], List[str]]]: {シナリオ名: (担当GM, 体験済み)}
    """
    scenarios = {}
    
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # ヘッダー行をスキップ
    for line in lines[1:]:
        line = line.strip()
        if not line:
            continue
        
        parts = line.split('\t')
        if len(parts) < 2:
            continue
        
        scenario_title = parts[0].strip()
        if not scenario_title:
            continue
        
        # 担当GM（メインGM可能）
        main_gms = parse_staff_list(parts[1] if len(parts) > 1 else '')
        
        # 体験済み
        experienced = parse_staff_list(parts[2] if len(parts) > 2 else '')
        
        # 特殊ケースの処理: モノクロームと不思議の国の童話裁判
        if scenario_title == 'モノクローム':
            # 特殊な処理が必要
            # TODO: 手動で調整
            pass
        
        scenarios[scenario_title] = (main_gms, experienced)
    
    return scenarios

def generate_insert_statements(scenarios: Dict[str, Tuple[List[str], List[str]]]) -> str:
    """
    INSERT ON CONFLICT UPDATE文を生成
    """
    statements = []
    
    for scenario_title, (main_gms, experienced) in scenarios.items():
        # SQLインジェクション対策: シングルクォートをエスケープ
        escaped_title = scenario_title.replace("'", "''")
        
        # 担当GM (メインGM可能)
        for gm in main_gms:
            escaped_gm = gm.replace("'", "''")
            stmt = f"""
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '{escaped_gm}'
  AND sc.title = '{escaped_title}'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;
"""
            statements.append(stmt)
        
        # 体験済みのみ（GM不可）
        for person in experienced:
            # 担当GMに含まれている場合はスキップ（重複を避ける）
            if person in main_gms:
                continue
            
            escaped_person = person.replace("'", "''")
            stmt = f"""
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '{escaped_person}'
  AND sc.title = '{escaped_title}'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;
"""
            statements.append(stmt)
    
    return '\n'.join(statements)

def split_sql_into_parts(sql: str, max_statements_per_file: int = 100) -> List[str]:
    """SQLを複数のパートに分割"""
    statements = [s.strip() for s in sql.split('INSERT INTO') if s.strip()]
    parts = []
    
    for i in range(0, len(statements), max_statements_per_file):
        chunk = statements[i:i+max_statements_per_file]
        # "INSERT INTO" を戻す
        chunk_sql = '\n\n'.join(['INSERT INTO ' + s for s in chunk])
        parts.append(chunk_sql)
    
    return parts

def main():
    print("GMアサインメントデータをパース中...")
    scenarios = parse_gm_data_file('gm_data.txt')
    
    print(f"✅ {len(scenarios)}件のシナリオを読み込みました")
    
    # 統計情報
    total_main_gms = sum(len(gms) for gms, _ in scenarios.values())
    total_experienced = sum(len(exp) for _, exp in scenarios.values())
    print(f"  - 担当GM: {total_main_gms}件")
    print(f"  - 体験済み: {total_experienced}件")
    
    print("\nSQL文を生成中...")
    sql = generate_insert_statements(scenarios)
    
    # 複数ファイルに分割
    parts = split_sql_into_parts(sql, max_statements_per_file=150)
    
    print(f"✅ {len(parts)}個のSQLファイルに分割します")
    
    # 削除用SQL
    delete_sql = """-- 既存のGMアサインメントを全削除
-- ⚠️ 警告: このSQLは全てのGMアサインメントデータを削除します

DELETE FROM staff_scenario_assignments;

SELECT '✅ 既存のGMアサインメントを削除しました' as status;
"""
    
    with open('database/delete_all_gm_assignments.sql', 'w', encoding='utf-8') as f:
        f.write(delete_sql)
    print("✅ database/delete_all_gm_assignments.sql を作成しました")
    
    # 各パートを別ファイルとして保存
    for i, part_sql in enumerate(parts, 1):
        filename = f'database/import_correct_gm_assignments_part{i}.sql'
        header = f"""-- 正しいGMアサインメントをインポート (Part {i}/{len(parts)})
-- 
-- 生成日時: 自動生成
-- 
-- 実行順序:
-- 1. database/delete_all_gm_assignments.sql （初回のみ）
-- 2. database/import_correct_gm_assignments_part1.sql
-- 3. database/import_correct_gm_assignments_part2.sql
-- ... (順番に実行)

{part_sql}

SELECT '✅ Part {i}/{len(parts)} のインポートが完了しました' as status;
"""
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(header)
        print(f"✅ {filename} を作成しました")
    
    print("\n🎉 完了！以下の順番で実行してください:")
    print("   1. database/delete_all_gm_assignments.sql")
    for i in range(1, len(parts) + 1):
        print(f"   {i+1}. database/import_correct_gm_assignments_part{i}.sql")

if __name__ == '__main__':
    main()

