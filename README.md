# OSM Opening Hours Explorer

A web application for exploring, visualizing, and editing OpenStreetMap opening hours data. Features an interactive map with POI markers, opening hours display, and an integrated editor.

## Architecture

This application uses a **Dockerized PostGIS backend** instead of the Overpass API for better performance and offline capability:

- **Frontend**: React + TypeScript + Vite
- **Backend API**: Express.js with PostGIS queries
- **Database**: PostgreSQL with PostGIS extension
- **Data Pipeline**: osm2pgsql for importing OSM data

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for frontend development)

### 1. Start the Database and API

```bash
# Build and start services
docker-compose up -d postgres api

# Wait for database to be ready (check with)
docker-compose logs postgres
```

### 2. Import OSM Data

Download a regional extract (recommended for testing):

```bash
# Create data directory
mkdir -p data

# Download Utah extract (~145MB, ~10 min import on a laptop)
curl -L -o data/utah-latest.osm.pbf \
  https://download.geofabrik.de/north-america/us/utah-latest.osm.pbf

# Import data
docker-compose run --rm data-pipeline
```

For other regions, visit [Geofabrik Downloads](https://download.geofabrik.de/).

### 3. Start the Frontend

```bash
npm install
npm run dev
```

Visit `http://localhost:5173` to use the app!

## Development

### Using Makefile Commands

```bash
make up          # Start postgres + api services
make down        # Stop all services
make logs        # View service logs
make db-seed     # Import OSM data
make db-reset    # Reset database (WARNING: deletes all data)
```

### Running Everything Together

```bash
# Start Docker services and frontend in one command
npm run dev:all
```

### Environment Variables

Copy `.env.example` to `.env.local` for local overrides:

```bash
cp .env.example .env.local
```

**Frontend** (`.env.local`):
- `VITE_API_URL` - API endpoint (default: `http://localhost:3001/api`)

**Docker** (`.env`):
- `POSTGRES_DB` - Database name (default: `poi`)
- `POSTGRES_USER` - Database user (default: `postgres`)
- `POSTGRES_PASSWORD` - Database password
- `OSM_DATA_FILE` - Path to OSM file in container (default: `/app/data/utah-latest.osm.pbf`)

## Data Pipeline

### Importing Different Datasets

The data pipeline supports any OSM PBF file. Update the `OSM_DATA_FILE` environment variable:

```bash
# Regional extract
OSM_DATA_FILE=/app/data/utah-latest.osm.pbf docker-compose run --rm data-pipeline

# Different region
OSM_DATA_FILE=/app/data/california-latest.osm.pbf docker-compose run --rm data-pipeline
```

### Pre-filtering Planet Extracts

For the full planet file, use the pre-filter script to reduce size by 90%+:

```bash
# Download planet (requires ~70GB space and hours)
curl -L -o data/planet-latest.osm.pbf \
  https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf

# Pre-filter (requires osmium-tool: brew install osmium-tool)
cd data-pipeline
./prefilter_osm.sh

# Import filtered data
OSM_DATA_FILE=/app/data/planet-pois-filtered.osm.pbf docker-compose run --rm data-pipeline
```

### What Gets Imported

The pipeline extracts POIs with:
- A `name` tag (required)
- At least one of: `amenity`, `shop`, `leisure`, `tourism`, `office`, `craft`

Categories include: restaurants, cafes, shops, banks, pharmacies, entertainment venues, healthcare facilities, and more.

## API Endpoints

The Express API provides two endpoints:

### GET /api/pois

Query POIs within a bounding box.

**Parameters:**
- `bbox` - Bounding box as `west,south,east,north` (required)

**Example:**
```bash
curl "http://localhost:3001/api/pois?bbox=-111.95,40.75,-111.85,40.80"
```

**Response:**
```json
{
  "elements": [
    {
      "type": "node",
      "id": 123456,
      "lat": 40.7608,
      "lon": -111.8910,
      "tags": {
        "name": "Example Restaurant",
        "amenity": "restaurant",
        "opening_hours": "Mo-Su 09:00-22:00"
      }
    }
  ]
}
```

### GET /api/element/:type/:id

Fetch a single OSM element by type and ID.

**Parameters:**
- `type` - Element type: `node`, `way`, or `relation`
- `id` - OSM element ID

**Example:**
```bash
curl "http://localhost:3001/api/element/node/123456"
```

## Project Structure

```
.
├── api/                    # Express API server
│   ├── server.js          # API implementation
│   ├── Dockerfile         # API container
│   └── package.json       # API dependencies
├── data-pipeline/         # OSM data import pipeline
│   ├── pois.lua          # osm2pgsql flex output style
│   ├── run_osm2pgsql.sh  # Import script
│   ├── prefilter_osm.sh  # Pre-filtering script
│   ├── category_mapping.json  # POI categories
│   └── Dockerfile        # Pipeline container
├── src/                   # Frontend React app
│   ├── App.tsx           # Main application
│   ├── components/       # React components
│   └── utils/            # Utility functions
├── data/                  # OSM data files (gitignored)
├── docker-compose.yml     # Docker services configuration
├── Makefile              # Convenience commands
└── .env                  # Environment variables
```

## Troubleshooting

### Database Connection Issues

```bash
# Check if postgres is running
docker-compose ps

# View postgres logs
docker-compose logs postgres

# Restart services
docker-compose restart postgres api
```

### API Not Responding

```bash
# Check API logs
docker-compose logs api

# Restart API
docker-compose restart api
```

### No POIs Showing on Map

1. Verify data was imported: `docker-compose exec postgres psql -U postgres -d poi -c "SELECT COUNT(*) FROM pois;"`
2. Check API is responding: `curl "http://localhost:3001/api/pois?bbox=-111.95,40.75,-111.85,40.80"`
3. Verify frontend is using correct API URL (check browser console)

## Performance

Compared to Overpass API:
- **5-10x faster** queries (local database vs remote API)
- **No rate limiting** (your own database)
- **Offline capable** (works without internet)
- **Consistent performance** (no server load issues)

## Docker Images

Docker images are automatically built and published to GitHub Container Registry (GHCR) on every push to the main branch.

### Available Images

- `ghcr.io/mvexel/osm-opening-hours-api:latest` - Express API server
- `ghcr.io/mvexel/osm-opening-hours-frontend:latest` - React frontend (nginx)
- `ghcr.io/mvexel/osm-opening-hours-pipeline:latest` - Data import pipeline

### Image Tags

- `latest` - Latest build from the main branch
- `sha-<commit>` - Specific commit SHA
- `v*` - Version tags (if using semantic versioning)

### Dependencies

The frontend depends on `@osm-is-it-open/hours`, which is not yet published to npm. The GitHub Actions workflow automatically fetches this dependency from the [osm-is-it-open repository](https://github.com/mvexel/osm-is-it-open) during the Docker build.

For local development, ensure the `osm-is-it-open` repository is cloned as a sibling directory:

```bash
# Directory structure
dev/
├── osm-opening-hours-app/  # This repo
└── osm-is-it-open/         # Dependency repo
```

### Building Locally

```bash
# Build API
docker build -t osm-opening-hours-api -f api/Dockerfile ./api

# Build frontend (requires osm-is-it-open as sibling directory)
docker build -t osm-opening-hours-frontend -f Dockerfile.frontend .

# Build data pipeline
docker build -t osm-opening-hours-pipeline -f data-pipeline/Dockerfile .
```

### Production Deployment

For production deployment using GHCR images, see the [infra deployment documentation](https://github.com/mvexel/infra/tree/main/openinghoursmap).

## License

See LICENSE file for details.
