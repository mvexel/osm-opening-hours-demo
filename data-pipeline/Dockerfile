FROM python:3.11-slim AS generator

WORKDIR /app

# Copy category mapping and generator script
COPY data-pipeline/category_mapping.json ./
COPY data-pipeline/generate_poi_mapping.py ./

# Generate the Lua mapping file
RUN python3 generate_poi_mapping.py

# Main stage
FROM debian:12-slim

# Add backports for newer osm2pgsql
RUN echo 'deb http://deb.debian.org/debian bookworm-backports main' > /etc/apt/sources.list.d/backports.list

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Install osm2pgsql, osmium-tool, and PostgreSQL client
RUN apt-get update && \
    apt-get install -y -t bookworm-backports \
    osm2pgsql \
    osmium-tool && \
    apt-get install -y \
    postgresql-client \
    tzdata \
    file \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy generated Lua mapping from generator stage
COPY --from=generator /app/poi_mapping.lua ./

# Copy scripts and Lua files
COPY data-pipeline/load_osm_data.sh ./
COPY data-pipeline/update_osm_data.sh ./
COPY data-pipeline/pois.lua ./

# Make scripts executable
RUN chmod +x load_osm_data.sh update_osm_data.sh

# Create data and filtered data directories
RUN mkdir -p /app/data /app/data/filtered /mnt/infra-data/openinghoursmap/filtered

# Create non-root user
RUN useradd -m -u 1000 osmuser && chown -R osmuser:osmuser /app
USER osmuser

CMD ["./load_osm_data.sh"]
