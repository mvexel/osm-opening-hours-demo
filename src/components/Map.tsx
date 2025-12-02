import { useEffect, useRef, useState } from 'react'
import { Map as MapGL, Marker, MapRef, NavigationControl } from '@vis.gl/react-maplibre'
import type { ViewStateChangeEvent } from '@vis.gl/react-maplibre'
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
}

const getMarkerColor = (openStatus: POI['openStatus']): string => {
  switch (openStatus) {
    case 'open':
      return '#10b981'
    case 'closed':
      return '#ef4444'
    case 'unknown':
    default:
      return '#6b7280'
  }
}

export function Map({
  pois,
  onBoundsChange,
  onSelectPoi,
  onViewChange,
  initialViewState,
  currentZoom,
}: MapProps) {
  const mapRef = useRef<MapRef>(null)
  const [viewState, setViewState] = useState(initialViewState ?? DEFAULT_VIEW)

  useEffect(() => {
    if (initialViewState) {
      setViewState(initialViewState)

      // Trigger bounds change when view is programmatically updated
      const map = mapRef.current?.getMap()
      if (map && initialViewState.zoom >= MIN_ZOOM) {
        // Use setTimeout to ensure map has updated to new position
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

  const handleMoveEnd = (evt: ViewStateChangeEvent) => {
    const map = evt.target
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

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapGL
        ref={mapRef}
        {...viewState}
        minZoom={MIN_ZOOM}
        onMove={(evt) => setViewState(evt.viewState)}
        onMoveEnd={handleMoveEnd}
        onLoad={handleLoad}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
      >
        <NavigationControl position="top-right" />
        {pois.map((poi) => (
          <Marker key={poi.id} latitude={poi.lat} longitude={poi.lon} anchor="bottom">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <button
                type="button"
                onClick={() => onSelectPoi?.(poi)}
                style={{
                  width: poi.openStatus === 'unknown' ? 14 : 18,
                  height: poi.openStatus === 'unknown' ? 14 : 18,
                  borderRadius: '9999px',
                  border: '2px solid #fff',
                  backgroundColor: getMarkerColor(poi.openStatus),
                  boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                  cursor: 'pointer',
                }}
                title={poi.name || 'Point of interest'}
                aria-label={poi.name || 'Point of interest'}
              />
              {poi.name && (currentZoom ?? viewState.zoom) >= 18 && (
                <div
                  style={{
                    fontSize: 10,
                    color: '#0f172a',
                    fontWeight: 600,
                    padding: '0 4px',
                    textShadow: '0 0 3px rgba(255,255,255,0.9), 0 0 6px rgba(255,255,255,0.7)',
                  }}
                >
                  {poi.name}
                </div>
              )}
            </div>
          </Marker>
        ))}
      </MapGL>
      {viewState.zoom < MIN_ZOOM && (
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
      )}
    </div>
  )
}
