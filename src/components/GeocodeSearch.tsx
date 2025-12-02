import { useState } from 'react'
import { NOMINATIM_BASE_URL } from '../utils/nominatim'

interface GeocodeSearchProps {
  onLocationSelect: (lat: number, lon: number, zoom: number) => void
  loading?: boolean
}

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
  type: string
}

export function GeocodeSearch({ onLocationSelect, loading }: GeocodeSearchProps) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)

  const handleSearch = async () => {
    if (!query.trim() || searching) return

    setSearching(true)
    try {
      const response = await fetch(
        `${NOMINATIM_BASE_URL}/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`
      )
      const results: NominatimResult[] = await response.json()

      if (results.length > 0) {
        const result = results[0]
        const lat = parseFloat(result.lat)
        const lon = parseFloat(result.lon)
        const zoom = 13 // City-level zoom
        onLocationSelect(lat, lon, zoom)
        setQuery('')
      }
    } catch (error) {
      console.error('Geocoding error:', error)
    } finally {
      setSearching(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className="geocode-search">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search city..."
        disabled={loading || searching}
      />
      <button
        type="button"
        onClick={handleSearch}
        disabled={loading || searching || !query.trim()}
      >
        {searching ? '...' : 'Go'}
      </button>
    </div>
  )
}
