// Registry of elevation providers. Add new ones here.
//
// Each provider exposes:
//   id        — short string identifier, used as the dropdown value and filename suffix
//   name      — human-readable label
//   maxZoom   — highest zoom level the underlying data supports
//   available — () => boolean, gates inclusion in the registry (e.g. missing token)
//   covers    — (bounds) => boolean, gates inclusion in multi-export per AOI
//   fetch     — async (bounds, zoom) => { elev, elevSize, nwTile }
//
// All current providers return data in slippy-map XYZ tile coordinates so the
// caller can use tile2latlng / latlng2tile from ./tiles.js to project back
// and forth. Non-tile providers (WCS, GeoTIFF) will need a richer return shape
// when they land.

import { createMapboxProvider } from './mapbox.js';

const all = [
    createMapboxProvider(import.meta.env.VITE_MAPBOX_TOKEN),
];

export const providers = all.filter(p => p.available());

export function getProvider(id) {
    return providers.find(p => p.id === id) ?? providers[0];
}

export function providersCovering(bounds) {
    return providers.filter(p => p.covers(bounds));
}
