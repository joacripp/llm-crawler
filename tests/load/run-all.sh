#!/usr/bin/env bash
# Run all load/stress test scenarios and collect CloudWatch metrics.
#
# Usage:
#   ./tests/load/run-all.sh              # run all 6 scenarios
#   ./tests/load/run-all.sh 01 03 05     # run specific scenarios
#   SKIP_REPORT=1 ./tests/load/run-all.sh 01  # skip CloudWatch report

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPORT_DIR="${SCRIPT_DIR}/reports/$(date +%Y%m%d-%H%M%S)"
AWS_REGION="${AWS_REGION:-us-east-1}"

mkdir -p "$REPORT_DIR"

log() { echo "[load-test] $(date +%H:%M:%S) $*"; }

# -----------------------------------------------------------------------
# Determine which scenarios to run
# -----------------------------------------------------------------------
ALL_SCENARIOS=(01 02 03 04 05 06 07)
SCENARIOS=("${@:-${ALL_SCENARIOS[@]}}")

SCENARIO_NAMES=(
  [01]="API Throughput"
  [02]="Pipeline Saturation"
  [03]="SSE Connections"
  [04]="Large Crawl"
  [05]="Burst (50 jobs)"
  [06]="Connection Exhaustion"
  [07]="High-Fanout Pages"
)

# -----------------------------------------------------------------------
# Print dashboard links
# -----------------------------------------------------------------------
log "=============================================="
log "  Load & Stress Test Suite"
log "=============================================="
log ""
log "CloudWatch dashboards (watch live):"
log "  Operations: https://console.aws.amazon.com/cloudwatch/home?region=${AWS_REGION}#dashboards/dashboard/llm-crawler-dev-operations"
log "  Pipeline:   https://console.aws.amazon.com/cloudwatch/home?region=${AWS_REGION}#dashboards/dashboard/llm-crawler-dev-pipeline"
log "  Database:   https://console.aws.amazon.com/cloudwatch/home?region=${AWS_REGION}#dashboards/dashboard/llm-crawler-dev-database"
log ""
log "Reports will be saved to: $REPORT_DIR"
log ""

START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# -----------------------------------------------------------------------
# Run each scenario
# -----------------------------------------------------------------------
for num in "${SCENARIOS[@]}"; do
  SCRIPT="${SCRIPT_DIR}/${num}-*.js"
  # shellcheck disable=SC2086
  SCRIPT=$(ls $SCRIPT 2>/dev/null | head -1)
  if [ -z "$SCRIPT" ]; then
    log "SKIP: no script matching ${num}-*.js"
    continue
  fi

  NAME="${SCENARIO_NAMES[$num]:-Scenario $num}"
  log "----------------------------------------------"
  log "Running: $NAME ($SCRIPT)"
  log "----------------------------------------------"

  k6 run "$SCRIPT" \
    --summary-export="${REPORT_DIR}/${num}-summary.json" \
    2>&1 | tee "${REPORT_DIR}/${num}-output.txt"

  log "$NAME completed."
  log ""
done

END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# -----------------------------------------------------------------------
# CloudWatch metrics report
# -----------------------------------------------------------------------
if [ "${SKIP_REPORT:-}" = "1" ]; then
  log "Skipping CloudWatch report (SKIP_REPORT=1)"
  exit 0
fi

log "=============================================="
log "  CloudWatch Metrics Report"
log "  Period: $START_TIME → $END_TIME"
log "=============================================="

get_metric() {
  local namespace=$1 metric=$2 dim_name=$3 dim_value=$4 stat=$5
  aws cloudwatch get-metric-statistics \
    --region "$AWS_REGION" \
    --namespace "$namespace" \
    --metric-name "$metric" \
    --dimensions "Name=${dim_name},Value=${dim_value}" \
    --start-time "$START_TIME" \
    --end-time "$END_TIME" \
    --period 300 \
    --statistics "$stat" \
    --query "Datapoints | sort_by(@, &Timestamp) | [-1].${stat}" \
    --output text 2>/dev/null || echo "N/A"
}

log ""
log "--- Lambda ---"
for fn in crawler consumer generator monitor; do
  invocations=$(get_metric AWS/Lambda Invocations FunctionName "llm-crawler-dev-${fn}" Sum)
  errors=$(get_metric AWS/Lambda Errors FunctionName "llm-crawler-dev-${fn}" Sum)
  duration_p90=$(get_metric AWS/Lambda Duration FunctionName "llm-crawler-dev-${fn}" Average)
  throttles=$(get_metric AWS/Lambda Throttles FunctionName "llm-crawler-dev-${fn}" Sum)
  log "  ${fn}: invocations=${invocations} errors=${errors} duration_avg=${duration_p90}ms throttles=${throttles}"
done

log ""
log "--- SQS Queues ---"
for q in crawl-jobs crawl-pages crawl-completed; do
  depth=$(aws sqs get-queue-attributes \
    --region "$AWS_REGION" \
    --queue-url "https://sqs.${AWS_REGION}.amazonaws.com/629798234973/llm-crawler-dev-${q}" \
    --attribute-names ApproximateNumberOfMessages \
    --query 'Attributes.ApproximateNumberOfMessages' \
    --output text 2>/dev/null || echo "N/A")
  log "  ${q}: remaining_messages=${depth}"
done

log ""
log "--- DLQs ---"
for q in crawl-jobs-dlq crawl-pages-dlq crawl-completed-dlq; do
  depth=$(aws sqs get-queue-attributes \
    --region "$AWS_REGION" \
    --queue-url "https://sqs.${AWS_REGION}.amazonaws.com/629798234973/llm-crawler-dev-${q}" \
    --attribute-names ApproximateNumberOfMessages \
    --query 'Attributes.ApproximateNumberOfMessages' \
    --output text 2>/dev/null || echo "N/A")
  log "  ${q}: messages=${depth}"
done

log ""
log "--- RDS ---"
connections=$(get_metric AWS/RDS DatabaseConnections DBInstanceIdentifier llm-crawler-dev Maximum)
cpu=$(get_metric AWS/RDS CPUUtilization DBInstanceIdentifier llm-crawler-dev Maximum)
log "  max_connections=${connections} max_cpu=${cpu}%"

log ""
log "--- Redis ---"
redis_conn=$(get_metric AWS/ElastiCache CurrConnections CacheClusterId llm-crawler-dev-001 Maximum)
redis_cpu=$(get_metric AWS/ElastiCache EngineCPUUtilization CacheClusterId llm-crawler-dev-001 Maximum)
log "  max_connections=${redis_conn} max_cpu=${redis_cpu}%"

log ""
log "--- ECS ---"
ecs_cpu=$(get_metric ECS/ContainerInsights CpuUtilized ServiceName llm-crawler-dev-api Maximum)
ecs_mem=$(get_metric ECS/ContainerInsights MemoryUtilized ServiceName llm-crawler-dev-api Maximum)
log "  max_cpu=${ecs_cpu} max_memory=${ecs_mem}"

log ""
log "Full reports saved to: $REPORT_DIR"
log "Done."
