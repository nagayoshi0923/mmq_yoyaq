#!/usr/bin/env python3
"""
シナリオインポートSQLにGMテスト参加費を追加するスクリプト
通常参加費から1000円引いた金額をGMテスト参加費として設定
"""

import re

def process_sql_line(line):
    """
    INSERT文の各行を処理してgm_test_participation_feeを追加
    形式: ('タイトル', '作者', duration, min, max, difficulty, participation_fee, license_amount, gm_test_license_amount, 'status', 'notes')
    新形式: ('タイトル', '作者', duration, min, max, difficulty, participation_fee, gm_test_participation_fee, license_amount, gm_test_license_amount, 'status', 'notes')
    """
    # INSERT文の行かチェック
    if not line.strip().startswith("('"):
        return line
    
    # 正規表現で値を抽出
    # ('title', 'author', duration, min, max, difficulty, participation_fee, license_amount, gm_test_license_amount, 'status', 'notes/NULL')
    pattern = r"\('([^']+)',\s*'([^']*)',\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*'([^']+)',\s*(.+?)\)(,?)$"
    
    match = re.match(pattern, line.strip())
    if not match:
        return line
    
    title = match.group(1)
    author = match.group(2)
    duration = match.group(3)
    min_players = match.group(4)
    max_players = match.group(5)
    difficulty = match.group(6)
    participation_fee = int(match.group(7))
    license_amount = match.group(8)
    gm_test_license_amount = match.group(9)
    status = match.group(10)
    notes = match.group(11)
    comma = match.group(12)
    
    # GMテスト参加費を計算（participation_fee - 1000、ただし0以下にはしない）
    gm_test_participation_fee = max(0, participation_fee - 1000)
    
    # 新しい行を構築
    new_line = f"('{title}', '{author}', {duration}, {min_players}, {max_players}, {difficulty}, {participation_fee}, {gm_test_participation_fee}, {license_amount}, {gm_test_license_amount}, '{status}', {notes}){comma}\n"
    
    return new_line

def main():
    input_file = 'database/import_scenarios_master_v2.sql'
    output_file = 'database/import_scenarios_master_v2_updated.sql'
    
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    output_lines = []
    for line in lines:
        processed_line = process_sql_line(line)
        output_lines.append(processed_line)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.writelines(output_lines)
    
    print(f"✅ 処理完了: {output_file}")
    scenario_count = len([l for l in output_lines if l.strip().startswith("('")])
    print(f"📝 {scenario_count} 件のシナリオを処理しました")

if __name__ == '__main__':
    main()

