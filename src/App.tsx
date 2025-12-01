import { useEffect, useMemo, useState } from 'react'
import { Map } from './components/Map'
import { OpeningHours, OpeningHoursEditor, OpeningHoursSchedule, opening_hours } from '@osm-is-it-open/hours'
import '@osm-is-it-open/hours/dist/styles.css'
import type { POI, OpenStatus } from './types/poi'
import { DEFAULT_VIEW, MIN_ZOOM } from './config/map'
import { reverseGeocodePlace } from './utils/nominatim'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const POI_CATEGORIES: Array<[string, string]> = [
  ['amenity', 'restaurant'],
  ['amenity', 'cafe'],
  ['amenity', 'bar'],
  ['amenity', 'pub'],
  ['amenity', 'fast_food'],
  ['amenity', 'food_court'],
  ['amenity', 'ice_cream'],
  ['shop', 'convenience'],
  ['shop', 'supermarket'],
  ['shop', 'bakery'],
  ['shop', 'butcher'],
  ['shop', 'coffee'],
  ['shop', 'grocery'],
  ['shop', 'greengrocer'],
  ['shop', 'clothes'],
  ['shop', 'shoes'],
  ['shop', 'books'],
  ['shop', 'gift'],
  ['shop', 'florist'],
  ['shop', 'hardware'],
  ['shop', 'electronics'],
  ['shop', 'mobile_phone'],
  ['shop', 'furniture'],
  ['shop', 'toys'],
  ['shop', 'sports'],
  ['shop', 'bicycle'],
  ['shop', 'pharmacy'],
  ['shop', 'chemist'],
  ['amenity', 'bank'],
  ['amenity', 'pharmacy'],
  ['amenity', 'post_office'],
  ['amenity', 'library'],
  ['amenity', 'fuel'],
  ['amenity', 'cinema'],
  ['amenity', 'theatre'],
  ['amenity', 'nightclub'],
  ['amenity', 'doctors'],
  ['amenity', 'dentist'],
  ['amenity', 'clinic'],
  ['amenity', 'hospital'],
  ['amenity', 'veterinary'],
]

const LOCALE_OPTIONS = [
  'en', 'en-US', 'en-GB', 'en-CA',
  'fr', 'fr-CA', 'de', 'es', 'it',
  'nl', 'pt', 'sv', 'da', 'fi',
  'no', 'pl', 'cs', 'sk', 'sl',
  'hu', 'ro', 'bg', 'el', 'ru',
  'ja', 'ko', 'zh-CN', 'zh-TW', 'ar',
]

type ViewState = { latitude: number; longitude: number; zoom: number }

type PlaceInfo = { city?: string; countryCode?: string; state?: string }

function buildQuery(bbox: [number, number, number, number]): string {
  const [south, west, north, east] = bbox
  const filters = POI_CATEGORIES.map(([k, v]) => `  node["${k}"="${v}"](${south},${west},${north},${east});`).join('\n')
  return `
  [out:json][timeout:25];
  (
${filters}
  );
  out body;
  >;
  out skel qt;
  `
}

function computeStatus(oh: opening_hours | null, now: Date): OpenStatus {
  if (!oh) return 'unknown'
  try {
    const unknown = oh.getUnknown(now)
    if (unknown) return 'unknown'
    return oh.getState(now) ? 'open' : 'closed'
  } catch {
    return 'unknown'
  }
}

function prettifyValue(oh: opening_hours | null, fallback: string | undefined): string {
  if (!oh) return fallback ?? ''
  try {
    return oh.prettifyValue() || fallback || ''
  } catch {
    return fallback || ''
  }
}

