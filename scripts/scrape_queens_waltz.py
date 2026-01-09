#!/usr/bin/env python3
"""
クインズワルツのCoubic予約ページからシナリオ情報をスクレイピング（高速版）
"""

import asyncio
import re
import json
from playwright.async_api import async_playwright


def clean_title(title):
    """タイトルから【】を除去してシナリオ名を抽出"""
    # 【店舗名】や【GM:xxx】などを除去
    title = re.sub(r'【[^】]*】', '', title).strip()
    return title


def is_rental_or_other(title):
    """貸切予約枠やその他の非シナリオ項目かどうか"""
    skip_keywords = ['貸切予約枠', '貸切申し込み', '特定商取引法', 'キャンセル', '問い合わせ', 'サービス']
    return any(kw in title for kw in skip_keywords)


async def scrape_scenarios():
    """全シナリオ情報を取得"""
    scenarios = []
    seen_titles = set()
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        base_url = "https://coubic.com/queens-waltz/booking_pages"
        
        page_num = 1
        max_pages = 70
        
        while page_num <= max_pages:
            url = f"{base_url}?page={page_num}"
            print(f"ページ {page_num}: {url}")
            
            try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
                await page.wait_for_timeout(1500)
                
                body_text = await page.inner_text('body')
                lines = body_text.split('\n')
                
                found_on_page = 0
                
                for i, line in enumerate(lines):
                    line = line.strip()
                    if not line:
                        continue
                    
                    # 【店舗名】シナリオ名 のパターンを検出
                    if line.startswith('【') and '】' in line:
                        if is_rental_or_other(line):
                            continue
                        
                        raw_title = line
                        clean = clean_title(line)
                        
                        if clean and len(clean) > 1 and clean not in seen_titles:
                            seen_titles.add(clean)
                            
                            # 価格を探す
                            price = "不明"
                            for j in range(i+1, min(i+15, len(lines))):
                                next_line = lines[j].strip()
                                price_match = re.search(r'([\d,]+)円', next_line)
                                if price_match:
                                    price = price_match.group(0)
                                    break
                            
                            scenarios.append({
                                "title": clean,
                                "raw_title": raw_title,
                                "price": price
                            })
                            found_on_page += 1
                            print(f"  ✓ {clean} | {price}")
                
                print(f"  → このページで {found_on_page} 件発見")
                
                # 次のページがあるか確認
                if found_on_page == 0:
                    # 何も見つからなければ終了
                    print(f"\n最終ページ: {page_num}")
                    break
                
                page_num += 1
                
            except Exception as e:
                print(f"  ✗ エラー: {e}")
                break
        
        await browser.close()
    
    return scenarios


def save_to_markdown(scenarios, filepath):
    """Markdownファイルに保存"""
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write("# クインズワルツ シナリオリスト\n\n")
        f.write("出典: https://coubic.com/queens-waltz/booking_pages\n\n")
        f.write("## シナリオ一覧\n\n")
        f.write("| タイトル | 公演金額（1名） |\n")
        f.write("|---------|----------------|\n")
        
        for s in scenarios:
            f.write(f"| {s['title']} | {s.get('price', '不明')} |\n")
        
        f.write(f"\n---\n\n*合計: {len(scenarios)}シナリオ*\n")
        f.write("*スクレイピング日: 2026-01-08*\n")
    
    print(f"\n保存完了: {filepath}")


def save_to_json(scenarios, filepath):
    """JSONファイルに保存"""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(scenarios, f, ensure_ascii=False, indent=2)
    print(f"保存完了: {filepath}")


async def main():
    print("=== クインズワルツ シナリオスクレイピング ===\n")
    
    scenarios = await scrape_scenarios()
    
    print(f"\n=============================")
    print(f"取得したシナリオ数: {len(scenarios)}")
    print(f"=============================")
    
    if scenarios:
        save_to_markdown(scenarios, "docs/data/queens-waltz-scenarios.md")
        save_to_json(scenarios, "docs/data/queens-waltz-scenarios.json")
    else:
        print("シナリオが取得できませんでした")


if __name__ == "__main__":
    asyncio.run(main())
