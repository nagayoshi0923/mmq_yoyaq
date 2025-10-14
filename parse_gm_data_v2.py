#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GMアサインメントデータをマッピングファイルを使ってパースし、SQL INSERTステートメントを生成
"""

import re
from typing import Dict, List, Set, Tuple

def load_name_mapping(filepath: str = 'name_mapping.txt') -> Tuple[Dict[str, str], Set[str]]:
    """
    名前マッピングファイルを読み込む
    
    Returns:
        Tuple[Dict[str, str], Set[str]]: (マッピング辞書, 新規追加スタッフ名set)
    """
    mapping = {}
    new_staff = set()
    skip_names = set()
    
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            
            # コメント行と空行をスキップ
            if not line or line.startswith('#'):
                continue
            
            # コメント部分を除去（# の後ろ）
            if '#' in line:
                line = line.split('#')[0].strip()
            if '＃' in line:
                line = line.split('＃')[0].strip()
            
            # カンマで分割
            parts = line.split(',')
            if len(parts) != 2:
                continue
            
            gm_name = parts[0].strip()
            db_name = parts[1].strip()
            
            if not gm_name or not db_name:
                continue
            
            # SKIPの処理
            if db_name == 'SKIP':
                skip_names.add(gm_name)
                continue
            
            # NEWの処理（新規スタッフ追加）
            if db_name == 'NEW':
                new_staff.add(gm_name)
                mapping[gm_name] = gm_name  # そのまま使用
                continue
            
            mapping[gm_name] = db_name
    
    return mapping, new_staff, skip_names

def normalize_staff_name(name: str) -> str:
    """スタッフ名を正規化（空白や特殊文字を除去）"""
    name = name.strip()
    
    # 特殊ケース: 括弧で始まるものは全体をスキップ
    if name.startswith('(') or name.startswith('（'):
        return None
    
    # 括弧内のコメントを除去（例: "あんころ(11/7テスト)" -> "あんころ"）
    name = re.sub(r'\([^)]*\)', '', name)
    name = re.sub(r'（[^）]*）', '', name)
    
    # サフィックスを除去
    suffixes = ['準備中', 'やりたい', '仮', 'プレイ予定', '？']
    for suffix in suffixes:
        if name.endswith(suffix):
            name = name[:-len(suffix)]
    
    name = name.strip()
    return name if name else None

def parse_staff_list(staff_str: str, name_mapping: Dict[str, str], skip_names: Set[str]) -> List[str]:
    """カンマ区切りのスタッフリストをパースして正規化"""
    if not staff_str or staff_str.strip() == '':
        return []
    
    # カンマまたは、で分割
    names = re.split(r'[,、]', staff_str)
    result = []
    
    for name in names:
        # ・で区切られている場合は分割して個別に処理
        if '・' in name:
            sub_names = name.split('・')
            for sub_name in sub_names:
                normalized = normalize_staff_name(sub_name)
                if normalized:
                    # マッピングを適用して追加
                    _add_staff_to_result(normalized, name_mapping, skip_names, result)
        else:
            normalized = normalize_staff_name(name)
            if normalized:
                # マッピングを適用して追加
                _add_staff_to_result(normalized, name_mapping, skip_names, result)
    
    return result

def _add_staff_to_result(normalized: str, name_mapping: Dict[str, str], skip_names: Set[str], result: List[str]):
    """正規化されたスタッフ名をマッピングして結果リストに追加"""
    # 除外リスト
    if normalized in ['準備中', '未定', '予定', 'GM増やしたい', 'やりたい', '仮']:
        return
    
    # スキップリストをチェック
    if normalized in skip_names:
        return
    
    # マッピングを適用
    if normalized in name_mapping:
        mapped_name = name_mapping[normalized]
        if mapped_name not in result:
            result.append(mapped_name)
    else:
        # マッピングにない場合は警告を出すが、そのまま使用
        print(f"⚠️  警告: '{normalized}' はマッピングファイルにありません")
        if normalized not in result:
            result.append(normalized)

def parse_gm_data_file(filepath: str, name_mapping: Dict[str, str], skip_names: Set[str]) -> Dict[str, Tuple[List[str], List[str]]]:
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
        main_gms = parse_staff_list(parts[1] if len(parts) > 1 else '', name_mapping, skip_names)
        
        # 体験済み
        experienced = parse_staff_list(parts[2] if len(parts) > 2 else '', name_mapping, skip_names)
        
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

def generate_new_staff_sql(new_staff: Set[str]) -> str:
    """新規スタッフ追加用のSQL文を生成"""
    if not new_staff:
        return ""
    
    statements = []
    for staff_name in sorted(new_staff):
        escaped_name = staff_name.replace("'", "''")
        stmt = f"""
INSERT INTO staff (name, status, created_at, updated_at)
VALUES ('{escaped_name}', 'active', NOW(), NOW())
ON CONFLICT (name) DO NOTHING;
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
    print("📖 名前マッピングファイルを読み込み中...")
    name_mapping, new_staff, skip_names = load_name_mapping('name_mapping.txt')
    
    print(f"✅ マッピング: {len(name_mapping)}件")
    print(f"✅ 新規スタッフ: {len(new_staff)}件")
    print(f"✅ スキップ: {len(skip_names)}件")
    
    if new_staff:
        print("\n🆕 新規追加されるスタッフ:")
        for staff in sorted(new_staff):
            print(f"   - {staff}")
    
    print("\n📊 GMアサインメントデータをパース中...")
    scenarios = parse_gm_data_file('gm_data.txt', name_mapping, skip_names)
    
    print(f"✅ {len(scenarios)}件のシナリオを読み込みました")
    
    # 統計情報
    total_main_gms = sum(len(gms) for gms, _ in scenarios.values())
    total_experienced = sum(len(exp) for _, exp in scenarios.values())
    print(f"  - 担当GM: {total_main_gms}件")
    print(f"  - 体験済み: {total_experienced}件")
    
    # 使用された全スタッフ名を収集
    all_used_names = set()
    for main_gms, experienced in scenarios.values():
        all_used_names.update(main_gms)
        all_used_names.update(experienced)
    
    print(f"  - ユニークなスタッフ: {len(all_used_names)}人")
    
    print("\n💾 SQL文を生成中...")
    
    # 新規スタッフ追加SQL
    if new_staff:
        new_staff_sql = generate_new_staff_sql(new_staff)
        with open('database/add_new_staff_from_gm_data.sql', 'w', encoding='utf-8') as f:
            header = f"""-- 新規スタッフを追加
-- 
-- GMデータから検出された新規スタッフをstaffテーブルに追加

{new_staff_sql}

SELECT '✅ 新規スタッフを追加しました' as status;
"""
            f.write(header)
        print("✅ database/add_new_staff_from_gm_data.sql を作成しました")
    
    # GMアサインメントSQL
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
-- 生成日時: 自動生成（マッピング適用済み）
-- 
-- 実行順序:
-- 0. database/add_new_staff_from_gm_data.sql （新規スタッフがいる場合）
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
    if new_staff:
        print("   0. database/add_new_staff_from_gm_data.sql （新規スタッフ追加）")
    print("   1. database/delete_all_gm_assignments.sql")
    for i in range(1, len(parts) + 1):
        print(f"   {i+1}. database/import_correct_gm_assignments_part{i}.sql")
    
    print("\n📋 使用されたスタッフ名一覧:")
    for name in sorted(all_used_names):
        print(f"   - {name}")

if __name__ == '__main__':
    main()

