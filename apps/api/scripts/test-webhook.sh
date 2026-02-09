#!/bin/bash
# Usage: ./scripts/test-webhook.sh <webhook-secret> <github-repo-id>
#
# Tests all 3 webhook acceptance criteria:
# 1. Valid signature + push event → 200
# 2. Invalid signature → 401
# 3. Unknown repo ID → 401 (no matching project)

API_URL="${API_URL:-http://localhost:4000}"
SECRET="$1"
REPO_ID="${2:-99999999}"

if [ -z "$SECRET" ]; then
  echo "Usage: ./scripts/test-webhook.sh <webhook-secret> <github-repo-id>"
  echo ""
  echo "Get your webhook secret by running:"
  echo "  node -e \"require('dotenv/config'); const c=require('crypto'); const key=Buffer.from(process.env.ENCRYPTION_KEY,'hex'); const row={e:'ENCRYPTED',iv:'IV',tag:'TAG'}; const d=c.createDecipheriv('aes-256-gcm',key,Buffer.from(row.iv,'hex')); d.setAuthTag(Buffer.from(row.tag,'hex')); console.log(d.update(row.e,'hex','utf8')+d.final('utf8'))\""
  echo ""
  echo "Or check Drizzle Studio for the project's webhook_secret, webhook_secret_iv, webhook_secret_tag"
  exit 1
fi

# --- Test 1: Valid push event ---
echo "=== Test 1: Valid signature + push event ==="
PAYLOAD="{\"ref\":\"refs/heads/main\",\"repository\":{\"id\":${REPO_ID},\"full_name\":\"test/repo\"}}"
SIGNATURE="sha256=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"

HTTP_CODE=$(curl -s -o /tmp/webhook-test-1.json -w "%{http_code}" \
  -X POST "$API_URL/webhooks/github" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIGNATURE" \
  -H "X-GitHub-Event: push" \
  -d "$PAYLOAD")

echo "Status: $HTTP_CODE (expected: 200)"
cat /tmp/webhook-test-1.json
echo ""
echo ""

# --- Test 2: Invalid signature ---
echo "=== Test 2: Invalid signature ==="
BAD_SIGNATURE="sha256=0000000000000000000000000000000000000000000000000000000000000000"

HTTP_CODE=$(curl -s -o /tmp/webhook-test-2.json -w "%{http_code}" \
  -X POST "$API_URL/webhooks/github" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $BAD_SIGNATURE" \
  -H "X-GitHub-Event: push" \
  -d "$PAYLOAD")

echo "Status: $HTTP_CODE (expected: 401)"
cat /tmp/webhook-test-2.json
echo ""
echo ""

# --- Test 3: Unknown repo ID ---
echo "=== Test 3: Unknown repo ID ==="
UNKNOWN_PAYLOAD="{\"ref\":\"refs/heads/main\",\"repository\":{\"id\":0,\"full_name\":\"unknown/repo\"}}"
UNKNOWN_SIG="sha256=$(echo -n "$UNKNOWN_PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"

HTTP_CODE=$(curl -s -o /tmp/webhook-test-3.json -w "%{http_code}" \
  -X POST "$API_URL/webhooks/github" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $UNKNOWN_SIG" \
  -H "X-GitHub-Event: push" \
  -d "$UNKNOWN_PAYLOAD")

echo "Status: $HTTP_CODE (expected: 401)"
cat /tmp/webhook-test-3.json
echo ""
echo ""

# --- Test 4: Valid ping event ---
echo "=== Test 4: Valid signature + ping event ==="
PING_PAYLOAD="{\"zen\":\"Keep it logically awesome.\",\"hook_id\":12345,\"repository\":{\"id\":${REPO_ID},\"full_name\":\"test/repo\"}}"
PING_SIG="sha256=$(echo -n "$PING_PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"

HTTP_CODE=$(curl -s -o /tmp/webhook-test-4.json -w "%{http_code}" \
  -X POST "$API_URL/webhooks/github" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $PING_SIG" \
  -H "X-GitHub-Event: ping" \
  -d "$PING_PAYLOAD")

echo "Status: $HTTP_CODE (expected: 200)"
cat /tmp/webhook-test-4.json
echo ""
