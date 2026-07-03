#!/usr/bin/env node
// scripts/db-status.mjs
// マイグレーション適用状況チェック（BUG-8 修正版）
//
// 旧 `db:status` は awk がパイプ区切りテーブルを前提にしていたが、CLI 実出力と
// 噛み合わず常に空振り → 「✅ 全マイグレーション適用済み」に落ちて未適用を握り潰していた。
// 本スクリプトは `supabase migration list --db-url <url> --output-format json` の
// 実 JSON をパースし、remote に反映されていない local migration を確実に検出する。
//
// 読み取り専用。db push 系のコマンドは一切呼ばない。
// db-url は package.json の db:push と同じ Keychain 参照を child_process で組み立てる。
// パスワードはログ・エラー出力に絶対に出さない。

import { execFileSync } from 'node:child_process';

// staging = lavutzztfqbdndjiwluc / prod = cznpcewciwywcqcxktba
// （db:push の既存文字列と一致。絶対に書き換えない）
const ENVIRONMENTS = {
  staging: {
    label: 'staging',
    keychainService: 'supabase-db-staging',
    host: 'db.lavutzztfqbdndjiwluc.supabase.co',
  },
  prod: {
    label: 'prod',
    keychainService: 'supabase-db-prod',
    host: 'db.cznpcewciwywcqcxktba.supabase.co',
  },
};

/**
 * Keychain からパスワードを取得。取得できなければ null。
 * パスワード自体はここでだけ扱い、呼び出し元へ返して即座に URL に埋め込む。
 */
function getKeychainPassword(service) {
  try {
    const pw = execFileSync(
      'security',
      ['find-generic-password', '-s', service, '-a', 'postgres', '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    return pw.length > 0 ? pw : null;
  } catch {
    return null;
  }
}

/**
 * supabase migration list を JSON で実行し、パース結果を返す。
 * 成功時: { migrations: [{ local, remote, time }, ...] }
 * 接続失敗時: CLI が exit 1 かつ { _tag: 'Error', ... } を返す → ここでは throw する。
 */
function fetchMigrationList(dbUrl) {
  let stdout;
  try {
    stdout = execFileSync(
      'npx',
      ['supabase', 'migration', 'list', '--db-url', dbUrl, '--output-format', 'json'],
      // stderr は "Connecting..." / "Skipping..." の告知のみ（パスワードは含まれない）。
      // 破棄して stdout の JSON だけを取る。
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
  } catch (err) {
    // CLI が非ゼロ終了した場合でも stdout に Error JSON が載ることがある。
    stdout = err.stdout ? err.stdout.toString() : '';
    const parsed = safeParse(stdout);
    throw new Error(cliErrorMessage(parsed));
  }

  const parsed = safeParse(stdout);
  if (!parsed || !Array.isArray(parsed.migrations)) {
    // 期待した { migrations: [...] } でない = 接続失敗や想定外出力。
    throw new Error(cliErrorMessage(parsed));
  }
  return parsed.migrations;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function cliErrorMessage(parsed) {
  if (parsed && parsed._tag === 'Error' && parsed.error && parsed.error.message) {
    // CLI のエラーメッセージには接続文字列は含まれない（"failed to connect" 等）。
    return `migration list に失敗しました: ${parsed.error.message}`;
  }
  return 'migration list の出力を解釈できませんでした（接続失敗の可能性）';
}

/**
 * 1 環境をチェック。戻り値 { ok, appliedCount, pending: string[] }。
 * 接続や Keychain の失敗は例外として上位へ投げる（✅ と偽らない）。
 */
function checkEnvironment(envKey) {
  const env = ENVIRONMENTS[envKey];
  const password = getKeychainPassword(env.keychainService);
  if (password === null) {
    throw new Error(
      `Keychain (${env.keychainService}) が見つからないためスキップ（CI 等では想定内・サイレント成功にはしない）`
    );
  }

  // URL はこの関数内でのみ組み立て、ログには絶対に出さない。
  const dbUrl = `postgresql://postgres:${password}@${env.host}:5432/postgres`;
  const migrations = fetchMigrationList(dbUrl);

  // 未適用 = local に存在するが remote に反映されていない migration。
  // ヘッダ行や罫線は JSON には存在しないため誤検知しない。
  const pending = migrations
    .filter((m) => m && m.local && !m.remote)
    .map((m) => m.local);
  const appliedCount = migrations.filter((m) => m && m.local && m.remote).length;

  return { ok: pending.length === 0, appliedCount, pending };
}

function main() {
  const arg = process.argv[2];
  let targets;
  if (arg === undefined) {
    targets = ['staging', 'prod'];
  } else if (arg === 'staging' || arg === 'prod') {
    targets = [arg];
  } else {
    console.error(`不明な引数: ${arg}（staging / prod のいずれか、または引数なしで両方）`);
    process.exit(2);
    return;
  }

  let hadError = false;
  let hadPending = false;

  for (const envKey of targets) {
    const env = ENVIRONMENTS[envKey];
    try {
      const { appliedCount, pending } = checkEnvironment(envKey);
      if (pending.length === 0) {
        console.log(`[${env.label}] 適用済み ${appliedCount} 件・未適用なし`);
      } else {
        hadPending = true;
        console.log(`[${env.label}] 適用済み ${appliedCount} 件・未適用 ${pending.length} 件:`);
        for (const name of pending) {
          console.log(`  未適用: ${name}`);
        }
      }
    } catch (err) {
      hadError = true;
      console.error(`[${env.label}] エラー: ${err.message}`);
    }
  }

  if (hadError) {
    // 接続失敗・Keychain 欠如は ✅ と偽らず失敗扱い（誤報告バグ再発防止の本丸）。
    console.error('接続または取得に失敗した環境があります。適用状況は確認できていません。');
    process.exit(1);
  }
  if (hadPending) {
    console.log('未適用マイグレーションがあります。');
    process.exit(1);
  }

  const label = targets.length === 2 ? 'staging/prod とも' : `${ENVIRONMENTS[targets[0]].label} は`;
  console.log(`✅ ${label}全マイグレーション適用済み`);
  process.exit(0);
}

main();
