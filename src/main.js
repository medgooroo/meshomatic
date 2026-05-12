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

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
if (!MAPBOX_TOKEN) {
    console.warn('VITE_MAPBOX_TOKEN is not set — terrain fetches will fail. Set it in .env.');
}

window.onload = () => {
    document.getElementById("downloadMesh").onclick = function () { run(); };

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
    map.on(L.Draw.Event.CREATED, function (e) {
        drawnItems.addLayer(e.layer);
    });

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

    async function run() {
        var b = document.getElementById("downloadMesh");
        b.onclick = function () { };
        b.setAttribute('value', "Processing...");
        setTimeout(function () { dumpPoints(); }, 50);
    }

    async function reset() {
        var b = document.getElementById("downloadMesh");
        b.onclick = function () {
            run();
        };
        b.setAttribute("value", "Download");
    }

    async function dumpPoints() {
        const imgs = imgCollection.getLayers();
        const layer = drawnItems.getLayers();
        const origin = originCollection.getLayers();

        if (origin.length < 1) {
            alert("No origin defined");
            reset();
            return;
        }
        var b = document.getElementById("downloadMesh");
        b.setAttribute('value', "Processing...");
        b.onclick = '';

        var polyAsPoints = [];
        var shape;
        layer.forEach(function (curr) {
            if (curr instanceof L.Polygon) {
                shape = curr.getLatLngs();
            }
        });
        if (shape) {
            // we're only interested in the first poly. make it into a format earcut understands.
            for (var i = 0; i < shape[0].length; i++) {
                polyAsPoints.push(shape[0][i].lat);
                polyAsPoints.push(shape[0][i].lng);
            }
            var tris = earcut(polyAsPoints);
            const output = tris.map(i => shape[0][i]);
            genMesh(output);
        }
        // fallback to just using the bounds of a loaded image.
        else if (imgs.length > 0) {
            const corners = imgs[0].getCorners();
            var tris = [
                corners[0],
                corners[1],
                corners[2],
                corners[1],
                corners[3],
                corners[2]
            ];
            genMesh(tris);
        }
        else {
            alert("Define a polygon or image to create a mesh");
            reset();
        }
    }


    async function genMesh(pointsToMesh) {
        const bounds = L.latLngBounds(pointsToMesh);
        const distance = bounds.getNorthWest().distanceTo(bounds.getNorthEast());
        const metresAtZeroZoom = 40075015.68; // tile size 256 * px/m at zoom 0
        var meshZoom = Math.floor(Math.abs(Math.log2(distance / metresAtZeroZoom)));
        if (meshZoom > 15) meshZoom = 15; // clamp to data resolution

        var outputMeshRes = parseFloat(document.getElementById("res").value);

        const tLatLng = latlng2tile(bounds.getNorthWest(), meshZoom);

        const elevImage = await getRegion(
            tLatLng.tLat,
            tLatLng.tLng,
            meshZoom,
            `https://api.mapbox.com/v4/mapbox.terrain-rgb/zoom/tLong/tLat.pngraw?access_token=${MAPBOX_TOKEN}`
        );
        const canvas = document.createElement("canvas");
        var ctx = canvas.getContext("2d");
        canvas.width = 3 * 256;
        canvas.height = 3 * 256;
        const elevSize = elevImage.width;

        ctx.drawImage(elevImage, 0, 0);
        var imageData = ctx.getImageData(0, 0, elevSize, elevSize);

        const elev = new Float32Array((elevSize) * (elevSize));

        var imgIndex = 0;
        // decode terrain values https://docs.mapbox.com/help/troubleshooting/access-elevation-data/
        for (let y = 0; y < elevSize; y++) {
            for (let x = 0; x < elevSize; x++) {
                const k = (imgIndex) * 4;
                const r = imageData.data[k + 0];
                const g = imageData.data[k + 1];
                const b = imageData.data[k + 2];
                elev[y * elevSize + x] = (r * 256 * 256 + g * 256.0 + b) / 10.0 - 10000.0;
                imgIndex++;
            }
        }

        // expand elev with arbitrary size to 2^n + 1
        const paddedSize = 1 + Math.pow(2, Math.ceil(Math.log(elevSize) / Math.log(2)));
        const paddedElev = new Float32Array(paddedSize * paddedSize);
        for (var x = 0; x < paddedSize; x++) {
            for (var y = 0; y < paddedSize; y++) {
                if ((x < elevSize) && (y < elevSize))
                    paddedElev[x * paddedSize + y] = elev[x * elevSize + y];
                else paddedElev[x * paddedSize + y] = 0; // rough discontinuity at right/bottom edges
            }
        }

        // https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Resolution_and_Scale
        const lat = bounds.getNorthWest().lat;
        const crs = L.CRS.EPSG3857;
        const meshCorner = tLatLng2LatLng(tLatLng, meshZoom);

        var pointsToMeshReferenced = new Array(pointsToMesh.length * 2);
        const meshOrig = crs.latLngToPoint(meshCorner, meshZoom);
        for (var i = 0; i < pointsToMesh.length; i++) {
            var pt = crs.latLngToPoint(pointsToMesh[i], meshZoom);
            pointsToMeshReferenced[i * 2] = pt.x - meshOrig.x;
            pointsToMeshReferenced[(i * 2) + 1] = pt.y - meshOrig.y;
        }

        const jini = new Jini(paddedElev);
        const mesh = jini.getBoundedMesh(pointsToMeshReferenced, outputMeshRes);

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

        var fType = document.getElementById("filetype").value;
        if (fType == "obj") writeObj(mesh);
        if (fType == "dbacv") writeArrayCalc(mesh);
        if (fType == "txt") writeSoundVision(mesh);
        if (fType == "dae") writeCollada(mesh);
        if (fType == "bprint") writeBlueprint(mesh);
        if (fType == "mappDef") writeMapp(mesh, 0);
        if (fType == "mappUpload") writeMapp(mesh, 1);
        if (fType == "dxf") writeDXF(mesh);
        reset();
    }


    // fetch the 3x3 neighbourhood of tiles starting at (tLat, tLong)
    async function getRegion(tLat, tLong, zoom, api) {
        const canvas = document.createElement("canvas");
        canvas.width = 3 * 256;
        canvas.height = 3 * 256;
        const ctx = canvas.getContext("2d");
        for (let x = 0; x < 3; x++) {
            const _tLong = tLong + x;
            for (let y = 0; y < 3; y++) {
                const _tLat = tLat + y;
                const url = api
                    .replace("zoom", zoom)
                    .replace("tLat", _tLat)
                    .replace("tLong", _tLong);
                let img = await loadImage(url);
                ctx.drawImage(img, x * 256, y * 256);
            }
        }
        return canvas;
    }

    // https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
    function tLatLng2LatLng(aTLatLng, z) {
        const lng = (aTLatLng.tLng / Math.pow(2, z) * 360 - 180);
        var n = Math.PI - 2 * Math.PI * aTLatLng.tLat / Math.pow(2, z);
        const lat = (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
        return { lat, lng };
    }

    function latlng2tile(aLatLng, zoom) {
        const tLng = Math.floor(((aLatLng.lng + 180) / 360) * Math.pow(2, zoom));
        const tLat = Math.floor(
            ((1 -
                Math.log(
                    Math.tan((aLatLng.lat * Math.PI) / 180) + 1 / Math.cos((aLatLng.lat * Math.PI) / 180)
                ) /
                Math.PI) /
                2) *
            Math.pow(2, zoom)
        );
        return { tLat, tLng };
    }

    function loadImage(url) {
        return new Promise((accept, error) => {
            const img = new Image();
            img.onload = () => accept(img);
            img.onerror = error;
            img.crossOrigin = "anonymous";
            img.src = url;
        });
    }
};
