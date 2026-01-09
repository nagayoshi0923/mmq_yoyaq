#!/usr/bin/env python3
"""
カタログ情報でDBのシナリオマスタを更新
- 作者
- 人数（min/max両方に同じ値）
- 時間（分に変換）
- タグ（genreに追加）
"""

import os
import json
import re
from supabase import create_client, Client
from dotenv import load_dotenv

# 環境変数の読み込み
load_dotenv('.env.local')
load_dotenv()


def get_supabase_client():
    url = os.getenv("VITE_SUPABASE_URL")
    # SERVICE_ROLE_KEYを優先使用（RLSをバイパス）
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")
    
    if not url or not key:
        print("❌ エラー: VITE_SUPABASE_URL と キーを設定してください")
        return None
    
    if os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
        print("✓ SERVICE_ROLE_KEY を使用（RLSバイパス）")
    else:
        print("⚠ ANON_KEY を使用（RLS適用）")
        print("  RLSをバイパスするには SUPABASE_SERVICE_ROLE_KEY を設定してください")
    
    return create_client(url, key)


def parse_player_count(player_str):
    """
    人数文字列をパース
    例: "7人" -> 7, "6~8人" -> 6, "6-8人" -> 6
    """
    if not player_str:
        return None
    
    # 数字を抽出
    match = re.search(r'(\d+)', player_str)
    if match:
        return int(match.group(1))
    return None


def parse_duration_to_minutes(duration_str):
    """
    時間文字列を分に変換
    例: "4時間" -> 240, "2.5時間" -> 150, "3~3.5時間" -> 180, "3.5~4時間" -> 210
    """
    if not duration_str:
        return None
    
    # "~" や "～" で区切られている場合は最初の値を使用
    duration_str = duration_str.replace('～', '~')
    if '~' in duration_str:
        duration_str = duration_str.split('~')[0]
    
    # 数字（小数含む）を抽出
    match = re.search(r'([\d.]+)', duration_str)
    if match:
        hours = float(match.group(1))
        return int(hours * 60)
    return None


def map_tags_to_genre(tags):
    """
    カタログのタグをDBのgenreに変換
    """
    tag_to_genre = {
        "新作": "新作",
        "ロングセラー": "ロングセラー",
        "RP重視": "RP重視",
        "ミステリー重視": "ミステリー重視",
        "情報量多め": "情報量多め",
        "デスゲーム": "デスゲーム",
        "オススメ": "オススメ",
        "経験者向け": "経験者向け",
    }
    
    genres = []
    for tag in tags:
        # タグの前後の絵文字や空白を除去
        clean_tag = re.sub(r'^[✨🌀🎭💀📅💥🇯🇵📖🎩🗓️🔰🔍\s]+', '', tag)
        clean_tag = re.sub(r'[✨🌀🎭💀📅💥🇯🇵📖🎩🗓️🔰🔍\s]+$', '', clean_tag)
        
        if clean_tag in tag_to_genre:
            genres.append(tag_to_genre[clean_tag])
        elif clean_tag:
            genres.append(clean_tag)
    
    return genres


