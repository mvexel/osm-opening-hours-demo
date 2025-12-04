This is a playground of sorts to work up to something you could call quality lenses.

Right now it's a one-trick pony: a Lua script defines transformation of the raw OSM data to a POI database, a simple front end displays this as open / not open / unknown, and showcases some react components I built to help with visualizing and editing OSM opening hours in a human friendly way.

To run:
```
docker-compose up -d postgres api
```
wait for PG to come to life

Download a regional extract (or the planet if you have unlimited time or money or both)

```bash
mkdir -p data
curl -L -o data/utah-latest.osm.pbf https://download.geofabrik.de/north-america/us/utah-latest.osm.pbf
```

then run the ETL script - this is currently hardcoded for the POI case

```
docker-compose run --rm data-pipeline
```

Then, start the web app

```bash
npm install
npm run dev
```

The data pipeline automatically filters OSM data for POIs with `name` tags using osmium-tool, imports filtered data into PostgreSQL using osm2pgsql and initializes the replication state for incremental updates

You will still need to kick off replication (cron / systemd).

```bash
make db-update
```
or
```
docker-compose run --rm --entrypoint ./update_osm_data.sh data-pipeline
```
 to run a manual replication.

## Docker Images

Docker images are automatically built and published to GitHub Container Registry (GHCR) on every push to the main branch. I need this for my own sanity so I can easily do repeatable deploys on my own VPS.

- `ghcr.io/mvexel/osm-opening-hours-api:latest` - Express API server
- `ghcr.io/mvexel/osm-opening-hours-frontend:latest` - React frontend (nginx)
- `ghcr.io/mvexel/osm-opening-hours-pipeline:latest` - Data import pipeline

Oh - the react component...

The frontend depends on `@osm-is-it-open/hours`, which is not yet published to npm. So I macgyvered the github action to fetches this dependency from the [osm-is-it-open repository](https://github.com/mvexel/osm-is-it-open) during the build.