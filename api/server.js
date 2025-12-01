const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Database connection pool
const pool = new Pool({
    host: process.env.DATABASE_HOST || 'localhost',
    port: process.env.DATABASE_PORT || 5432,
    database: process.env.DATABASE_NAME || 'poi',
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Get POIs within bounding box
app.get('/api/pois', async (req, res) => {
    try {
        const { bbox } = req.query;

        if (!bbox) {
            return res.status(400).json({ error: 'Missing bbox parameter' });
        }

        // Parse bbox: west,south,east,north
        const coords = bbox.split(',').map(Number);
        if (coords.length !== 4 || coords.some(isNaN)) {
            return res.status(400).json({ error: 'Invalid bbox format. Expected: west,south,east,north' });
        }

        const [west, south, east, north] = coords;

        // Query POIs within bounding box using PostGIS
        const query = `
      SELECT 
        osm_type,
        osm_id,
        name,
        class,
        tags,
        ST_Y(geom) as lat,
        ST_X(geom) as lon
      FROM pois
      WHERE ST_Contains(
        ST_MakeEnvelope($1, $2, $3, $4, 4326),
        geom
      )
      LIMIT 1000
    `;

        const result = await pool.query(query, [west, south, east, north]);

        // Format response to match Overpass API structure
        const elements = result.rows.map(row => {
            const tags = row.tags || {};
            // Include name in tags if it exists
            if (row.name) {
                tags.name = row.name;
            }
            return {
                type: row.osm_type === 'N' ? 'node' : row.osm_type === 'W' ? 'way' : 'relation',
                id: row.osm_id,
                lat: parseFloat(row.lat),
                lon: parseFloat(row.lon),
                tags
            };
        });

        res.json({ elements });
    } catch (error) {
        console.error('Error fetching POIs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get single element by type and ID
app.get('/api/element/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;

        // Map type to osm_type column value
        const osmTypeMap = {
            'node': 'N',
            'n': 'N',
            'way': 'W',
            'w': 'W',
            'relation': 'R',
            'r': 'R'
        };

        const osmType = osmTypeMap[type.toLowerCase()];
        if (!osmType) {
            return res.status(400).json({ error: 'Invalid type. Use node, way, or relation' });
        }

        const query = `
      SELECT 
        osm_type,
        osm_id,
        name,
        class,
        tags,
        ST_Y(geom) as lat,
        ST_X(geom) as lon
      FROM pois
      WHERE osm_type = $1 AND osm_id = $2
      LIMIT 1
    `;

        const result = await pool.query(query, [osmType, parseInt(id)]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Element not found' });
        }

        const row = result.rows[0];
        const tags = row.tags || {};
        // Include name in tags if it exists
        if (row.name) {
            tags.name = row.name;
        }
        const element = {
            type: row.osm_type === 'N' ? 'node' : row.osm_type === 'W' ? 'way' : 'relation',
            id: row.osm_id,
            lat: parseFloat(row.lat),
            lon: parseFloat(row.lon),
            tags
        };

        res.json({ elements: [element] });
    } catch (error) {
        console.error('Error fetching element:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start server
app.listen(port, '0.0.0.0', () => {
    console.log(`API server listening on port ${port}`);
    console.log(`Database: ${process.env.DATABASE_NAME} on ${process.env.DATABASE_HOST}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    pool.end();
    process.exit(0);
});