export default function App() {
  const [pois, setPois] = useState<POI[]>([])
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hourCycle, setHourCycle] = useState<'12h' | '24h'>('24h')
  const [locale, setLocale] = useState<string>('en')
  const [initialViewState, setInitialViewState] = useState<ViewState>(DEFAULT_VIEW)
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_VIEW.zoom)
  const [selectedPlace, setSelectedPlace] = useState<PlaceInfo | null>(null)

  const now = useMemo(() => new Date(), [])

  const fetchPOIs = async (bbox: [number, number, number, number], zoom: number) => {
    if (zoom < MIN_ZOOM) {
      setPois([])
      setError(null)
      setLoading(false)
      setSelectedPoi(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const query = buildQuery(bbox)
      console.log('Overpass query:', query)
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }).toString(),
      })
      if (!res.ok) {
        const errorText = await res.text()
        console.error('Overpass error response:', errorText)
        throw new Error(`Overpass error (${res.status}): ${errorText}`)
      }
      const data = await res.json()
      const parsed: POI[] = []
      for (const el of data.elements ?? []) {
        if (el.type !== 'node') continue
        const tags = el.tags || {}
        const openingHours =
          tags.opening_hours ||
          tags['opening_hours:covid19'] ||
          tags['opening_hours:conditional'] ||
          undefined

        let oh: opening_hours | null = null
        if (openingHours) {
          try {
            oh = new opening_hours(openingHours, { lat: el.lat, lon: el.lon, address: { country_code: '', state: '' } })
          } catch {
            oh = null
          }
        }

        parsed.push({
          id: `node/${el.id}`,
          lat: el.lat,
          lon: el.lon,
          name: tags.name,
          amenity: tags.amenity,
          shop: tags.shop,
          tags,
          openingHours,
          openStatus: computeStatus(oh, now),
        })
      }
      setPois(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleViewChange = (view: ViewState) => {
    setCurrentZoom(view.zoom)
    const lat = view.latitude.toFixed(5)
    const lon = view.longitude.toFixed(5)
    const zoom = view.zoom.toFixed(2)
    const hash = `#map=${zoom}/${lat}/${lon}`
    const url = new URL(window.location.href)
    url.hash = hash
    window.history.replaceState(null, '', url.toString())

    reverseGeocodePlace(view.latitude, view.longitude).then((info) => {
      setSelectedPlace(info || null)
    })
  }

  useEffect(() => {
    const hashView = parseMapHash(window.location.hash)
    if (hashView) setInitialViewState(hashView)
    reverseGeocodePlace(initialViewState.latitude, initialViewState.longitude).then((info) => {
      setSelectedPlace(info || null)
    })
  }, [])

  const selectedOh = useMemo(() => {
    if (!selectedPoi?.openingHours) return null
    try {
      return new opening_hours(selectedPoi.openingHours, {
        lat: selectedPoi.lat,
        lon: selectedPoi.lon,
        address: { country_code: selectedPlace?.countryCode || '', state: selectedPlace?.state || '' },
      })
    } catch {
      return null
    }
  }, [selectedPoi?.id, selectedPlace?.countryCode, selectedPlace?.state])

  const handlePoiEdit = (oh: opening_hours) => {
    if (!selectedPoi) return
    const updatedStatus = computeStatus(oh, new Date())
    const prettified = prettifyValue(oh, selectedPoi.openingHours)
    setSelectedPoi({ ...selectedPoi, openingHours: prettified, openStatus: updatedStatus })
    setPois((prev) => prev.map((p) => (p.id === selectedPoi.id ? { ...p, openingHours: prettified, openStatus: updatedStatus } : p)))
  }

  const handleLoadElement = async (type: 'n' | 'w' | 'r', id: number) => {
    try {
      setLoading(true)
      setError(null)
      const query = `[out:json][timeout:20]; ${type}(${id}); out body;`
      console.log('Element query:', query)
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }).toString(),
      })
      if (!res.ok) {
        const errorText = await res.text()
        console.error('Overpass error response:', errorText)
        throw new Error(`Overpass error (${res.status}): ${errorText}`)
      }
      const data = await res.json()
      const element = data?.elements?.[0]
      if (!element) throw new Error('Element not found')
      const tags = element.tags || {}
      const openingHours =
        tags.opening_hours ||
        tags['opening_hours:covid19'] ||
        tags['opening_hours:conditional'] ||
        ''
      const oh = openingHours ? new opening_hours(openingHours, { lat: element.lat, lon: element.lon, address: { country_code: '', state: '' } }) : null
      const poi: POI = {
        id: `${type === 'n' ? 'node' : type === 'w' ? 'way' : 'relation'}/${id}`,
        lat: element.lat,
        lon: element.lon,
        name: tags.name,
        amenity: tags.amenity,
        shop: tags.shop,
        tags,
        openingHours,
        openStatus: computeStatus(oh, new Date()),
      }
      setSelectedPoi(poi)
      setPois((prev) => {
        const filtered = prev.filter((p) => p.id !== poi.id)
        return [poi, ...filtered]
      })
      const view = { latitude: poi.lat, longitude: poi.lon, zoom: Math.max(MIN_ZOOM, 18) }
      setInitialViewState(view)
      handleViewChange(view)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load element')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <div className="header">
        <div>
          <h1>OSM Opening Hours Explorer</h1>
          <p>Map, inspect, and edit opening hours for nearby POIs.</p>
        </div>
        <div className="controls">
          <div className="control">
            <span>Clock</span>
            <div className="pill-group">
              {(['24h', '12h'] as const).map((cycle) => (
                <button
                  key={cycle}
                  className={hourCycle === cycle ? 'pill active' : 'pill'}
                  onClick={() => setHourCycle(cycle)}
                  type="button"
                >
                  {cycle}
                </button>
              ))}
            </div>
          </div>
          <div className="control">
            <span>Locale</span>
            <select value={locale} onChange={(e) => setLocale(e.target.value || 'en')}>
              {LOCALE_OPTIONS.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div className="control">
            <span>Jump to element</span>
            <ElementLoader onLoad={handleLoadElement} loading={loading} />
          </div>
        </div>
      </div>

      <div className="main">
        <div className="map-pane">
          <Map
            pois={pois}
            onBoundsChange={fetchPOIs}
            onSelectPoi={setSelectedPoi}
            onViewChange={handleViewChange}
            initialViewState={initialViewState}
            currentZoom={currentZoom}
          />
        </div>
        <div className="side-pane">
          {loading && <div className="status">Loading…</div>}
          {error && <div className="status error">{error}</div>}
          {selectedPoi ? (
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="label">Name</div>
                  <div className="title">{selectedPoi.name || 'Unnamed place'}</div>
                  {selectedPlace?.city && (
                    <div className="muted">{selectedPlace.city}{selectedPlace.countryCode ? ` · ${selectedPlace.countryCode.toUpperCase()}` : ''}</div>
                  )}
                </div>
                <OpeningHours
                  openingHours={selectedOh ?? new opening_hours('24/7')}
                  hourCycle={hourCycle}
                  locale={locale}
                  editable={false}
                  className="oh-badge"
                />
              </div>

              <div className="card-body">
                <div className="label">Schedule</div>
                <OpeningHoursSchedule
                  openingHours={selectedOh ?? new opening_hours('24/7')}
                  hourCycle={hourCycle}
                  locale={locale}
                />
              </div>

              <div className="card-body">
                <div className="label">Edit</div>
                <OpeningHoursEditor
                  openingHours={selectedOh ?? new opening_hours('24/7')}
                  hourCycle={hourCycle}
                  onChange={handlePoiEdit}
                />
              </div>
            </div>
          ) : (
            <div className="placeholder">Select a POI marker to inspect its opening hours.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function parseMapHash(hash: string): ViewState | null {
  const match = hash.match(/^#map=([\d.]+)\/([\d.-]+)\/([\d.-]+)/)
  if (!match) return null
  const zoom = Number(match[1])
  const lat = Number(match[2])
  const lon = Number(match[3])
  if ([zoom, lat, lon].some((n) => Number.isNaN(n))) return null
  return { latitude: lat, longitude: lon, zoom }
}

function ElementLoader({ onLoad, loading }: { onLoad: (type: 'n' | 'w' | 'r', id: number) => void; loading: boolean }) {
  const [value, setValue] = useState('')
  const handleSubmit = () => {
    const match = value.trim().match(/^(node|way|relation|[nwr])\/?(\d+)$/i)
    if (!match) return
    const typeChar = match[1].toLowerCase()[0] as 'n' | 'w' | 'r'
    const id = Number(match[2])
    if (!Number.isNaN(id)) onLoad(typeChar, id)
  }
  return (
    <div className="element-loader">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="node/123, way/456…"
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit()
        }}
      />
      <button type="button" onClick={handleSubmit} disabled={loading}>
        Load
      </button>
    </div>
  )
}
