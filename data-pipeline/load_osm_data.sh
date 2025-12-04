#!/bin/bash

# OSM Data Loading Pipeline
# Filters OSM data for POIs, imports into PostgreSQL, and initializes replication

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration from environment variables
OSM_INPUT_FILE=${OSM_INPUT_FILE:-"/app/data/utah-latest.osm.pbf"}
FILTERED_DATA_DIR=${FILTERED_DATA_DIR:-"/app/data/filtered"}
REPLICATION_URL=${REPLICATION_URL:-""}  # Auto-detect if empty

DATABASE_NAME=${DATABASE_NAME:-poi}
DATABASE_HOST=${DATABASE_HOST:-postgres}
DATABASE_PORT=${DATABASE_PORT:-5432}
DATABASE_USER=${DATABASE_USER:-postgres}
DATABASE_PASSWORD=${DATABASE_PASSWORD:-postgres}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LUA_SCRIPT=${LUA_SCRIPT:-"$SCRIPT_DIR/pois.lua"}

echo -e "${BLUE}🔧 OSM Data Loading Pipeline${NC}"
echo "================================================"

# Check if osmium is installed
if ! command -v osmium &> /dev/null; then
    echo -e "${RED}❌ Error: osmium-tool is not installed${NC}"
    exit 1
fi

# Check if osm2pgsql is installed
if ! command -v osm2pgsql &> /dev/null; then
    echo -e "${RED}❌ Error: osm2pgsql is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ osmium-tool found: $(osmium --version | head -n1)${NC}"
echo -e "${GREEN}✅ osm2pgsql found: $(osm2pgsql --version | head -n1)${NC}"
echo ""

# Check if input file exists
if [ ! -f "$OSM_INPUT_FILE" ]; then
    echo -e "${RED}❌ Error: Input file not found: $OSM_INPUT_FILE${NC}"
    echo "Please download an OSM extract first."
    exit 1
fi

# Create filtered data directory
mkdir -p "$FILTERED_DATA_DIR"

# Generate filtered file path
INPUT_BASENAME=$(basename "$OSM_INPUT_FILE" .osm.pbf)
FILTERED_FILE="$FILTERED_DATA_DIR/${INPUT_BASENAME}-pois-filtered.osm.pbf"

# Display input file info
INPUT_SIZE=$(du -h "$OSM_INPUT_FILE" | cut -f1)
echo -e "${BLUE}📊 Input file info:${NC}"
echo "   Path: $OSM_INPUT_FILE"
echo "   Size: $INPUT_SIZE"
echo ""

# Check if we need to filter
NEED_FILTERING=true
if [ -f "$FILTERED_FILE" ]; then
    if [ "$FILTERED_FILE" -nt "$OSM_INPUT_FILE" ]; then
        echo -e "${YELLOW}ℹ️  Filtered file exists and is newer than input${NC}"
        echo "   Using existing: $FILTERED_FILE"
        NEED_FILTERING=false
    else
        echo -e "${YELLOW}ℹ️  Filtered file exists but is older than input${NC}"
        echo "   Re-filtering required"
    fi
fi
echo ""

# Filter if needed
if [ "$NEED_FILTERING" = true ]; then
    echo -e "${BLUE}🔍 Running osmium tags-filter...${NC}"
    echo "   Filtering for POIs with name tags"
    echo "   Output: $FILTERED_FILE"
    echo ""

    FILTER_START=$(date +%s)

    # The filter expression:
    # - nw = nodes and ways only (no relations)
    # - name= means "must have a name tag"
    # - amenity,shop,leisure,tourism,office,craft = must have at least one POI tag
    osmium tags-filter \
        "$OSM_INPUT_FILE" \
        --overwrite \
        --progress \
        -o "$FILTERED_FILE" \
        nw/name= \
        nw/amenity \
        nw/shop \
        nw/leisure \
        nw/tourism \
        nw/office \
        nw/craft

    FILTER_END=$(date +%s)
    FILTER_DURATION=$((FILTER_END - FILTER_START))
    FILTER_MINUTES=$((FILTER_DURATION / 60))
    FILTER_SECONDS=$((FILTER_DURATION % 60))

    echo ""
    echo -e "${GREEN}✅ Filtering complete!${NC}"
    echo ""

    # Display filtering results
    if [ -f "$FILTERED_FILE" ]; then
        FILTERED_SIZE=$(du -h "$FILTERED_FILE" | cut -f1)
        
        echo -e "${BLUE}📊 Filtering results:${NC}"
        echo "   Input size:  $INPUT_SIZE"
        echo "   Output size: $FILTERED_SIZE"
        echo "   Duration:    ${FILTER_MINUTES}m ${FILTER_SECONDS}s"
        echo ""
    else
        echo -e "${RED}❌ Error: Filtered file was not created${NC}"
        exit 1
    fi

    # Clean up old filtered files (keep 3 most recent)
    echo -e "${BLUE}🧹 Cleaning up old filtered files...${NC}"
    cd "$FILTERED_DATA_DIR"
    ls -t *-pois-filtered.osm.pbf 2>/dev/null | tail -n +4 | xargs -r rm -v
    cd - > /dev/null
    echo ""
