import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Some Leaflet plugins assume window.L. Pin a single instance for them
// to extend so we don't end up with two copies of Leaflet floating around.
window.L = L;

import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';

// leaflet-distortableimage's webpack output expects vendor.js to load before
// the main bundle (the main bundle references chunks defined in vendor.js).
import 'leaflet-distortableimage/dist/vendor.js';
import 'leaflet-distortableimage';
import 'leaflet-distortableimage/dist/vendor.css';
import 'leaflet-distortableimage/dist/leaflet.distortableimage.css';

import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import 'leaflet-geosearch/dist/geosearch.css';

import earcut from 'earcut';

import { Jini } from './jini.js';
import { tile2latlng } from './elevation/tiles.js';
import { providers, getProvider, providersCovering } from './elevation/index.js';
import {
    writeObj,
    writeArrayCalc,
    writeSoundVision,
    writeCollada,
    writeBlueprint,
} from './export.js';
import { writeMapp } from './mapp.js';
import { writeDXF } from './dxf.js';

import '../style.css';

if (!import.meta.env.VITE_MAPBOX_TOKEN) {
    console.warn('VITE_MAPBOX_TOKEN is not set — the Mapbox source will be hidden from the source dropdown. Set it in .env to enable.');
}

window.onload = () => {
    const downloadBtn = document.getElementById("downloadMesh");
    const statsEl = document.getElementById("meshStats");
    const spinnerEl = document.getElementById("meshSpinner");
    const providerSelect = document.getElementById("provider");

    // Populate the source dropdown from the provider registry. If no providers
    // pass their .available() check (e.g. Mapbox missing token, Terrarium
    // unreachable), we leave the dropdown empty and show a status message.
    for (const p of providers) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        providerSelect.appendChild(opt);
    }

    var layerOsm = new L.TileLayer(
        'https://{s}.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        {
            subdomains: ['server', 'services'],
            maxZoom: 20, noWrap: false,
            attribution: '<a href="https://www.arcgis.com/">ArcGIS</a>'
        });

    var layerGoogleSat = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    var imgCollection = L.distortableCollection();
    var originCollection = L.distortableCollection();
    var map = L.map('map', {
        center: [50.813802269173955, -2.474659707933869],
        zoom: 10,
        layers: [layerOsm, imgCollection, originCollection]
    });

    const search = new GeoSearchControl({
        provider: new OpenStreetMapProvider(),
    });
    map.addControl(search);

    var drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    var drawControl = new L.Control.Draw({
        draw: {
            circle: false,
            marker: false,
            polyline: false,
            rectangle: false,
            circlemarker: false,
            polygon: {
                allowIntersection: false,
                drawError: {
                    color: '#e1e100',
                    message: '<strong>Poly can\'t intersect itself</strong>',
                },
            },
        },
        edit: {
            featureGroup: drawnItems
        }
    });

    map.addControl(drawControl);

    var baseMaps = {
        "OSM": layerOsm,
        "Satellite": layerGoogleSat,
    };
    var overlayMaps = {};
    L.control.layers(baseMaps, overlayMaps).addTo(map);

    L.control.scale({ maxWidth: 240, metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

    L.Control.manipControl = L.Control.extend({
        options: {
            position: 'topleft'
        },

        onAdd: function () {
            var container = L.DomUtil.create('div', 'leaflet-bar');

            var loadImg = L.DomUtil.create('a', 'leaflet-control-loadImg', container);
            loadImg.title = "Load Image";
            var fInput = L.DomUtil.create('label', 'fileInput-label', loadImg);
            fInput.for = "fileInput";
            fInput.innerHTML = "Img";
            var fSelect = L.DomUtil.create('input', 'fileInput-select', fInput);
            fSelect.type = "file";
            fSelect.hidden = true;

            L.DomEvent.on(fSelect, 'change', function () {
                loadImageOverlay(this);
                fSelect.value = '';
            });
            var setOrigin = L.DomUtil.create('a', 'leaflet-control-setOrigin', container);
            setOrigin.innerHTML = "Origin";

            L.DomEvent.on(setOrigin, 'click', function () { setOriginImage(); });
            return container;
        },

        onRemove: function () {
            L.DomEvent.off();
        }
    });

    L.control.manipControl = function (opts) {
        return new L.Control.manipControl(opts);
    };
    L.control.manipControl({ position: 'topleft' }).addTo(map);

    function loadImageOverlay() {
        var file = document.querySelector('input[type=file]').files[0];
        const reader = new FileReader();
        reader.onload = L.Util.bind(function () {
            var img = L.distortableImageOverlay(reader.result, {
                selected: true,
                actions: [
                    L.ScaleAction,
                    L.RotateAction,
                    L.DragAction,
                    L.DistortAction,
                    L.OpacityAction,
                    L.DeleteAction,
                    L.LockAction
                ]
            });
            imgCollection.addLayer(img);
        }, this);
        reader.readAsDataURL(file);
    }

    function setOriginImage() {
        // axes.png is now served from same origin (public/), so CORS is no longer in the way.
        var origin = L.distortableImageOverlay(`${import.meta.env.BASE_URL}axes.png`, {
            actions: [
                L.FreeRotateAction,
                L.DeleteAction,
                L.LockAction
            ]
        });
        originCollection.addLayer(origin);
        originCollection.setZIndex(700);
        originCollection.bringToFront();
    }

    // ----- mesh build state -----
    // Cached meshes keyed by provider id. Cleared whenever the input geometry,
    // origin or error margin changes (everything in the inputs). NOT cleared
    // when the user switches the source dropdown — that just changes which
    // cached mesh is displayed in the live preview.
    const meshCache = new Map();
    let buildToken = 0;
    let debounceTimer = null;
    const REBUILD_DEBOUNCE_MS = 300;

    function setStatus(text, busy) {
        statsEl.textContent = text;
        spinnerEl.hidden = !busy;
    }
    function setStats(mesh) {
        const tris = mesh.triangles.length / 3;
        const verts = mesh.vertices.length / 3;
        setStatus(`Triangles: ${tris.toLocaleString()} / Vertices: ${verts.toLocaleString()}`, false);
    }

    function readyState() {
        const hasPoly = drawnItems.getLayers().some(l => l instanceof L.Polygon);
        const hasImg = imgCollection.getLayers().length > 0;
        const hasOrigin = originCollection.getLayers().length > 0;
        if (!hasPoly && !hasImg) return { ready: false, msg: "Draw a polygon to mesh." };
        if (!hasOrigin) return { ready: false, msg: "Place the origin." };
        return { ready: true };
    }

    function gatherInputPoints() {
        const layers = drawnItems.getLayers();
        let shape;
        layers.forEach(curr => {
            if (curr instanceof L.Polygon) shape = curr.getLatLngs();
        });
        if (shape) {
            const polyAsPoints = [];
            for (let i = 0; i < shape[0].length; i++) {
                polyAsPoints.push(shape[0][i].lat, shape[0][i].lng);
            }
            const tris = earcut(polyAsPoints);
            return tris.map(i => shape[0][i]);
        }
        const imgs = imgCollection.getLayers();
        if (imgs.length > 0) {
            // fallback to image bounds
            const c = imgs[0].getCorners();
            return [c[0], c[1], c[2], c[1], c[3], c[2]];
        }
        return null;
    }

    // Schedule a live preview rebuild for the currently selected provider.
    // `invalidate` clears all cached meshes (use when inputs changed). Pass
    // false when only the dropdown selection changed — then cached meshes
    // for other providers survive.
    function scheduleRebuild({ invalidate = true } = {}) {
        if (invalidate) meshCache.clear();
        clearTimeout(debounceTimer);
        const state = readyState();
        if (!state.ready) {
            setStatus(state.msg, false);
            return;
        }
        setStatus("Calculating…", true);
        debounceTimer = setTimeout(runLivePreview, REBUILD_DEBOUNCE_MS);
    }

    // Builds (or fetches from cache) the mesh for one specific provider.
    // Returns null on failure. Doesn't touch the UI directly.
    async function buildForProvider(provider) {
        const cached = meshCache.get(provider.id);
        if (cached) return cached;
        const points = gatherInputPoints();
        if (!points) return null;
        const mesh = await buildMesh(points, provider);
        meshCache.set(provider.id, mesh);
        return mesh;
    }

    // Live preview for the selected source. Cancellable via buildToken so a
    // change made while a build is in flight wins.
    async function runLivePreview() {
        const state = readyState();
        if (!state.ready) {
            setStatus(state.msg, false);
            return;
        }
        const provider = getProvider(providerSelect.value);
        if (!provider) return;
        const cached = meshCache.get(provider.id);
        if (cached) {
            setStats(cached);
            return;
        }
        const token = ++buildToken;
        setStatus("Calculating…", true);
        try {
            const mesh = await buildForProvider(provider);
            if (token !== buildToken) return;
            if (!mesh) return;
            setStats(mesh);
        } catch (err) {
            if (token !== buildToken) return;
            console.error(err);
            setStatus("Error: " + err.message, false);
        }
    }

    downloadBtn.onclick = async () => {
        const points = gatherInputPoints();
        if (!points) return;
        const bounds = L.latLngBounds(points);
        const targets = providersCovering(bounds);
        if (targets.length === 0) {
            setStatus("No elevation source covers this area.", false);
            return;
        }

        downloadBtn.disabled = true;
        const label = targets.length === 1
            ? "Building mesh…"
            : `Building ${targets.length} meshes…`;
        setStatus(label, true);
        try {
            // Build any not cached, in parallel
            const meshes = await Promise.all(targets.map(p => buildForProvider(p)));
            const fType = document.getElementById("filetype").value;
            const useSuffix = targets.length > 1;
            for (let i = 0; i < targets.length; i++) {
                const provider = targets[i];
                const mesh = meshes[i];
                if (!mesh) continue;
                const basename = useSuffix ? `mesh-${provider.id}` : "mesh";
                dispatchWrite(mesh, fType, basename);
            }
            // Restore the preview count for the currently-selected source
            const selectedProvider = getProvider(providerSelect.value);
            const previewMesh = meshCache.get(selectedProvider?.id);
            if (previewMesh) setStats(previewMesh);
        } catch (err) {
            console.error(err);
            setStatus("Download failed: " + err.message, false);
        } finally {
            downloadBtn.disabled = false;
        }
    };

    function dispatchWrite(mesh, fType, basename) {
        if (fType === "obj") writeObj(mesh, basename);
        else if (fType === "dbacv") writeArrayCalc(mesh, basename);
        else if (fType === "txt") writeSoundVision(mesh, basename);
        else if (fType === "dae") writeCollada(mesh, basename);
        else if (fType === "bprint") writeBlueprint(mesh, basename);
        else if (fType === "mappDef") writeMapp(mesh, 0, 0, basename);
        else if (fType === "mappUpload") writeMapp(mesh, 1, 0, basename);
        else if (fType === "dxf") writeDXF(mesh, basename);
    }

    // ----- subscribe to changes that should re-build -----
    map.on(L.Draw.Event.CREATED, (e) => {
        drawnItems.addLayer(e.layer);
        scheduleRebuild();
    });
    map.on(L.Draw.Event.EDITED, scheduleRebuild);
    map.on(L.Draw.Event.DELETED, scheduleRebuild);

    // When an origin or background image is added, wire its own update events
    // (drag/rotate/scale fire on the layer itself, not on the collection).
    function wireOverlayLayer(layer) {
        if (!layer || typeof layer.on !== 'function') return;
        layer.on('update edit dragend', scheduleRebuild);
    }
    originCollection.on('layeradd', (e) => { wireOverlayLayer(e.layer); scheduleRebuild(); });
    originCollection.on('layerremove', scheduleRebuild);
    imgCollection.on('layeradd', (e) => { wireOverlayLayer(e.layer); scheduleRebuild(); });
    imgCollection.on('layerremove', scheduleRebuild);

    document.getElementById("res").addEventListener('change', () => scheduleRebuild());
    // Source dropdown change: don't invalidate other providers' cached meshes,
    // just display the newly-selected source's count (rebuild only if it isn't
    // cached yet).
    providerSelect.addEventListener('change', () => scheduleRebuild({ invalidate: false }));

    // initial status
    if (providers.length === 0) {
        setStatus("No elevation source available. Set VITE_MAPBOX_TOKEN or check network access to terrarium tiles.", false);
        downloadBtn.disabled = true;
    } else {
        setStatus(readyState().msg, false);
    }


    async function buildMesh(pointsToMesh, provider) {
        const bounds = L.latLngBounds(pointsToMesh);
        const distance = bounds.getNorthWest().distanceTo(bounds.getNorthEast());
        const metresAtZeroZoom = 40075015.68; // tile size 256 * px/m at zoom 0
        let meshZoom = Math.floor(Math.abs(Math.log2(distance / metresAtZeroZoom)));
        meshZoom = Math.min(meshZoom, provider.maxZoom);

        const maxError = parseFloat(document.getElementById("res").value);

        const { elev, elevSize, nwTile } = await provider.fetch(bounds, meshZoom);

        // https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Resolution_and_Scale
        const lat = bounds.getNorthWest().lat;
        const crs = L.CRS.EPSG3857;
        const meshCorner = tile2latlng(nwTile, meshZoom);

        var pointsToMeshReferenced = new Array(pointsToMesh.length * 2);
        const meshOrig = crs.latLngToPoint(meshCorner, meshZoom);
        for (var i = 0; i < pointsToMesh.length; i++) {
            var pt = crs.latLngToPoint(pointsToMesh[i], meshZoom);
            pointsToMeshReferenced[i * 2] = pt.x - meshOrig.x;
            pointsToMeshReferenced[(i * 2) + 1] = pt.y - meshOrig.y;
        }

        const jini = new Jini(elev);
        const mesh = jini.getBoundedMesh(pointsToMeshReferenced, maxError);

        // re-reference verts to user-placed origin image, in pixel space
        const userOrigin = originCollection.getLayers();
        const userOriginCenter = userOrigin[0].getCenter();
        const userOriginCenterPt = crs.latLngToPoint(userOriginCenter, meshZoom);
        userOriginCenterPt.x -= meshOrig.x;
        userOriginCenterPt.y -= meshOrig.y;
        const heightAtUserOrigin = elev[Math.floor(userOriginCenterPt.y) * elevSize + Math.floor(userOriginCenterPt.x)];

        for (var i = 0; i < mesh.vertices.length; i = i + 3) {
            mesh.vertices[i] = userOriginCenterPt.x - mesh.vertices[i]; // flip
            mesh.vertices[i + 1] = userOriginCenterPt.y - mesh.vertices[i + 1];
            mesh.vertices[i + 2] = heightAtUserOrigin - mesh.vertices[i + 2];
        }
        // rotate about this origin
        const angle = -1 * userOrigin[0].getAngle('rad');
        for (var i = 0; i < mesh.vertices.length; i = i + 3) {
            const x = mesh.vertices[i];
            const y = mesh.vertices[i + 1];
            mesh.vertices[i] = (x * Math.cos(angle)) - (y * Math.sin(angle));
            mesh.vertices[i + 1] = (x * Math.sin(angle)) + (y * Math.cos(angle));
        }
        // At zoom 0 one pixel = 156543.03 m at the equator
        const mtrsPerPix = (156543.03 * Math.cos(Math.PI / 180 * lat) / (Math.pow(2, meshZoom)));
        for (var i = 0; i < mesh.vertices.length; i = i + 3) {
            // invert x and z to switch LH to RH coords, then scale.
            mesh.vertices[i] = -1 * mesh.vertices[i] * mtrsPerPix;
            mesh.vertices[i + 1] = mesh.vertices[i + 1] * mtrsPerPix;
            mesh.vertices[i + 2] = -1 * mesh.vertices[i + 2];
        }

        return mesh;
    }


};
