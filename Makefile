.PHONY: help up down logs db-seed db-reset build clean

help:
	@echo "OSM Opening Hours App - Docker Commands"
	@echo ""
	@echo "Usage:"
	@echo "  make up          - Start all services (postgres + api)"
	@echo "  make down        - Stop all services"
	@echo "  make logs        - View service logs"
	@echo "  make db-seed     - Import OSM data into database"
	@echo "  make db-reset    - Reset database (WARNING: deletes all data)"
	@echo "  make build       - Build Docker images"
	@echo "  make clean       - Remove volumes and clean up"
	@echo ""

up:
	docker-compose up -d postgres api

down:
	docker-compose down

logs:
	docker-compose logs -f

db-seed:
	@echo "Importing OSM data..."
	@echo "Using: $${OSM_DATA_FILE:-/app/data/utah-latest.osm.pbf}"
	docker-compose run --rm data-pipeline

db-reset:
	@echo "WARNING: This will delete all data in the database!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose down -v; \
		docker-compose up -d postgres; \
		echo "Database reset complete. Run 'make db-seed' to import data."; \
	fi

build:
	docker-compose build

clean:
	docker-compose down -v
	rm -rf data/*.osm.pbf
