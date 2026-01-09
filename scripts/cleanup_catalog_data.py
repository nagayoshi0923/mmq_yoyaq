#!/usr/bin/env python3
"""
スクレイピングしたカタログデータのクリーンアップ
"""

import json
import re
from datetime import datetime


def is_valid_scenario_title(title):
    """有効なシナリオタイトルかどうか判定"""
    
    # 明らかに無効なパターン
    invalid_patterns = [
        r'^[\d,.~〜\-\s]+$',  # 数字のみ
        r'^平日[\d,]+',  # 料金パターン
        r'^[\d,]+（',  # 料金パターン（括弧付き）
        r'^🗓',  # 期間限定マーク
        r'^🌀',
        r'^🎭',
        r'^📕',
        r'^📖',
        r'^🔍',
        r'^💀',
        r'^📅',
        r'^🎩',
        r'^🇯🇵',
        r'^💥',
        r'^オススメ$',
        r'^NEW$',
        r'^\d+~\d+$',
        r'^\d+人$',
        r'^\d+〜\d+$',  # 全角チルダ
    ]
    
    for pattern in invalid_patterns:
        if re.match(pattern, title):
            return False
    
    # 短すぎる名前は作者名の可能性が高い（ただし2文字でも有効な場合あり）
    if len(title) < 2:
        return False
    
    # 既知の作者名リスト
    known_authors = [
        'ドニパン', 'りにょり', 'とんとん', '七夕ドグラ', 'WorLd Holic', 'ほがらか',
        'ぶるーそにあ', 'イキザマエンジン', 'そがべ', 'うろん堂', '東大マーダーミステリーサークル',
        '幸田幸', '坊', 'タンブルウィード レッドラム', 'すやてら', '稲垣杏橘', '秋山直太朗',
        'MATH-GAME', '綾部ヒサト', 'える', '夏目美緒', 'リン', 'KOH', 'apri la porta',
        '週末倶楽部', 'しゃみずい', 'マダミステリカ', '久畑ばく', 'UniteLink', 
        'ミステリーテリング', 'イバラユーギ', 'りにょり＆じる', 'さくべえ', 
        'ドキサバ♡委員会', 'まだら牛', 'min', '2U project', 'isayu & Bubble',
        'コノハナストーリー', 'じくまる', 'EGG Mystery Club', 'のりっち', 
        'あそびばくろうさぎ', 'マダミスHOUSE', 'Light and Geek', 'いとはき',
        'OfficeKUMOKANA', 'みこ', '明日森マリー', 'コズミックミステリー', 'The Riverie',
        'いの', 'グーニーカフェ', '前原白夜', '栗田哲也', '前原白夜 & 藤野将壱',
        'へむへむ', '青鬼才', '檜木田正史', 'じゅもく', 'ましー', 'にっし＠ー',
        '桜眠都', '小鳥谷びび', 'Scape Goat', 'ココフォリア', '滝崎はじめ', 'ねこまみれ',
        'ジョイマダ', 'NAGAKUTSU'
    ]
    
    if title in known_authors:
        return False
    
    return True


def load_and_cleanup():
    """JSONを読み込んでクリーンアップ"""
    
    with open("docs/data/queens-waltz-catalog.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    
    scenarios = data["scenarios"]
    
    # 有効なシナリオのみフィルタリング
    valid_scenarios = []
    seen_titles = set()
    
    for s in scenarios:
        title = s.get("title", "")
        
        # タイトルの有効性チェック
        if not is_valid_scenario_title(title):
            continue
        
        # 重複チェック
        if title in seen_titles:
            continue
        
        seen_titles.add(title)
        valid_scenarios.append(s)
    
    # タグを収集
    all_tags = set()
    for s in valid_scenarios:
        all_tags.update(s.get("tags", []))
    
    print(f"クリーンアップ前: {len(scenarios)} シナリオ")
    print(f"クリーンアップ後: {len(valid_scenarios)} シナリオ")
    print(f"タグ: {sorted(all_tags)}")
    
    return valid_scenarios, all_tags


def save_to_markdown(scenarios, all_tags, filepath):
    """Markdownファイルに保存"""
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write("# クインズワルツ カタログ シナリオリスト\n\n")
        f.write("出典: https://queenswaltz.jp/catalog\n\n")
        
        # タグ一覧
        if all_tags:
            f.write("## カテゴリタグ一覧\n\n")
            for tag in sorted(all_tags):
                f.write(f"- {tag}\n")
            f.write("\n")
        
        f.write("## シナリオ一覧\n\n")
        f.write("| タイトル | 作者 | 人数 | 時間 | 料金 | タグ |\n")
        f.write("|---------|------|------|------|------|------|\n")
        
        # 人数でソート（数字部分を抽出）
        def get_player_count(s):
            pc = s.get("player_count", "0人")
            match = re.search(r'(\d+)', pc)
            return int(match.group(1)) if match else 0
        
        sorted_scenarios = sorted(scenarios, key=get_player_count, reverse=True)
        
        for s in sorted_scenarios:
            title = s.get("title", "").replace("|", "\\|")
            author = s.get("author", "").replace("|", "\\|")
            player = s.get("player_count", "").replace("|", "\\|")
            duration = s.get("duration", "").replace("|", "\\|")
            price = s.get("price", "").replace("|", "\\|")
            tags = ", ".join(s.get("tags", []))
            f.write(f"| {title} | {author} | {player} | {duration} | {price} | {tags} |\n")
        
        f.write(f"\n---\n\n")
        f.write(f"*合計: {len(scenarios)}シナリオ*\n")
        f.write(f"*スクレイピング日: {datetime.now().strftime('%Y-%m-%d')}*\n")
    
    print(f"\n保存完了: {filepath}")


def save_to_json(scenarios, all_tags, filepath):
    """JSONファイルに保存"""
    data = {
        "scenarios": scenarios,
        "tags": list(all_tags),
        "scraped_at": datetime.now().isoformat()
    }
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"保存完了: {filepath}")


def main():
    print("=== カタログデータ クリーンアップ ===\n")
    
    scenarios, all_tags = load_and_cleanup()
    
    if scenarios:
        save_to_markdown(scenarios, all_tags, "docs/data/queens-waltz-catalog.md")
        save_to_json(scenarios, all_tags, "docs/data/queens-waltz-catalog.json")
    else:
        print("シナリオが見つかりませんでした")


if __name__ == "__main__":
    main()

