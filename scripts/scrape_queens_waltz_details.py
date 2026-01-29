#!/usr/bin/env python3
"""
クインズワルツのCoubic予約ページからシナリオ詳細情報をスクレイピング
"""

import asyncio
import re
import json
from playwright.async_api import async_playwright


def clean_title(title):
    """タイトルから【】を除去してシナリオ名を抽出"""
    title = re.sub(r'【[^】]*】', '', title).strip()
    return title


def is_rental_or_other(title):
    """貸切予約枠やその他の非シナリオ項目かどうか"""
    skip_keywords = ['貸切予約枠', '貸切申し込み', '特定商取引法', 'キャンセル', '問い合わせ', 'サービス']
    return any(kw in title for kw in skip_keywords)


async def scrape_all_links():
    """全シナリオのリンクを取得"""
    scenario_links = []
    seen_titles = set()
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        base_url = "https://coubic.com/queens-waltz/booking_pages"
        page_num = 1
        max_pages = 70
        
        while page_num <= max_pages:
            url = f"{base_url}?page={page_num}"
            print(f"リンク収集 ページ {page_num}: {url}")
            
            try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
                await page.wait_for_timeout(1500)
                
                # リンクを取得
                links = await page.query_selector_all('a[href*="/queens-waltz/"]')
                found = 0
                
                for link in links:
                    try:
                        href = await link.get_attribute("href")
                        text = await link.inner_text()
                        
                        if not href or "booking_pages" in href or "legal" in href or "services" in href:
                            continue
                        
                        if not text.startswith('【'):
                            continue
                            
                        if is_rental_or_other(text):
                            continue
                        
                        clean = clean_title(text)
                        if clean and len(clean) > 1 and clean not in seen_titles:
                            seen_titles.add(clean)
                            
                            if href.startswith("/"):
                                href = f"https://coubic.com{href}"
                            
                            scenario_links.append({
                                "title": clean,
                                "raw_title": text,
                                "url": href
                            })
                            found += 1
                    except:
                        continue
                
                print(f"  → {found} 件のリンクを発見")
                
                if found == 0:
                    # ページに新しいシナリオがなければ終了
                    body_text = await page.inner_text('body')
                    if '【' not in body_text:
                        print(f"最終ページ: {page_num}")
                        break
                
                page_num += 1
                
            except Exception as e:
                print(f"  ✗ エラー: {e}")
                break
        
        await browser.close()
    
    return scenario_links


