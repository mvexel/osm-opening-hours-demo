import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Map } from './components/Map';
import { OpeningHours, OpeningHoursEditor, OpeningHoursSchedule, opening_hours } from '@osm-is-it-open/hours';
import '@osm-is-it-open/hours/dist/styles.css';
import { DEFAULT_VIEW, MIN_ZOOM } from './config/map';
import { reverseGeocodePlace } from './utils/nominatim';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const LOCALE_OPTIONS = [
    'en', 'en-US', 'en-GB', 'en-CA',
    'fr', 'fr-CA', 'de', 'es', 'it',
    'nl', 'pt', 'sv', 'da', 'fi',
    'no', 'pl', 'cs', 'sk', 'sl',
    'hu', 'ro', 'bg', 'el', 'ru',
    'ja', 'ko', 'zh-CN', 'zh-TW', 'ar',
];
function computeStatus(oh, now) {
    if (!oh)
        return 'unknown';
    try {
        const unknown = oh.getUnknown(now);
        if (unknown)
            return 'unknown';
        return oh.getState(now) ? 'open' : 'closed';
    }
    catch {
        return 'unknown';
    }
}
function prettifyValue(oh, fallback) {
    if (!oh)
        return fallback ?? '';
    try {
        return oh.prettifyValue() || fallback || '';
    }
    catch {
        return fallback || '';
    }
}
export default function App() {
    const [pois, setPois] = useState([]);
    const [selectedPoi, setSelectedPoi] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [hourCycle, setHourCycle] = useState('24h');
    const [locale, setLocale] = useState('en');
    const [initialViewState, setInitialViewState] = useState(DEFAULT_VIEW);
    const [currentZoom, setCurrentZoom] = useState(DEFAULT_VIEW.zoom);
    const [selectedPlace, setSelectedPlace] = useState(null);
    const now = useMemo(() => new Date(), []);
    const fetchPOIs = async (bbox, zoom) => {
        if (zoom < MIN_ZOOM) {
            setPois([]);
            setError(null);
            setLoading(false);
            setSelectedPoi(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            if (bbox.some((n) => Number.isNaN(n) || !Number.isFinite(n))) {
                console.warn('Invalid bbox:', bbox);
                return;
            }
            // Fetch POIs from local API
            const bboxParam = bbox.join(',');
            const res = await fetch(`${API_URL}/pois?bbox=${bboxParam}`);
            if (!res.ok) {
                throw new Error(`API error (${res.status}): Unable to fetch POIs`);
            }
            const data = await res.json();
            const parsed = [];
            for (const el of data.elements ?? []) {
                if (el.type !== 'node')
                    continue;
                const tags = el.tags || {};
                const openingHours = tags.opening_hours ||
                    tags['opening_hours:covid19'] ||
                    tags['opening_hours:conditional'] ||
                    undefined;
                let oh = null;
                if (openingHours) {
                    try {
                        oh = new opening_hours(openingHours, { lat: el.lat, lon: el.lon, address: { country_code: '', state: '' } });
                    }
                    catch {
                        oh = null;
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
                });
            }
            setPois(parsed);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        }
        finally {
            setLoading(false);
        }
    };
    const handleViewChange = (view) => {
        setCurrentZoom(view.zoom);
        const lat = view.latitude.toFixed(5);
        const lon = view.longitude.toFixed(5);
        const zoom = view.zoom.toFixed(2);
        const hash = `#map=${zoom}/${lat}/${lon}`;
        const url = new URL(window.location.href);
        url.hash = hash;
        window.history.replaceState(null, '', url.toString());
        reverseGeocodePlace(view.latitude, view.longitude).then((info) => {
            setSelectedPlace(info || null);
        });
    };
    useEffect(() => {
        const hashView = parseMapHash(window.location.hash);
        if (hashView)
            setInitialViewState(hashView);
        reverseGeocodePlace(initialViewState.latitude, initialViewState.longitude).then((info) => {
            setSelectedPlace(info || null);
        });
    }, []);
    const selectedOh = useMemo(() => {
        if (!selectedPoi?.openingHours)
            return null;
        try {
            return new opening_hours(selectedPoi.openingHours, {
                lat: selectedPoi.lat,
                lon: selectedPoi.lon,
                address: { country_code: selectedPlace?.countryCode || '', state: selectedPlace?.state || '' },
            });
        }
        catch {
            return null;
        }
    }, [selectedPoi?.id, selectedPlace?.countryCode, selectedPlace?.state]);
    const handlePoiEdit = (oh) => {
        if (!selectedPoi)
            return;
        const updatedStatus = computeStatus(oh, new Date());
        const prettified = prettifyValue(oh, selectedPoi.openingHours);
        setSelectedPoi({ ...selectedPoi, openingHours: prettified, openStatus: updatedStatus });
        setPois((prev) => prev.map((p) => (p.id === selectedPoi.id ? { ...p, openingHours: prettified, openStatus: updatedStatus } : p)));
    };
    const handleLoadElement = async (type, id) => {
        try {
            setLoading(true);
            setError(null);
            // Map type to full name for API
            const typeMap = { n: 'node', w: 'way', r: 'relation' };
            const typeName = typeMap[type];
            const res = await fetch(`${API_URL}/element/${typeName}/${id}`);
            if (!res.ok) {
                if (res.status === 404) {
                    throw new Error('Element not found');
                }
                throw new Error(`API error (${res.status}): Unable to fetch element`);
            }
            const data = await res.json();
            const element = data?.elements?.[0];
            if (!element)
                throw new Error('Element not found');
            const tags = element.tags || {};
            const openingHours = tags.opening_hours ||
                tags['opening_hours:covid19'] ||
                tags['opening_hours:conditional'] ||
                '';
            const oh = openingHours ? new opening_hours(openingHours, { lat: element.lat, lon: element.lon, address: { country_code: '', state: '' } }) : null;
            const poi = {
                id: `${typeName}/${id}`,
                lat: element.lat,
                lon: element.lon,
                name: tags.name,
                amenity: tags.amenity,
                shop: tags.shop,
                tags,
                openingHours,
                openStatus: computeStatus(oh, new Date()),
            };
            setSelectedPoi(poi);
            setPois((prev) => {
                const filtered = prev.filter((p) => p.id !== poi.id);
                return [poi, ...filtered];
            });
            const view = { latitude: poi.lat, longitude: poi.lon, zoom: Math.max(MIN_ZOOM, 18) };
            setInitialViewState(view);
            handleViewChange(view);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load element');
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "app", children: [_jsxs("div", { className: "header", children: [_jsxs("div", { children: [_jsx("h1", { children: "OSM Opening Hours Explorer" }), _jsx("p", { children: "Map, inspect, and edit opening hours for nearby POIs." })] }), _jsxs("div", { className: "controls", children: [_jsxs("div", { className: "control", children: [_jsx("span", { children: "Clock" }), _jsx("div", { className: "pill-group", children: ['24h', '12h'].map((cycle) => (_jsx("button", { className: hourCycle === cycle ? 'pill active' : 'pill', onClick: () => setHourCycle(cycle), type: "button", children: cycle }, cycle))) })] }), _jsxs("div", { className: "control", children: [_jsx("span", { children: "Locale" }), _jsx("select", { value: locale, onChange: (e) => setLocale(e.target.value || 'en'), children: LOCALE_OPTIONS.map((code) => (_jsx("option", { value: code, children: code }, code))) })] }), _jsxs("div", { className: "control", children: [_jsx("span", { children: "Jump to element" }), _jsx(ElementLoader, { onLoad: handleLoadElement, loading: loading })] })] })] }), _jsxs("div", { className: "main", children: [_jsx("div", { className: "map-pane", children: _jsx(Map, { pois: pois, onBoundsChange: fetchPOIs, onSelectPoi: setSelectedPoi, onViewChange: handleViewChange, initialViewState: initialViewState, currentZoom: currentZoom }) }), _jsxs("div", { className: "side-pane", children: [loading && _jsx("div", { className: "status", children: "Loading\u2026" }), error && _jsx("div", { className: "status error", children: error }), selectedPoi ? (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "card-header", children: [_jsxs("div", { children: [_jsx("div", { className: "label", children: "Name" }), _jsx("div", { className: "title", children: selectedPoi.name || 'Unnamed place' }), selectedPlace?.city && (_jsxs("div", { className: "muted", children: [selectedPlace.city, selectedPlace.countryCode ? ` · ${selectedPlace.countryCode.toUpperCase()}` : ''] }))] }), _jsx(OpeningHours, { openingHours: selectedOh, hourCycle: hourCycle, locale: locale, editable: false, className: "oh-badge" })] }), _jsxs("div", { className: "card-body", children: [_jsx("div", { className: "label", children: "Schedule" }), _jsx(OpeningHoursSchedule, { openingHours: selectedOh, hourCycle: hourCycle, locale: locale })] }), _jsxs("div", { className: "card-body", children: [_jsx("div", { className: "label", children: "Edit" }), _jsx(OpeningHoursEditor, { openingHours: selectedOh, hourCycle: hourCycle, onChange: handlePoiEdit })] })] })) : (_jsx("div", { className: "placeholder", children: "Select a POI marker to inspect its opening hours." }))] })] })] }));
}
function parseMapHash(hash) {
    const match = hash.match(/^#map=([\d.]+)\/([\d.-]+)\/([\d.-]+)/);
    if (!match)
        return null;
    const zoom = Number(match[1]);
    const lat = Number(match[2]);
    const lon = Number(match[3]);
    if ([zoom, lat, lon].some((n) => Number.isNaN(n)))
        return null;
    return { latitude: lat, longitude: lon, zoom };
}
function ElementLoader({ onLoad, loading }) {
    const [value, setValue] = useState('');
    const handleSubmit = () => {
        const match = value.trim().match(/^(node|way|relation|[nwr])\/?(\d+)$/i);
        if (!match)
            return;
        const typeChar = match[1].toLowerCase()[0];
        const id = Number(match[2]);
        if (!Number.isNaN(id))
            onLoad(typeChar, id);
    };
    return (_jsxs("div", { className: "element-loader", children: [_jsx("input", { value: value, onChange: (e) => setValue(e.target.value), placeholder: "node/123, way/456\u2026", onKeyDown: (e) => {
                    if (e.key === 'Enter')
                        handleSubmit();
                } }), _jsx("button", { type: "button", onClick: handleSubmit, disabled: loading, children: "Load" })] }));
}
