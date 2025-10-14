#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GMデータから全ユニークなスタッフ名を抽出
"""

import re
from typing import Set

def normalize_staff_name(name: str) -> str:
    """スタッフ名を正規化"""
    name = name.strip()
    # 括弧内のコメントを除去
    name = re.sub(r'\([^)]*\)', '', name)
    name = re.sub(r'（[^）]*）', '', name)
    name = name.strip()
    return name if name else None

def parse_staff_list(staff_str: str) -> Set[str]:
    """カンマ区切りのスタッフリストをパースして正規化"""
    if not staff_str or staff_str.strip() == '':
        return set()
    
    # カンマまたは、で分割
    names = re.split(r'[,、]', staff_str)
    result = set()
    for name in names:
        normalized = normalize_staff_name(name)
        if normalized and normalized not in ['準備中', '未定', '予定', 'GM増やしたい', 'やりたい', '']:
            result.add(normalized)
    return result

def extract_all_names(filepath: str) -> Set[str]:
    """全ユニークなスタッフ名を抽出"""
    all_names = set()
    
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
        
        # 担当GM
        if len(parts) > 1:
            all_names.update(parse_staff_list(parts[1]))
        
        # 体験済み
        if len(parts) > 2:
            all_names.update(parse_staff_list(parts[2]))
    
    return all_names

def main():
    print("GMデータからユニークなスタッフ名を抽出中...")
    names = extract_all_names('gm_data.txt')
    
    print(f"\n✅ {len(names)}人のユニークなスタッフ名を検出しました\n")
    
    # アルファベット順にソート
    sorted_names = sorted(names)
    
    print("=== 全スタッフ名リスト ===")
    for i, name in enumerate(sorted_names, 1):
        print(f"{i:3d}. {name}")
    
    # SQL用のリストを生成
    print("\n\n=== SQL用 (check_staff_name_mismatches.sqlに貼り付け) ===")
    sql_array = "ARRAY[\n  "
    escaped_names = [f"'{name.replace(chr(39), chr(39)+chr(39))}'" for name in sorted_names]
    sql_array += ",\n  ".join(escaped_names)
    sql_array += "\n]"
    print(sql_array)
    
    # マッピングテーブルのテンプレート
    print("\n\n=== 名前マッピング用テンプレート (name_mapping.txt) ===")
    with open('name_mapping.txt', 'w', encoding='utf-8') as f:
        f.write("# GMデータの名前 -> データベースのスタッフ名\n")
        f.write("# コメント行は # で開始\n")
        f.write("# 形式: GMデータ名,DB名\n\n")
        for name in sorted_names:
            f.write(f"{name},{name}\n")
    
    print("✅ name_mapping.txt を作成しました")
    print("   このファイルを編集して名前のマッピングを定義してください")
    print("   例: えなみ,江波（えなみん）")

if __name__ == '__main__':
    main()

