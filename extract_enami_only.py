#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
えなみ（江波（えなみん））だけのGMアサインメントSQLを生成
"""

import re
from typing import Dict, List, Tuple

def normalize_staff_name(name: str) -> str:
    """スタッフ名を正規化"""
    name = name.strip()
    
    if name.startswith('(') or name.startswith('（'):
        return None
    
    name = re.sub(r'\([^)]*\)', '', name)
    name = re.sub(r'（[^）]*）', '', name)
    
    suffixes = ['準備中', 'やりたい', '仮', 'プレイ予定', '？']
    for suffix in suffixes:
        if name.endswith(suffix):
            name = name[:-len(suffix)]
    
    name = name.strip()
    return name if name else None

def parse_staff_list(staff_str: str) -> List[str]:
    """カンマ区切りのスタッフリストをパースして、えなみ/えなみん のみ抽出"""
    if not staff_str or staff_str.strip() == '':
        return []
    
    names = re.split(r'[,、]', staff_str)
    result = []
    
    for name in names:
        # ・で区切られている場合は分割
        if '・' in name:
            sub_names = name.split('・')
            for sub_name in sub_names:
                normalized = normalize_staff_name(sub_name)
                if normalized and normalized in ['えなみ', 'えなみん']:
                    result.append(normalized)
        else:
            normalized = normalize_staff_name(name)
            if normalized and normalized in ['えなみ', 'えなみん']:
                result.append(normalized)
    
    return result

def extract_enami_assignments(filepath: str) -> Tuple[List[str], List[str]]:
    """えなみの担当GM一覧と体験済み一覧を抽出"""
    main_gm_scenarios = []
    experienced_scenarios = []
    
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    for line in lines[1:]:  # ヘッダー行をスキップ
        line = line.strip()
        if not line:
            continue
        
        parts = line.split('\t')
        if len(parts) < 2:
            continue
        
        scenario_title = parts[0].strip()
        if not scenario_title:
            continue
        
        # 担当GM
        main_gms = parse_staff_list(parts[1] if len(parts) > 1 else '')
        if main_gms:
            main_gm_scenarios.append(scenario_title)
        
        # 体験済み
        experienced = parse_staff_list(parts[2] if len(parts) > 2 else '')
        if experienced and not main_gms:  # 担当GMにいない場合のみ
            experienced_scenarios.append(scenario_title)
    
    return main_gm_scenarios, experienced_scenarios

def generate_enami_sql(main_gm_scenarios: List[str], experienced_scenarios: List[str]) -> str:
    """えなみのアサインメントSQL生成"""
    statements = []
    
    # 担当GM
    for scenario_title in main_gm_scenarios:
        escaped_title = scenario_title.replace("'", "''")
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
WHERE s.name = '江波（えなみん）'
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
    
    # 体験済み
    for scenario_title in experienced_scenarios:
        escaped_title = scenario_title.replace("'", "''")
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
WHERE s.name = '江波（えなみん）'
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

def main():
    print("えなみ（江波（えなみん））のアサインメントを抽出中...")
    main_gm_scenarios, experienced_scenarios = extract_enami_assignments('gm_data.txt')
    
    print(f"✅ 担当GM: {len(main_gm_scenarios)}件")
    print(f"✅ 体験済み: {len(experienced_scenarios)}件")
    
    sql = generate_enami_sql(main_gm_scenarios, experienced_scenarios)
    
    header = f"""-- えなみ（江波（えなみん））のGMアサインメントを更新
-- 
-- このSQLは江波（えなみん）のアサインメントのみを更新します
-- 既存のえなみのアサインメントは上書きされます

{sql}

SELECT '✅ 江波（えなみん）のアサインメントを更新しました' as status;
SELECT '  - 担当GM: {len(main_gm_scenarios)}件' as detail;
SELECT '  - 体験済み: {len(experienced_scenarios)}件' as detail;
"""
    
    with open('database/update_enami_assignments.sql', 'w', encoding='utf-8') as f:
        f.write(header)
    
    print("✅ database/update_enami_assignments.sql を作成しました")
    print("\n🎉 このファイルだけを実行すれば、えなみのアサインメントが更新されます！")

if __name__ == '__main__':
    main()

