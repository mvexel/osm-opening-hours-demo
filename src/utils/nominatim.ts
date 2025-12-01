const NOMINATIM_URL =
  (import.meta.env.VITE_NOMINATIM_URL as string | undefined) ||
  'https://nominatim.openstreetmap.org/reverse'

type PlaceInfo = {
  countryCode?: string
  state?: string
  city?: string
  displayName?: string
}

const cache = new Map<string, PlaceInfo | undefined>()

export async function reverseGeocodePlace(lat: number, lon: number): Promise<PlaceInfo | undefined> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`
  if (cache.has(key)) return cache.get(key)

  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lon))
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('zoom', '10')
  url.searchParams.set('addressdetails', '1')

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Nominatim error ${res.status}`)
    const data = await res.json()
    const address = data?.address ?? {}
    const city =
      address.city ||
      address.town ||
      address.village ||
      address.hamlet ||
      address.locality ||
      address.county
    const info: PlaceInfo = {
      countryCode: address.country_code,
      state: address.state,
      city,
      displayName: data?.display_name,
    }
    cache.set(key, info)
    return info
  } catch {
    cache.set(key, undefined)
    return undefined
  }
}

export async function reverseGeocodeCountry(lat: number, lon: number): Promise<string | undefined> {
  const info = await reverseGeocodePlace(lat, lon)
  return info?.countryCode
}
