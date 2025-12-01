import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Map as MapGL, Marker, NavigationControl } from '@vis.gl/react-maplibre';
import { DEFAULT_VIEW, MAP_STYLE, MIN_ZOOM } from '../config/map';
import 'maplibre-gl/dist/maplibre-gl.css';
const getMarkerColor = (openStatus) => {
    switch (openStatus) {
        case 'open':
            return '#10b981';
        case 'closed':
            return '#ef4444';
        case 'unknown':
        default:
            return '#6b7280';
    }
};
export function Map({ pois, onBoundsChange, onSelectPoi, onViewChange, initialViewState, currentZoom, }) {
    const mapRef = useRef(null);
    const [viewState, setViewState] = useState(initialViewState ?? DEFAULT_VIEW);
    useEffect(() => {
        if (initialViewState) {
            setViewState(initialViewState);
        }
    }, [initialViewState?.latitude, initialViewState?.longitude, initialViewState?.zoom]);
    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (map && map.isStyleLoaded()) {
            const bounds = map.getBounds();
            const zoom = map.getZoom();
            if (zoom < MIN_ZOOM)
                return;
            const bbox = [
                bounds.getWest(),
                bounds.getSouth(),
                bounds.getEast(),
                bounds.getNorth(),
            ];
            onBoundsChange(bbox, zoom);
            onViewChange?.({ latitude: map.getCenter().lat, longitude: map.getCenter().lng, zoom });
        }
    }, []);
    const handleMoveEnd = (evt) => {
        const map = evt.target;
        const zoom = map.getZoom();
        if (zoom < MIN_ZOOM)
            return;
        const bounds = map.getBounds();
        const bbox = [
            bounds.getWest(),
            bounds.getSouth(),
            bounds.getEast(),
            bounds.getNorth(),
        ];
        onBoundsChange(bbox, zoom);
        onViewChange?.({ latitude: map.getCenter().lat, longitude: map.getCenter().lng, zoom });
    };
    return (_jsxs("div", { style: { position: 'relative', width: '100%', height: '100%' }, children: [_jsxs(MapGL, { ref: mapRef, ...viewState, minZoom: MIN_ZOOM, onMove: (evt) => setViewState(evt.viewState), onMoveEnd: handleMoveEnd, style: { width: '100%', height: '100%' }, mapStyle: MAP_STYLE, children: [_jsx(NavigationControl, { position: "top-right" }), pois.map((poi) => (_jsx(Marker, { latitude: poi.lat, longitude: poi.lon, anchor: "bottom", children: _jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }, children: [_jsx("button", { type: "button", onClick: () => onSelectPoi?.(poi), style: {
                                        width: poi.openStatus === 'unknown' ? 14 : 18,
                                        height: poi.openStatus === 'unknown' ? 14 : 18,
                                        borderRadius: '9999px',
                                        border: '2px solid #fff',
                                        backgroundColor: getMarkerColor(poi.openStatus),
                                        boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                                        cursor: 'pointer',
                                    }, title: poi.name || 'Point of interest', "aria-label": poi.name || 'Point of interest' }), poi.name && (currentZoom ?? viewState.zoom) >= 18 && (_jsx("div", { style: {
                                        fontSize: 10,
                                        color: '#0f172a',
                                        fontWeight: 600,
                                        padding: '0 4px',
                                        textShadow: '0 0 3px rgba(255,255,255,0.9), 0 0 6px rgba(255,255,255,0.7)',
                                    }, children: poi.name }))] }) }, poi.id)))] }), viewState.zoom < MIN_ZOOM && (_jsx("div", { style: {
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
                }, children: "Zoom to level 16+ to load POIs" }))] }));
}
