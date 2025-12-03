import type { opening_hours as OpeningHoursLib } from '@osm-is-it-open/hours'
import { HourCycle, OpeningHoursEditor, OpeningHoursSchedule, opening_hours } from '@osm-is-it-open/hours'
import '@osm-is-it-open/hours/dist/styles.css'
import { useEffect, useMemo, useState } from 'react'
import { GeocodeSearch } from './components/GeocodeSearch'
import { Map } from './components/Map'
import { DEFAULT_VIEW, MIN_ZOOM } from './config/map'
import { LOCALE_OPTIONS } from './config/locales'
import type { OpenStatus, POI } from './types/poi'
import { reverseGeocodePlace } from './utils/nominatim'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

type ViewState = { latitude: number; longitude: number; zoom: number }

type PlaceInfo = { city?: string; countryCode?: string; state?: string }

function computeStatus(oh: OpeningHoursLib | null, now: Date): OpenStatus {
  if (!oh) return 'unknown'
  try {
    const unknown = oh.getUnknown(now)
    if (unknown) return 'unknown'
    return oh.getState(now) ? 'open' : 'closed'
  } catch {
    return 'unknown'
  }
}

function prettifyValue(oh: OpeningHoursLib | null, fallback: string | undefined): string {
  if (!oh) return fallback ?? ''
  try {
    return oh.prettifyValue() || fallback || ''
  } catch {
    return fallback || ''
  }
}

function getStatusLabel(oh: OpeningHoursLib | null, now: Date): string {
  if (!oh) return 'Unknown'
  try {
    const unknown = oh.getUnknown(now)
    if (unknown) return 'Unknown'
    return oh.getState(now) ? 'Open' : 'Closed'
  } catch {
    return 'Unknown'
  }
}

function getStatusClass(oh: OpeningHoursLib | null, now: Date): string {
  if (!oh) return 'status-unknown'
  try {
    const unknown = oh.getUnknown(now)
    if (unknown) return 'status-unknown'
    return oh.getState(now) ? 'status-open' : 'status-closed'
  } catch {
    return 'status-unknown'
  }
}

function formatRelativeTime(date: Date, now: Date, hourCycle: HourCycle, locale: string): string {
  const nowDate = new Date(now)
  nowDate.setHours(0, 0, 0, 0)
  const targetDate = new Date(date)
  targetDate.setHours(0, 0, 0, 0)

  const dayDiff = Math.floor((targetDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24))

  // Check if time is midnight (00:00)
  const isMidnight = date.getHours() === 0 && date.getMinutes() === 0

  // Special case: tomorrow at midnight = at midnight
  if (dayDiff === 1 && isMidnight) {
    return 'at midnight'
  }

  let timeStr: string
  if (isMidnight) {
    timeStr = 'midnight'
  } else {
    const timeFormatter = new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      ...(hourCycle !== HourCycle.Auto && { hour12: hourCycle === HourCycle.TwelveHour }),
    })
    timeStr = timeFormatter.format(date)
  }

  if (dayDiff === 0) {
    return `today ${timeStr}`
  } else if (dayDiff === 1) {
    return `tomorrow ${timeStr}`
  } else {
    const dayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'long' })
    const dayName = dayFormatter.format(date)
    return `${dayName} ${timeStr}`
  }
}

function getNextChangeMessage(oh: OpeningHoursLib | null, now: Date, hourCycle: HourCycle, locale: string): string | null {
  if (!oh) return null
  try {
    const unknown = oh.getUnknown(now)
    if (unknown) return null

    const isOpen = oh.getState(now)
    const nextChange = oh.getNextChange(now)

    if (!nextChange) return null

    const relativeTime = formatRelativeTime(nextChange, now, hourCycle, locale)

    if (isOpen) {
      return `Closes ${relativeTime}`
    } else {
      return `Opens ${relativeTime}`
    }
  } catch {
    return null
  }
}

