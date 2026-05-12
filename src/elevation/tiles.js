// Shared helpers for any XYZ-tile-based elevation source: tile math,
// image loading, and a generic "fetch a grid of RGB-encoded elevation tiles
// covering this AOI" routine. Provider modules supply the URL template and
// the RGB→metres decode and call into fetchTileGrid.

export const TILE_SIZE = 256;

// Fold an arbitrary longitude into [-180, 180). Leaflet hands back un-wrapped
// values after panning across the antimeridian (e.g. +139° comes back as -221°)
// which would otherwise produce out-of-range negative tile X.
function normaliseLng(lng) {
    return ((lng + 180) % 360 + 360) % 360 - 180;
}

export function latlng2tile(latLng, zoom) {
    const n = Math.pow(2, zoom);
    const lng = normaliseLng(latLng.lng);
    const tLng = Math.floor(((lng + 180) / 360) * n);
    const latRad = (latLng.lat * Math.PI) / 180;
    const tLat = Math.floor(
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
    );
    return { tLat, tLng };
}

export function tile2latlng({ tLat, tLng }, zoom) {
    const n = Math.pow(2, zoom);
    const lng = (tLng / n) * 360 - 180;
    const k = Math.PI - (2 * Math.PI * tLat) / n;
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k)));
    return { lat, lng };
}

export function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Tile fetch failed: ${url}`));
        img.crossOrigin = 'anonymous';
        img.src = url;
    });
}

// Fetch a square grid of RGB elevation tiles covering `bounds` at `zoom`,
// stitch them into one canvas, decode each pixel to metres using `decode`,
// and return a Float32Array.
//
// Either `urlFor` (single URL per tile) or `loadTile` (custom loader, e.g.
// for cascading-fallback providers) is required.
//   urlFor:   ({ tLng, tLat, zoom }) => string
//   loadTile: ({ tLng, tLat, zoom }) => Promise<HTMLImageElement | null>
//             — return null to leave that tile blank in the grid (canvas
//             stays at rgba(0,0,0,0); decode() sees (0,0,0) and decides
//             what that means).
//   decode:   (r, g, b) => metres
//
// Returns { elev, elevSize, nwTile } where elevSize is the side length in
// pixels (always = max(spanX, spanY) tiles * TILE_SIZE, so the buffer is
// square — Jini requires that).
export async function fetchTileGrid({ bounds, zoom, urlFor, loadTile, decode }) {
    const load = loadTile ?? (async (coords) => loadImage(urlFor(coords)));

    const nwTile = latlng2tile(bounds.getNorthWest(), zoom);
    const seTile = latlng2tile(bounds.getSouthEast(), zoom);
    const spanX = (seTile.tLng - nwTile.tLng) + 1;
    const spanY = (seTile.tLat - nwTile.tLat) + 1;
    const span = Math.max(spanX, spanY);

    const canvas = document.createElement('canvas');
    canvas.width = span * TILE_SIZE;
    canvas.height = span * TILE_SIZE;
    const ctx = canvas.getContext('2d');

    const fetches = [];
    for (let x = 0; x < span; x++) {
        for (let y = 0; y < span; y++) {
            fetches.push(
                load({ tLng: nwTile.tLng + x, tLat: nwTile.tLat + y, zoom })
                    .then(img => ({ img, x, y }))
            );
        }
    }
    const tiles = await Promise.all(fetches);
    for (const { img, x, y } of tiles) {
        if (img) ctx.drawImage(img, x * TILE_SIZE, y * TILE_SIZE);
        // tiles that came back null stay at canvas default (0,0,0,0)
    }

    const side = span * TILE_SIZE;
    const imageData = ctx.getImageData(0, 0, side, side);
    const elev = new Float32Array(side * side);
    for (let i = 0; i < side * side; i++) {
        const k = i * 4;
        elev[i] = decode(imageData.data[k], imageData.data[k + 1], imageData.data[k + 2]);
    }

    return { elev, elevSize: side, nwTile };
}
