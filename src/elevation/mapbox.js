import { fetchTileGrid } from './tiles.js';

// Mapbox terrain-rgb. See https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-rgb-v1/
// Encoded at 0.1m resolution worldwide; effective resolution depends on
// underlying source data (SRTM globally, higher-res over many regions).
const BASE_URL = 'https://api.mapbox.com/v4/mapbox.terrain-rgb';

function decode(r, g, b) {
    return (r * 65536 + g * 256 + b) / 10 - 10000;
}

export function createMapboxProvider(token) {
    return {
        id: 'mapbox',
        name: 'Mapbox terrain-rgb (global)',
        maxZoom: 15,
        available: () => Boolean(token),
        covers: () => true, // global
        async fetch(bounds, zoom) {
            if (!token) throw new Error('Mapbox token is required (set VITE_MAPBOX_TOKEN)');
            return fetchTileGrid({
                bounds,
                zoom,
                decode,
                urlFor: ({ tLng, tLat, zoom: z }) =>
                    `${BASE_URL}/${z}/${tLng}/${tLat}.pngraw?access_token=${token}`,
            });
        },
    };
}