fi

# Check if Lua script exists
if [ ! -f "$LUA_SCRIPT" ]; then
    echo -e "${RED}❌ Error: Lua script not found at $LUA_SCRIPT${NC}"
    exit 1
fi

# Auto-detect replication URL if not set
if [ -z "$REPLICATION_URL" ]; then
    echo -e "${BLUE}🔍 Auto-detecting replication URL...${NC}"
    
    if [[ "$OSM_INPUT_FILE" =~ geofabrik ]]; then
        # Extract region from Geofabrik filename
        # Example: north-america/us/utah-latest.osm.pbf
        if [[ "$OSM_INPUT_FILE" =~ ([a-z-]+)-latest\.osm\.pbf ]]; then
            REGION="${BASH_REMATCH[1]}"
            REPLICATION_URL="https://download.geofabrik.de/${REGION}-updates"
            echo -e "${YELLOW}   Detected Geofabrik extract: $REGION${NC}"
        else
            REPLICATION_URL="https://planet.openstreetmap.org/replication/minute/"
            echo -e "${YELLOW}   Using planet replication (Geofabrik region detection failed)${NC}"
        fi
    else
        REPLICATION_URL="https://planet.openstreetmap.org/replication/minute/"
        echo -e "${YELLOW}   Using planet minutely replication${NC}"
    fi
    
    echo "   Replication URL: $REPLICATION_URL"
    echo ""
fi

# Import with osm2pgsql
echo -e "${BLUE}📥 Importing data with osm2pgsql...${NC}"
echo "   Database: $DATABASE_NAME on $DATABASE_HOST:$DATABASE_PORT"
echo "   Lua script: $LUA_SCRIPT"
echo "   Filtered data: $FILTERED_FILE"
echo ""

IMPORT_START=$(date +%s)

# Set PGPASSWORD for authentication
export PGPASSWORD="$DATABASE_PASSWORD"

osm2pgsql \
    --slim \
    --database "$DATABASE_NAME" \
    --host "$DATABASE_HOST" \
    --port "$DATABASE_PORT" \
    --user "$DATABASE_USER" \
    --create \
    --output flex \
    --style "$LUA_SCRIPT" \
    "$FILTERED_FILE"

IMPORT_EXIT=$?

IMPORT_END=$(date +%s)
IMPORT_DURATION=$((IMPORT_END - IMPORT_START))
IMPORT_MINUTES=$((IMPORT_DURATION / 60))
IMPORT_SECONDS=$((IMPORT_DURATION % 60))

echo ""

if [ $IMPORT_EXIT -eq 0 ]; then
    echo -e "${GREEN}✅ Import completed successfully${NC}"
    echo "   Duration: ${IMPORT_MINUTES}m ${IMPORT_SECONDS}s"
    echo ""
else
    echo -e "${RED}❌ Import failed with exit code $IMPORT_EXIT${NC}"
    exit $IMPORT_EXIT
fi

# Initialize replication
echo -e "${BLUE}🔄 Initializing osm2pgsql-replication...${NC}"
echo "   Replication URL: $REPLICATION_URL"
echo ""

osm2pgsql-replication init \
    --osm-file "$FILTERED_FILE" \
    --server "$REPLICATION_URL" \
    --database "$DATABASE_NAME" \
    --host "$DATABASE_HOST" \
    --port "$DATABASE_PORT" \
    --user "$DATABASE_USER"

REPL_EXIT=$?

if [ $REPL_EXIT -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Replication initialized successfully${NC}"
    echo ""
    echo -e "${GREEN}🎉 Pipeline complete!${NC}"
    echo ""
    echo -e "${BLUE}📊 Summary:${NC}"
    echo "   Filtered file: $FILTERED_FILE ($(du -h "$FILTERED_FILE" | cut -f1))"
    echo "   Database: $DATABASE_NAME"
    echo "   Replication: Configured (run update_osm_data.sh to apply updates)"
    echo ""
else
    echo ""
    echo -e "${YELLOW}⚠️  Replication initialization failed (exit code $REPL_EXIT)${NC}"
    echo "   This is expected if using a regional extract without matching replication."
    echo "   The database is ready to use, but automatic updates won't be available."
    echo ""
fi

exit 0