def load_mapping_data():
    """マッピングデータを読み込み（レガシーテーブル用）"""
    with open("docs/data/scenario-mapping-legacy.json", "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    print("=== カタログ情報でDBを更新 ===\n")
    
    # Supabase接続
    supabase = get_supabase_client()
    if not supabase:
        return
    
    # マッピングデータ読み込み
    data = load_mapping_data()
    matched = data.get("matched", [])
    
    print(f"マッチしたシナリオ: {len(matched)} 件\n")
    
    # 更新対象のデータを準備
    updates = []
    skipped = []
    
    for m in matched:
        db_id = m.get("db_id")
        db_title = m.get("db_title")
        catalog_data = m.get("catalog_data", {})
        
        # カタログ情報をパース
        author = catalog_data.get("author", "")
        player_count = parse_player_count(catalog_data.get("player_count", ""))
        duration = parse_duration_to_minutes(catalog_data.get("duration", ""))
        tags = catalog_data.get("tags", [])
        genres = map_tags_to_genre(tags)
        
        # 更新データを構築
        update_data = {"id": db_id}
        
        if author and author != "不明":
            update_data["author"] = author
        
        if player_count:
            update_data["player_count_min"] = player_count
            update_data["player_count_max"] = player_count
        
        if duration:
            update_data["duration"] = duration  # scenariosテーブルは duration
        
        if genres:
            update_data["genre"] = genres
        
        # 更新するフィールドがあれば追加
        if len(update_data) > 1:  # idのみの場合はスキップ
            updates.append({
                "title": db_title,
                "update_data": update_data,
                "catalog_info": {
                    "author": author,
                    "player_count": catalog_data.get("player_count"),
                    "duration": catalog_data.get("duration"),
                    "tags": tags
                }
            })
        else:
            skipped.append(db_title)
    
    print(f"更新対象: {len(updates)} 件")
    print(f"スキップ: {len(skipped)} 件\n")
    
    # 更新内容をプレビュー
    print("=== 更新内容プレビュー（最初の10件）===\n")
    for u in updates[:10]:
        print(f"【{u['title']}】")
        ud = u['update_data']
        ci = u['catalog_info']
        if 'author' in ud:
            print(f"  作者: {ud['author']}")
        if 'player_count_min' in ud:
            print(f"  人数: {ud['player_count_min']}人 (min/max)")
        if 'duration' in ud:
            print(f"  時間: {ud['duration']}分 (元: {ci['duration']})")
        if 'genre' in ud:
            print(f"  ジャンル: {ud['genre']}")
        print()
    
    # 確認
    print("=" * 50)
    confirm = input("\n更新を実行しますか？ (yes/no): ")
    
    if confirm.lower() != 'yes':
        print("キャンセルしました")
        return
    
    # 更新実行
    print("\n=== 更新実行 ===\n")
    
    success_scenarios = 0
    success_masters = 0
    error_count = 0
    
    for u in updates:
        title = u['title']
        update_data = u['update_data'].copy()
        scenario_id = update_data.pop('id')  # idを取り出す
        
        # scenarios テーブル用データ
        scenarios_data = update_data.copy()
        
        # scenario_masters テーブル用データ（カラム名の調整）
        masters_data = {}
        if 'author' in update_data:
            masters_data['author'] = update_data['author']
        if 'player_count_min' in update_data:
            masters_data['player_count_min'] = update_data['player_count_min']
        if 'player_count_max' in update_data:
            masters_data['player_count_max'] = update_data['player_count_max']
        if 'duration' in update_data:
            masters_data['official_duration'] = update_data['duration']  # マスタはofficial_duration
        if 'genre' in update_data:
            masters_data['genre'] = update_data['genre']
        
        # scenarios テーブルを更新
        try:
            result = supabase.table('scenarios').update(scenarios_data).eq('id', scenario_id).execute()
            if result.data:
                success_scenarios += 1
                print(f"✓ [scenarios] {title}")
            else:
                print(f"- [scenarios] {title} (データなし/RLS)")
        except Exception as e:
            print(f"✗ [scenarios] {title} エラー: {e}")
        
        # scenario_masters テーブルを更新
        if masters_data:
            try:
                result = supabase.table('scenario_masters').update(masters_data).eq('id', scenario_id).execute()
                if result.data:
                    success_masters += 1
                    print(f"✓ [masters] {title}")
                else:
                    print(f"- [masters] {title} (データなし/RLS)")
            except Exception as e:
                print(f"✗ [masters] {title} エラー: {e}")
    
    print(f"\n=== 完了 ===")
    print(f"scenarios 更新: {success_scenarios} 件")
    print(f"scenario_masters 更新: {success_masters} 件")


if __name__ == "__main__":
    main()