async def scrape_details(scenario_links):
    """各シナリオの詳細情報を取得"""
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        total = len(scenario_links)
        
        for i, scenario in enumerate(scenario_links):
            try:
                print(f"[{i+1}/{total}] {scenario['title']}")
                
                await page.goto(scenario['url'], wait_until="networkidle", timeout=30000)
                await page.wait_for_timeout(1000)
                
                body_text = await page.inner_text('body')
                
                # 価格を抽出
                price_match = re.search(r'([\d,]+)円\s*\(税込\)', body_text)
                if not price_match:
                    price_match = re.search(r'([\d,]+)円', body_text)
                scenario['price'] = price_match.group(0) if price_match else "不明"
                
                # 人数を抽出 - より詳細なパターン
                players = "不明"
                # "5人" "5〜6人" "5-6人" "5名"
                players_patterns = [
                    r'プレイ人数[：:]\s*(\d+(?:\s*[-~〜]\s*\d+)?)\s*[人名]',
                    r'参加人数[：:]\s*(\d+(?:\s*[-~〜]\s*\d+)?)\s*[人名]',
                    r'(\d+)\s*[-~〜]\s*(\d+)\s*[人名]',
                    r'(\d+)\s*[人名]用',
                    r'(\d+)\s*[人名]プレイ',
                ]
                for pattern in players_patterns:
                    match = re.search(pattern, body_text)
                    if match:
                        if len(match.groups()) == 2:
                            players = f"{match.group(1)}〜{match.group(2)}人"
                        else:
                            players = f"{match.group(1)}人"
                        break
                scenario['players'] = players
                
                # 時間を抽出
                duration = "不明"
                time_patterns = [
                    r'プレイ時間[：:]\s*約?\s*(\d+(?:\s*[-~〜]\s*\d+)?)\s*時間',
                    r'所要時間[：:]\s*約?\s*(\d+(?:\s*[-~〜]\s*\d+)?)\s*時間',
                    r'(\d+)\s*時間\s*半',
                    r'(\d+)\s*[-~〜]\s*(\d+)\s*時間',
                    r'約\s*(\d+)\s*時間',
                    r'(\d+)\s*時間程度',
                    r'(\d+)\s*時間',
                ]
                for pattern in time_patterns:
                    match = re.search(pattern, body_text)
                    if match:
                        if '半' in body_text[max(0,match.start()-10):match.end()+10]:
                            duration = f"{match.group(1)}時間半"
                        elif len(match.groups()) >= 2 and match.group(2):
                            duration = f"{match.group(1)}〜{match.group(2)}時間"
                        else:
                            duration = f"{match.group(1)}時間"
                        break
                scenario['duration'] = duration
                
                # 作者を抽出
                author = "不明"
                author_patterns = [
                    r'(?:シナリオ)?制作[：:／/]\s*([^\n\r【】（）\(\)]+)',
                    r'作者[：:／/]\s*([^\n\r【】（）\(\)]+)',
                    r'著者[：:／/]\s*([^\n\r【】（）\(\)]+)',
                    r'(?:by|By)[：:\s]+([^\n\r【】（）\(\)]+)',
                ]
                for pattern in author_patterns:
                    match = re.search(pattern, body_text)
                    if match:
                        author = match.group(1).strip()[:50]
                        break
                scenario['author'] = author
                
                print(f"  ✓ {scenario['price']} | {scenario['players']} | {scenario['duration']} | {scenario['author']}")
                
            except Exception as e:
                scenario['price'] = scenario.get('price', '不明')
                scenario['players'] = '不明'
                scenario['duration'] = '不明'
                scenario['author'] = '不明'
                print(f"  ✗ エラー: {e}")
        
        await browser.close()
    
    return scenario_links


def save_to_markdown(scenarios, filepath):
    """Markdownファイルに保存"""
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write("# クインズワルツ シナリオリスト\n\n")
        f.write("出典: https://coubic.com/queens-waltz/booking_pages\n\n")
        f.write("## シナリオ一覧\n\n")
        f.write("| タイトル | 公演金額 | 人数 | 時間 | 作者 |\n")
        f.write("|---------|---------|------|------|------|\n")
        
        for s in scenarios:
            title = s.get('title', '').replace('|', '｜')
            f.write(f"| {title} | {s.get('price', '不明')} | {s.get('players', '不明')} | {s.get('duration', '不明')} | {s.get('author', '不明')} |\n")
        
        f.write(f"\n---\n\n*合計: {len(scenarios)}シナリオ*\n")
        f.write("*スクレイピング日: 2026-01-08*\n")
    
    print(f"\n保存完了: {filepath}")


def save_to_json(scenarios, filepath):
    """JSONファイルに保存"""
    # raw_titleを除去
    clean_scenarios = []
    for s in scenarios:
        clean_s = {k: v for k, v in s.items() if k != 'raw_title'}
        clean_scenarios.append(clean_s)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(clean_scenarios, f, ensure_ascii=False, indent=2)
    print(f"保存完了: {filepath}")


async def main():
    print("=== クインズワルツ シナリオ詳細スクレイピング ===\n")
    
    # ステップ1: 全リンクを収集
    print("【ステップ1】全シナリオのリンクを収集中...\n")
    scenario_links = await scrape_all_links()
    print(f"\n収集完了: {len(scenario_links)} シナリオ\n")
    
    # ステップ2: 各シナリオの詳細を取得
    print("【ステップ2】各シナリオの詳細情報を取得中...\n")
    scenarios = await scrape_details(scenario_links)
    
    print(f"\n\n=============================")
    print(f"取得完了: {len(scenarios)} シナリオ")
    print(f"=============================")
    
    if scenarios:
        save_to_markdown(scenarios, "docs/data/queens-waltz-scenarios.md")
        save_to_json(scenarios, "docs/data/queens-waltz-scenarios.json")
    else:
        print("シナリオが取得できませんでした")


if __name__ == "__main__":
    asyncio.run(main())




