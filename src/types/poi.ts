export type OpenStatus = 'open' | 'closed' | 'unknown'

export interface POI {
  id: string
  lat: number
  lon: number
  name?: string
  amenity?: string
  shop?: string
  tags: Record<string, string>
  openingHours?: string
  openStatus: OpenStatus
}

export interface POICategory {
  key: string
  value: string
  category: string
  subcategory?: string
}
