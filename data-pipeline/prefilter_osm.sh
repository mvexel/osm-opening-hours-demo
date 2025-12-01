#!/bin/bash

# OSM Pre-filtering Script
# Uses osmium-tool to pre-filter planet OSM data for faster osm2pgsql processing
# Only extracts nodes/ways with name tags and POI-related tags

set -e

# Configuration from environment variables
DATA_DIR=${DATA_DIR:-"./data"}
INPUT_FILE=${INPUT_FILE:-"$DATA_DIR/planet-latest.osm.pbf"}
OUTPUT_FILE=${OUTPUT_FILE:-"$DATA_DIR/planet-pois-filtered.osm.pbf"}

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 OSM Pre-filtering Pipeline${NC}"
echo "================================================"

# Check if osmium is installed
if ! command -v osmium &> /dev/null; then
    echo -e "${RED}❌ Error: osmium-tool is not installed${NC}"
    echo ""
    echo "Install it with:"
    echo "  macOS:   brew install osmium-tool"
    echo "  Ubuntu:  sudo apt-get install osmium-tool"
    echo "  Other:   See https://osmcode.org/osmium-tool/"
    exit 1
fi

echo -e "${GREEN}✅ osmium-tool found: $(osmium --version | head -n1)${NC}"
echo ""

# Create data directory if needed
mkdir -p "$DATA_DIR"

# Check if input file exists
if [ ! -f "$INPUT_FILE" ]; then
    echo -e "${RED}❌ Error: Input file not found: $INPUT_FILE${NC}"
    echo "Please download an OSM extract first."
    exit 1
fi

# Display input file info
INPUT_SIZE=$(du -h "$INPUT_FILE" | cut -f1)
echo -e "${BLUE}📊 Input file info:${NC}"
echo "   Path: $INPUT_FILE"
echo "   Size: $INPUT_SIZE"
echo ""

# Run osmium tags-filter
echo -e "${BLUE}🔍 Running osmium tags-filter...${NC}"
echo "   Filtering for POIs with name tags"
echo "   Output: $OUTPUT_FILE"
echo ""

START_TIME=$(date +%s)

# The filter expression:
# - nw = nodes and ways only (no relations)
# - name= means "must have a name tag"
# - amenity,shop,leisure,tourism,office,craft = must have at least one POI tag
osmium tags-filter \
    "$INPUT_FILE" \
    --overwrite \
    --progress \
    -o "$OUTPUT_FILE" \
    nw/name= \
    nw/amenity \
    nw/shop \
    nw/leisure \
    nw/tourism \
    nw/office \
    nw/craft

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

echo ""
echo -e "${GREEN}✅ Filtering complete!${NC}"
echo ""

# Display output file info
if [ -f "$OUTPUT_FILE" ]; then
    OUTPUT_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
    
    echo -e "${BLUE}📊 Results:${NC}"
    echo "   Input size:  $INPUT_SIZE"
    echo "   Output size: $OUTPUT_SIZE"
    echo "   Duration:    ${MINUTES}m ${SECONDS}s"
    echo ""
    
    echo -e "${GREEN}🎉 Ready for osm2pgsql import!${NC}"
    echo ""
else
    echo -e "${RED}❌ Error: Output file was not created${NC}"
    exit 1
fi