export default function App() {
  const [pois, setPois] = useState<POI[]>([])
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hourCycle, setHourCycle] = useState<HourCycle>(HourCycle.Auto)
  const [locale, setLocale] = useState<string>('en')
  const [initialViewState, setInitialViewState] = useState<ViewState>(DEFAULT_VIEW)
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_VIEW.zoom)
  const [selectedPlace, setSelectedPlace] = useState<PlaceInfo | null>(null)
  const [isEditing, setIsEditing] = useState(false)

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
      const [west, south, east, north] = bbox
      const bboxParam = `${west},${south},${east},${north}`
      console.log('Fetching POIs from API:', bboxParam)

      // Get place info for country code (use center of bbox)
      const centerLat = (north + south) / 2
      const centerLon = (east + west) / 2
      const placeInfo = await reverseGeocodePlace(centerLat, centerLon)

      const res = await fetch(`${API_URL}/pois?bbox=${bboxParam}`)
      if (!res.ok) {
        const errorText = await res.text()
        console.error('API error response:', errorText)
        throw new Error(`API error (${res.status}): ${errorText}`)
      }
      const data = await res.json()
      const parsed: POI[] = []
      for (const feature of data.features ?? []) {
        const props = feature.properties || {}
        const [lon, lat] = feature.geometry.coordinates
        const openingHours =
          props.opening_hours ||
          props['opening_hours:covid19'] ||
          props['opening_hours:conditional'] ||
          undefined

        let oh: opening_hours | null = null
        if (openingHours) {
          try {
            oh = new opening_hours(openingHours, {
              lat,
              lon,
              address: {
                country_code: placeInfo?.countryCode || '',
                state: placeInfo?.state || ''
              }
            })
          } catch (err) {
            console.warn(`Failed to parse opening hours for ${feature.id}:`, openingHours, err)
            oh = null
          }
        }

        parsed.push({
          id: feature.id,
          lat,
          lon,
          name: props.name,
          amenity: props.amenity,
          shop: props.shop,
          tags: props,
          openingHours,
          openStatus: computeStatus(oh, now),
        })
        if (!openingHours || !oh) {
          console.log(`POI ${feature.id} has no valid hours:`, { openingHours, status: computeStatus(oh, now) })
        }
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

  useEffect(() => {
    setIsEditing(false)
  }, [selectedPoi?.id])

  const selectedOh = useMemo(() => {
    console.log('[selectedOh memo] Running with:', {
      poiId: selectedPoi?.id,
      openingHours: selectedPoi?.openingHours,
      hasOpeningHours: !!selectedPoi?.openingHours,
    })
    if (!selectedPoi?.openingHours) {
      console.log('No opening hours for POI:', selectedPoi?.id)
      return null
    }
    try {
      const oh = new opening_hours(selectedPoi.openingHours, {
        lat: selectedPoi.lat,
        lon: selectedPoi.lon,
        address: { country_code: selectedPlace?.countryCode || '', state: selectedPlace?.state || '' },
      })
      console.log('Created opening_hours object:', {
        raw: selectedPoi.openingHours,
        prettified: oh.prettifyValue(),
        isOpen: oh.getState(new Date()),
        isUnknown: oh.getUnknown(new Date()),
      })
      return oh
    } catch (error) {
      console.error('Failed to parse opening hours:', selectedPoi.openingHours, error)
      return null
    }
  }, [selectedPoi?.id, selectedPoi?.openingHours, selectedPlace?.countryCode, selectedPlace?.state])

  const handleSelectPoi = (poi: POI) => {
    console.log('[handleSelectPoi] Selected POI:', { id: poi.id, openingHours: poi.openingHours, openStatus: poi.openStatus })
    setSelectedPoi(poi)
  }

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
      const typeStr = type === 'n' ? 'node' : type === 'w' ? 'way' : 'relation'
      console.log('Loading element from API:', typeStr, id)
      const res = await fetch(`${API_URL}/element/${typeStr}/${id}`)
      if (!res.ok) {
        const errorText = await res.text()
        console.error('API error response:', errorText)
        throw new Error(`API error (${res.status}): ${errorText}`)
      }
      const data = await res.json()
      const feature = data?.features?.[0]
      if (!feature) throw new Error('Element not found')

      const props = feature.properties || {}
      const [lon, lat] = feature.geometry.coordinates

      // Get location info first for country code
      const placeInfo = await reverseGeocodePlace(lat, lon)

      const openingHours =
        props.opening_hours ||
        props['opening_hours:covid19'] ||
        props['opening_hours:conditional'] ||
        ''
      const oh = openingHours ? new opening_hours(openingHours, {
        lat,
        lon,
        address: {
          country_code: placeInfo?.countryCode || '',
          state: placeInfo?.state || ''
        }
      }) : null
      const poi: POI = {
        id: feature.id,
        lat,
        lon,
        name: props.name,
        amenity: props.amenity,
        shop: props.shop,
        tags: props,
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
            <span>Search</span>
            <GeocodeSearch
              onLocationSelect={(lat, lon, zoom) => {
                setSelectedPoi(null)
                const view = { latitude: lat, longitude: lon, zoom }
                setInitialViewState(view)
                handleViewChange(view)
              }}
              loading={loading}
            />
          </div>
          <div className="control">
            <span>Clock</span>
            <div className="pill-group">
              {Object.values(HourCycle).map((cycle) => (
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
            onSelectPoi={handleSelectPoi}
            onViewChange={handleViewChange}
            initialViewState={initialViewState}
            currentZoom={currentZoom}
            selectedPoi={selectedPoi}
          />
          {loading && (
            <div className="map-loading-overlay">
              <div className="spinner"></div>
            </div>
          )}
        </div>
        <div className="side-pane">
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
                <div className="oh-status">
                  <div className={`oh-badge ${getStatusClass(selectedOh, now)}`}>
                    {getStatusLabel(selectedOh, now)}
                  </div>
                  {getNextChangeMessage(selectedOh, now, hourCycle, locale) && (
                    <div className="oh-next-change">
                      {getNextChangeMessage(selectedOh, now, hourCycle, locale)}
                    </div>
                  )}
                  <button
                    type="button"
                    className="pill pill-sm"
                    onClick={() => setIsEditing(!isEditing)}
                  >
                    {isEditing ? 'View Schedule' : selectedOh ? 'Edit' : '+ Hours'}
                  </button>
                </div>
              </div>

              {selectedOh || isEditing ? (
                <div className="card-body">
                  <div className="label">{isEditing ? 'Edit' : 'Schedule'}</div>
                  {isEditing ? (
                    <OpeningHoursEditor
                      key={`editor-${selectedPoi.id}`}
                      openingHours={selectedOh || new opening_hours('24/7', {
                        lat: selectedPoi.lat,
                        lon: selectedPoi.lon,
                        address: { country_code: selectedPlace?.countryCode || '', state: selectedPlace?.state || '' },
                      })}
                      locale={locale}
                      onChange={handlePoiEdit}
                    />
                  ) : (
                    <OpeningHoursSchedule
                      key={`schedule-${selectedPoi.id}`}
                      openingHours={selectedOh}
                      hourCycle={hourCycle === HourCycle.Auto ? undefined : hourCycle}
                      locale={locale}
                    />
                  )}
                </div>
              ) : (
                <div className="card-body">
                  <div className="no-hours-message">
                    No opening hours specified for this location.
                  </div>
                </div>
              )}
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
