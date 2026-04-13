#!/usr/bin/env bash
# Post-deploy smoke test. Verifies:
#   1. API health endpoint responds
#   2. SPA shell loads
#   3. End-to-end crawl works for a server-rendered site (Cheerio path)
#   4. End-to-end crawl works for an SPA (Playwright path)
#
# Each crawl uses a fresh cookie jar (anonymous session) because anonymous
# sessions are limited to 1 job. Crawls use small bounds (maxDepth=1,
# maxPages=3) so the smoke test completes quickly.
#
# Usage: API_BASE=https://api.example.com SPA_BASE=https://example.com ./scripts/smoke-test.sh

set -euo pipefail

API_BASE="${API_BASE:-https://api.llmtxtgenerator.online}"
SPA_BASE="${SPA_BASE:-https://llmtxtgenerator.online}"

# Sites picked from benchmark data (docs/benchmark_cheerio_vs_playwright.md):
# - configcat.com: small, fast, server-rendered (1170 pages in 55s in benchmark)
# - blut.studio: confirmed SPA in prior testing
CHEERIO_URL="${CHEERIO_URL:-https://configcat.com}"
SPA_URL="${SPA_URL:-https://blut.studio}"

POLL_INTERVAL=5
POLL_MAX=72  # 72 * 5s = 6 minutes max per job

log() { echo "[smoke] $*"; }
fail() { echo "[smoke] FAIL: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Health check
# ---------------------------------------------------------------------------
log "Checking $API_BASE/api/health"
HEALTH=$(curl -fsS --max-time 10 "$API_BASE/api/health") \
  || fail "Health endpoint did not respond with 2xx"
echo "$HEALTH" | grep -q '"status":"ok"' \
  || fail "Health endpoint did not return status=ok: $HEALTH"
log "  ok"

# ---------------------------------------------------------------------------
# 2. SPA shell
# ---------------------------------------------------------------------------
log "Checking $SPA_BASE/"
SPA_HTML=$(curl -fsS --max-time 10 "$SPA_BASE/") \
  || fail "SPA did not respond with 2xx"
echo "$SPA_HTML" | grep -q '<div id="root"' \
  || fail "SPA shell missing #root element"
log "  ok"

# ---------------------------------------------------------------------------
# 3. End-to-end crawl helper
# ---------------------------------------------------------------------------
run_crawl() {
  local url="$1"
  local label="$2"
  local jar
  jar=$(mktemp)

  log "[$label] Submitting crawl: $url"
  local create_resp
  create_resp=$(curl -fsS --max-time 15 \
    -c "$jar" -b "$jar" \
    -X POST "$API_BASE/api/jobs" \
    -H "Content-Type: application/json" \
    -d "{\"url\":\"$url\",\"maxDepth\":1,\"maxPages\":3}") \
    || { rm -f "$jar"; fail "[$label] Failed to create job"; }

  local job_id
  job_id=$(echo "$create_resp" | sed -nE 's/.*"id":"([^"]+)".*/\1/p')
  [ -n "$job_id" ] || { rm -f "$jar"; fail "[$label] No job id in response: $create_resp"; }
  log "[$label] Job id: $job_id"

  local status=""
  local pages=0
  local i
  for i in $(seq 1 $POLL_MAX); do
    sleep $POLL_INTERVAL
    local poll_resp
    poll_resp=$(curl -fsS --max-time 10 -b "$jar" "$API_BASE/api/jobs/$job_id") \
      || { log "[$label] poll $i: request failed, retrying"; continue; }
    status=$(echo "$poll_resp" | sed -nE 's/.*"status":"([^"]+)".*/\1/p')
    pages=$(echo "$poll_resp" | sed -nE 's/.*"pagesFound":([0-9]+).*/\1/p')
    log "[$label] poll $i: status=$status pagesFound=${pages:-0}"
    [ "$status" = "completed" ] && break
    [ "$status" = "failed" ] && { rm -f "$jar"; fail "[$label] Job marked failed"; }
  done

  if [ "$status" != "completed" ]; then
    rm -f "$jar"
    fail "[$label] Job did not complete within $((POLL_MAX * POLL_INTERVAL))s (last status=$status)"
  fi

  log "[$label] Job completed. Fetching content."
  local content
  content=$(curl -fsS --max-time 15 -b "$jar" "$API_BASE/api/jobs/$job_id/content") \
    || { rm -f "$jar"; fail "[$label] Failed to fetch content"; }

  local first_line
  first_line=$(echo "$content" | head -1)
  log "[$label] First line: $first_line"

  echo "$content" | head -1 | grep -q '^# ' \
    || { rm -f "$jar"; fail "[$label] llms.txt missing H1 header"; }

  rm -f "$jar"
  log "[$label] ok"
}

# ---------------------------------------------------------------------------
# 4. Run both crawls
# ---------------------------------------------------------------------------
run_crawl "$CHEERIO_URL" "cheerio"
run_crawl "$SPA_URL" "playwright"

log "All smoke tests passed."
