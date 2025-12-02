import { useEffect, useRef, useState } from 'react'
import { Map as MapGL, MapRef, NavigationControl } from '@vis.gl/react-maplibre'
import maplibregl from 'maplibre-gl'
import type { POI } from '../types/poi'
import { DEFAULT_VIEW, MAP_STYLE, MIN_ZOOM } from '../config/map'
import 'maplibre-gl/dist/maplibre-gl.css'

interface MapProps {
  pois: POI[]
  onBoundsChange: (bbox: [number, number, number, number], zoom: number) => void
  onSelectPoi?: (poi: POI) => void
  onViewChange?: (view: { latitude: number; longitude: number; zoom: number }) => void
  initialViewState?: { latitude: number; longitude: number; zoom: number }
  currentZoom?: number
  selectedPoi?: POI | null
}

export function Map({
  pois,
  onBoundsChange,
  onSelectPoi,
  onViewChange,
  initialViewState,
  currentZoom,
  selectedPoi,
}: MapProps) {
  const mapRef = useRef<MapRef>(null)
  const [viewState, setViewState] = useState(initialViewState ?? DEFAULT_VIEW)

  // Update POI data when pois change
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !map.getSource('pois')) return

    const source = map.getSource('pois') as maplibregl.GeoJSONSource
    source.setData({
      type: 'FeatureCollection',
      features: pois.map(poi => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [poi.lon, poi.lat]
        },
        properties: {
          id: poi.id,
          name: poi.name,
          status: poi.openStatus,
          selected: selectedPoi?.id === poi.id
        }
      }))
    })
  }, [pois, selectedPoi?.id])

  useEffect(() => {
    if (initialViewState) {
      setViewState(initialViewState)

      const map = mapRef.current?.getMap()
      if (map && initialViewState.zoom >= MIN_ZOOM) {
        setTimeout(() => {
          const bounds = map.getBounds()
          const bbox: [number, number, number, number] = [
            bounds.getWest(),
            bounds.getSouth(),
            bounds.getEast(),
            bounds.getNorth(),
          ]
          onBoundsChange(bbox, initialViewState.zoom)
          onViewChange?.({
            latitude: initialViewState.latitude,
            longitude: initialViewState.longitude,
            zoom: initialViewState.zoom
          })
        }, 100)
      }
    }
  }, [initialViewState?.latitude, initialViewState?.longitude, initialViewState?.zoom])

  const handleLoad = () => {
    const map = mapRef.current?.getMap()
    if (!map) return

    // Add POI source and layer
    map.addSource('pois', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    })

    map.addLayer({
      id: 'poi-circles',
      type: 'circle',
      source: 'pois',
      paint: {
        'circle-radius': [
          'case',
          ['get', 'selected'],
          12,
          8
        ],
        'circle-color': [
          'match',
          ['get', 'status'],
          'open', '#22c55e',
          'closed', '#ef4444',
          '#94a3b8'
        ],
        'circle-stroke-width': [
          'case',
          ['get', 'selected'],
          3,
          2
        ],
        'circle-stroke-color': [
          'case',
          ['get', 'selected'],
          '#3b82f6',
          '#ffffff'
        ]
      }
    })

    const bounds = map.getBounds()
    const zoom = map.getZoom()
    if (zoom < MIN_ZOOM) return

    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ]
    onBoundsChange(bbox, zoom)
    onViewChange?.({ latitude: map.getCenter().lat, longitude: map.getCenter().lng, zoom })
  }

  const handleMoveEnd = () => {
    const map = mapRef.current?.getMap()
    if (!map) return

    const zoom = map.getZoom()
    if (zoom < MIN_ZOOM) return

    const bounds = map.getBounds()
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ]
    onBoundsChange(bbox, zoom)
    onViewChange?.({ latitude: map.getCenter().lat, longitude: map.getCenter().lng, zoom })
  }

  const handleClick = (e: any) => {
    const map = mapRef.current?.getMap()
    if (!map) return

    const features = map.queryRenderedFeatures(e.point, { layers: ['poi-circles'] })
    if (!features || features.length === 0) return

    const poiId = features[0].properties?.id
    if (!poiId) return

    const poi = pois.find((p) => p.id === poiId)
    if (poi && onSelectPoi) {
      onSelectPoi(poi)
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }} >
      <MapGL
        ref={mapRef}
        {...viewState}
        minZoom={MIN_ZOOM}
        onMove={(evt) => setViewState(evt.viewState)}
        onMoveEnd={handleMoveEnd}
        onLoad={handleLoad}
        onClick={handleClick}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        cursor="pointer"
      >
        <NavigationControl position="top-right" />
      </MapGL>
      {
        viewState.zoom < MIN_ZOOM && (
          <div
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              top: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(255,255,255,0.9)',
              color: '#334155',
              padding: '10px 14px',
              borderRadius: 10,
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            }}
          >
            Zoom to level 16+ to load POIs
          </div>
        )
      }
    </div >
  )
}
