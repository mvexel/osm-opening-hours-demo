#!/bin/bash

# OSM Data Update Script
# Applies OSM replication updates using osm2pgsql-replication

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration from environment variables
DATABASE_NAME=${DATABASE_NAME:-poi}
DATABASE_HOST=${DATABASE_HOST:-postgres}
DATABASE_PORT=${DATABASE_PORT:-5432}
DATABASE_USER=${DATABASE_USER:-postgres}
DATABASE_PASSWORD=${DATABASE_PASSWORD:-postgres}
MAX_DIFF_SIZE=${MAX_DIFF_SIZE:-500}  # MB

LOG_FILE=${LOG_FILE:-""}

# Logging function
log() {
    local message="$1"
    echo -e "$message"
    if [ -n "$LOG_FILE" ]; then
        echo -e "$message" | sed 's/\x1b\[[0-9;]*m//g' >> "$LOG_FILE"
    fi
}

log "${BLUE}🔄 OSM Data Update Pipeline${NC}"
log "================================================"
log "$(date): Starting update"
log ""

# Check if osm2pgsql-replication is available
if ! command -v osm2pgsql-replication &> /dev/null; then
    log "${RED}❌ Error: osm2pgsql-replication is not installed${NC}"
    exit 1
fi

log "${GREEN}✅ osm2pgsql-replication found${NC}"
log ""

# Set PGPASSWORD for authentication
export PGPASSWORD="$DATABASE_PASSWORD"

# Check if replication is initialized
log "${BLUE}🔍 Checking replication status...${NC}"

STATUS_OUTPUT=$(osm2pgsql-replication status \
    --database "$DATABASE_NAME" \
    --host "$DATABASE_HOST" \
    --port "$DATABASE_PORT" \
    --user "$DATABASE_USER" 2>&1) || {
    log ""
    log "${RED}❌ Error: Replication not initialized${NC}"
    log ""
    log "Please run the initial data import first:"
    log "  docker compose run --rm data-pipeline"
    log ""
    log "Or run: make db-seed"
    log ""
    exit 1
}

log "$STATUS_OUTPUT"
log ""

# Run update
log "${BLUE}📥 Applying replication updates...${NC}"
log "   Database: $DATABASE_NAME on $DATABASE_HOST:$DATABASE_PORT"
log "   Max diff size: ${MAX_DIFF_SIZE}MB"
log ""

UPDATE_START=$(date +%s)

# Capture both stdout and stderr
UPDATE_OUTPUT=$(osm2pgsql-replication update \
    --max-diff-size "$MAX_DIFF_SIZE" \
    --database "$DATABASE_NAME" \
    --host "$DATABASE_HOST" \
    --port "$DATABASE_PORT" \
    --user "$DATABASE_USER" 2>&1)

UPDATE_EXIT=$?

UPDATE_END=$(date +%s)
UPDATE_DURATION=$((UPDATE_END - UPDATE_START))
UPDATE_MINUTES=$((UPDATE_DURATION / 60))
UPDATE_SECONDS=$((UPDATE_DURATION % 60))

log "$UPDATE_OUTPUT"
log ""

if [ $UPDATE_EXIT -eq 0 ]; then
    log "${GREEN}✅ Update completed successfully${NC}"
    log "   Duration: ${UPDATE_MINUTES}m ${UPDATE_SECONDS}s"
    log "   Timestamp: $(date)"
    log ""
    
    # Extract statistics from output if available
    if echo "$UPDATE_OUTPUT" | grep -q "nodes.*ways.*relations"; then
        STATS=$(echo "$UPDATE_OUTPUT" | grep "nodes.*ways.*relations" | head -n1)
        log "${BLUE}📊 Update statistics:${NC}"
        log "   $STATS"
        log ""
    fi
    
    exit 0
elif [ $UPDATE_EXIT -eq 1 ]; then
    # Exit code 1 typically means "already up to date"
    if echo "$UPDATE_OUTPUT" | grep -qi "up to date\|no new data"; then
        log "${GREEN}✅ Database is already up to date${NC}"
        log "   Duration: ${UPDATE_MINUTES}m ${UPDATE_SECONDS}s"
        log ""
        exit 0
    else
        log "${RED}❌ Update failed with exit code $UPDATE_EXIT${NC}"
        log "   Duration: ${UPDATE_MINUTES}m ${UPDATE_SECONDS}s"
        log ""
        exit $UPDATE_EXIT
    fi
else
    log "${RED}❌ Update failed with exit code $UPDATE_EXIT${NC}"
    log "   Duration: ${UPDATE_MINUTES}m ${UPDATE_SECONDS}s"
    log ""
    
    # Provide helpful error messages
    if echo "$UPDATE_OUTPUT" | grep -qi "connection.*refused\|could not connect"; then
        log "${YELLOW}💡 Hint: Database connection failed. Is PostgreSQL running?${NC}"
        log ""
    elif echo "$UPDATE_OUTPUT" | grep -qi "404\|not found"; then
        log "${YELLOW}💡 Hint: Replication files not found. Check REPLICATION_URL configuration.${NC}"
        log ""
    fi
    
    exit $UPDATE_EXIT
fi
