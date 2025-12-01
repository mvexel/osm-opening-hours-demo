# Repository Guidelines

## Project Structure & Module Organization
- Vite + React + TypeScript app. Entry: `src/main.tsx` bootstraps `App.tsx`.
- UI: `src/components/Map.tsx` wraps MapLibre; shared styling in `src/index.css`.
- Config/constants: `src/config/map.ts`; shared types in `src/types/poi.ts`; utilities (e.g., Nominatim reverse geocode) in `src/utils/nominatim.ts`.
- Assets are bundled by Vite; keep new modules under `src` and colocate component-specific styles next to components when possible.

## Build, Test, and Development Commands
- `npm install` — installs deps; note `@osm-is-it-open/hours` is linked from `../osm-is-it-open`, so keep that sibling repo present or adjust the path.
- `npm run dev` — start Vite dev server with HMR.
- `npm run build` — type-check via `tsc` then build production assets.
- `npm run preview` — serve the production build locally for smoke testing.

## Coding Style & Naming Conventions
- TypeScript-first; prefer typed props and narrow return types. Use `OpenStatus` and `POI` from `src/types/poi.ts`.
- React function components with hooks; avoid class components. Keep state local, and lift only when shared (see `App.tsx` for patterns).
- Indent with 2 spaces; single quotes; trailing commas allowed. Match existing JSX formatting and keep JSX attributes sorted logically (data/behavior before presentation).
- Use small, purposeful helper functions (`computeStatus`, `prettifyValue`) and colocate helpers that only serve a component.

## Testing Guidelines
- No automated test suite yet; rely on `npm run build` for type safety.
- Before opening a PR, manually verify: map renders, local API queries succeed at >= `MIN_ZOOM`, element loader accepts `node/…` or `way/…`, and editing opening hours updates badge/schedule.

## Commit Messages

- Use concise, present-tense Conventional Commit headers when possible (e.g., `feat: add api error handling`, `fix: clamp map zoom`).

## Commit & Pull Request Guidelines
- Keep commits scoped and reversible; prefer separating refactors from behavior changes.
- PRs should include: summary of changes, linked issue (if any), manual test notes, and screenshots/GIFs for UI changes (map view, modals, or loading states).

## Data & API Notes
- Overpass endpoint is `https://overpass-api.de/api/interpreter`; keep timeouts modest and avoid excessive polling.
- Nominatim reverse-geocode is triggered on view change; debounce or cache if adding new calls.
- Respect MapLibre defaults in `src/config/map.ts`; adjust `MIN_ZOOM`/`DEFAULT_VIEW` there instead of hardcoding values in components.
