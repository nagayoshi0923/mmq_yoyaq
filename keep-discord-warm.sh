#!/bin/bash

# Discord Interactions Functionを定期的にウォームアップ
# crontabで5分ごとに実行することで、コールドスタートを防ぐ

FUNCTION_URL="https://cznpcewciwywcqcxktba.supabase.co/functions/v1/discord-interactions"

# PING リクエストを送信
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "X-Signature-Ed25519: dummy" \
  -H "X-Signature-Timestamp: $(date +%s)" \
  -d '{"type":1}' \
  --max-time 5 \
  --silent \
  --show-error

echo "Discord function warmed up at $(date)"

