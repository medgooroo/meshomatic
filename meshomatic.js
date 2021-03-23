window.onload = (event) => {
    document.getElementById("downloadMesh").onclick = function () { run() };

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
        layers: [layerOsm, imgCollection, originCollection] // include overlays here
    });
    /////////////////


    const search = new GeoSearch.GeoSearchControl({
        provider: new GeoSearch.OpenStreetMapProvider(),
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
                allowIntersection: false, // Restricts shapes to simple polygons
                drawError: {
                    color: '#e1e100', // Color the shape will turn when intersects
                    message: '<strong>Poly can\'t intersect itself</strong>', // Message that will show when intersect
                },
            },
        },
        edit: {
            featureGroup: drawnItems
        }

    });

    map.addControl(drawControl);
    map.on(L.Draw.Event.CREATED, function (e) {
        var type = e.layerType,
            layer = e.layer;
        drawnItems.addLayer(layer);
    });
    ///////////
    var baseMaps = {
        // "Terrain": layerTerrain,
        "OSM": layerOsm,
        "Satellite": layerGoogleSat,
    };
    var overlayMaps = {
        //"Elevation": elevLayer
    };
    L.control.layers(baseMaps, overlayMaps).addTo(map);

    L.control.scale({ maxWidth: 240, metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

    //////////////////////////////////////////////
    L.Control.manipControl = L.Control.extend({
        options: {
            position: 'topleft'
        },

        onAdd: function (map) {
            var container = L.DomUtil.create('div', 'leaflet-bar');
            // manipButton.type = 'file';

            var loadImg = L.DomUtil.create('a', 'leaflet-control-loadImg', container);
            loadImg.title = "Load Image";
            var fInput = L.DomUtil.create('label', 'fileInput-label', loadImg);
            fInput.for = "fileInput";
            fInput.innerHTML = "Img";
            var fSelect = L.DomUtil.create('input', 'fileInput-select', fInput);
            fSelect.type = "file";
            fSelect.hidden = true;

            L.DomEvent.on(
                fSelect,
                'change',
                function () {
                    loadImageOverlay(this);
                    fSelect.value = ''; // reset so we can load the same image twice
                }
            )
            var setOrigin = L.DomUtil.create('a', 'leaflet-control-setOrigin', container);
            setOrigin.innerHTML = "Origin";

            L.DomEvent.on(
                setOrigin,
                'click',
                function () { setOriginImage() }
            );
            return container;
        },


        onRemove: function (map) {
            L.DomEvent.off();
        }
    });


    L.control.manipControl = function (opts) {
        return new L.Control.manipControl(opts);
    }
    L.control.manipControl({ position: 'topleft' }).addTo(map);

    function loadImageOverlay() {
        var file = document.querySelector('input[type=file]').files[0];
        const reader = new FileReader();
        reader.onload = L.Util.bind(function (e) {
            var img = L.distortableImageOverlay(reader.result, {
                selected: true,
                actions: [
                    L.ScaleAction,
                    L.RotateAction,
                    L.DragAction,
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
        var origin = L.distortableImageOverlay("https://i.postimg.cc/XY4fCqYw/axes.png", {
            // var origin = L.distortableImageOverlay("https://github.com/medgooroo/meshomatic/raw/main/axes.png", { // github serve this from somewhere else and CORS breaks 

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
        setTimeout(function () { dumpPoints() }, 50);
    }

    async function reset() {
        var b = document.getElementById("downloadMesh");
        b.onclick = function () {
            run();
        };
        b.setAttribute("value", "Download");
    }

    async function dumpPoints() {

        const imgs = imgCollection.getLayers(); // image
        const layer = drawnItems.getLayers(); // polygons
        const origin = originCollection.getLayers();

        if (origin.length < 1) {
            alert("No origin defined");
            reset();
            return;
        }
        var b = document.getElementById("downloadMesh");
        b.setAttribute('value', "Processing...");
        b.onclick = ''; // 


        var polyAsPoints = new Array();
        var shape;
        layer.forEach(function (curr) {
            if (curr instanceof L.Polygon) {
                shape = curr.getLatLngs();
            }
        });
        if (shape) { // is there a polygon?
            // we're only interested in the first poly. make it into a format that earcut can understand.
            for (var i = 0; i < shape[0].length; i++) {
                var point = shape[0][i].lat;
                polyAsPoints.push(point);
                point = shape[0][i].lng;
                polyAsPoints.push(point);
            }
            var tris = earcut(polyAsPoints); // take those points and make a vert index for triangles.
            const output = tris.map(i => shape[0][i]);   // remap the points into list of tris
            genMesh(output); // just delay to let the dom update; set the label.
        }
        // fallback to just using the bounds of a loaded image.
        else if (imgs.length > 0) {
            const corners = imgs[0].getCorners();
            var tris = [ // convert image to 2 tris
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


    async function genMesh(pointsToMesh) { // takes tris that make up bounds in array of latlng 

        const bounds = L.latLngBounds(pointsToMesh);
        const distance = bounds.getNorthWest().distanceTo(bounds.getNorthEast()); // see how big the image is
        const metresAtZeroZoom = 40075015.68; // tile size 256 * px/m at zoom 0
        var meshZoom = Math.floor(Math.abs(Math.log2(distance / metresAtZeroZoom)));  // zoom level to fit image well
        if (meshZoom > 15) meshZoom = 15;  // clamp to maximum resolution of data
        // find the first tile that contains the image 
        var err = 0.1;
        e = document.getElementById("res");
        res = e.options[e.selectedIndex].value;
        if (res == "vl") err = 0.75;
        if (res == "l") err = 0.5;
        if (res == "m") err = 0.2;

        // do nowt for high res

        const tLatLng = latlng2tile(bounds.getNorthWest(), meshZoom);

        //const MAPBOX_KEY = "pk.eyJ1IjoibWVkZ29vcm9vIiwiYSI6ImNrbTZ1eTViaTBydmoycW42aDRjbm9ubWgifQ.GpEjpbJYDHzK4lXHo_Mu9A";
        const MAPBOX_KEY = "pk.eyJ1IjoibWVkZ29vcm9vIiwiYSI6ImNrbTZ6N2dndjB0M2Eydm54bndleHJyM2QifQ.EJ7oCU3OavcIK4iNHNtcgA";
        const elevImage = await getRegion(tLatLng.tLat, tLatLng.tLng, meshZoom, `https://api.mapbox.com/v4/mapbox.terrain-rgb/zoom/tLong/tLat.pngraw?access_token=${MAPBOX_KEY}`);
        const canvas = document.createElement("canvas");

        //const canvas = document.getElementById('elevCanvas');
        ctx = canvas.getContext("2d");
        canvas.width = 3 * 256;
        canvas.height = 3 * 256;
        const elevSize = elevImage.width; // meshes must be square

        ctx.drawImage(elevImage, 0, 0); // need to draw this for the data to be grabbed from canvas. 
        var imageData = ctx.getImageData(0, 0, elevSize, elevSize);//image.data;  seemingly we need to write to a canvas then read it back agin.

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

        // Draw the calculated elev image // We don't really need to do this.
        var imgData = ctx.createImageData(elevSize, elevSize);

        // ctx.putImageData(imgData, 0, 0);

        // expand elev with arbitrary size to 2^n  + 1
        const paddedSize = 1 + Math.pow(2, Math.ceil(Math.log(elevSize) / Math.log(2)));
        //     console.log(paddedSize);
        const paddedElev = new Float32Array(paddedSize * paddedSize);
        for (var x = 0; x < paddedSize; x++) { // pad the right and bottom
            for (var y = 0; y < paddedSize; y++) {
                if ((x < elevSize) && (y < elevSize))
                    paddedElev[x * paddedSize + y] = elev[x * elevSize + y];
                else paddedElev[x * paddedSize + y] = 0; // this makes a rough discontinuity. 
            }
        }

        // https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Resolution_and_Scale
        const lat = bounds.getNorthWest().lat;
        const crs = L.CRS.EPSG3857;
        const meshCorner = tLatLng2LatLng(tLatLng, meshZoom); // again in lat lng

        var pointsToMeshReferenced = new Array(pointsToMesh.length * 2);
        const meshOrig = crs.latLngToPoint(meshCorner, meshZoom);
        // convert points from lat lng to image coords, referenced to mesh origin. also make into flat array
        for (var i = 0; i < pointsToMesh.length; i++) {
            var pt = crs.latLngToPoint(pointsToMesh[i], meshZoom);
            pointsToMeshReferenced[i * 2] = pt.x - meshOrig.x;
            pointsToMeshReferenced[(i * 2) + 1] = pt.y - meshOrig.y;
        }
        //         console.log("pointsToMeshReferenced: " + pointsToMeshReferenced);

        //
        const martini = new Martini(paddedSize);
        const tile = martini.createTile(paddedElev);
        const mesh = tile.getBoundedMesh(err, pointsToMeshReferenced);

        // draw a mesh
        // for (var i = 0; i < mesh.triangles.length; i = i + 3) {

        //     ctx.beginPath();
        //     ax = mesh.vertices[mesh.triangles[i] * 3];
        //     ay = mesh.vertices[(mesh.triangles[i] * 3) + 1];
        //     bx = mesh.vertices[mesh.triangles[i + 1] * 3];
        //     by = mesh.vertices[(mesh.triangles[i + 1] * 3) + 1];
        //     cx = mesh.vertices[mesh.triangles[i + 2] * 3];
        //     cy = mesh.vertices[(mesh.triangles[i + 2] * 3) + 1];
        //     ctx.moveTo(ax, ay);
        //     ctx.lineTo(bx, by);
        //     ctx.lineTo(cx, cy);
        //     ctx.lineTo(ax, ay);
        //     ctx.strokeStyle = "#FF0000";
        //     ctx.lineWidth = 0.5;
        //     ctx.stroke();

        // }

        //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // figure the center of the user defined origin image
        const userOrigin = originCollection.getLayers()
        const userOriginCenter = userOrigin[0].getCenter()
        // move it to pixel coords
        const userOriginCenterPt = crs.latLngToPoint(userOriginCenter, meshZoom);
        userOriginCenterPt.x -= meshOrig.x;
        userOriginCenterPt.y -= meshOrig.y;
        // get height at the user origin point
        const heightAtUserOrigin = elev[Math.floor(userOriginCenterPt.y) * elevSize + Math.floor(userOriginCenterPt.x)];
        // shift everything to use new origin
        for (var i = 0; i < mesh.vertices.length; i = i + 3) { // 
            mesh.vertices[i] = userOriginCenterPt.x - mesh.vertices[i]; // x // flip it 
            mesh.vertices[i + 1] = userOriginCenterPt.y - mesh.vertices[i + 1];  // y 
            mesh.vertices[i + 2] = heightAtUserOrigin - mesh.vertices[i + 2]; // z
        }
        // rotate about this origin 
        const angle = -1 * userOrigin[0].getAngle('rad');
        for (var i = 0; i < mesh.vertices.length; i = i + 3) { // 
            const x = mesh.vertices[i];
            const y = mesh.vertices[i + 1];
            mesh.vertices[i] = (x * Math.cos(angle)) - (y * Math.sin(angle)); // x 
            mesh.vertices[i + 1] = (x * Math.sin(angle)) + (y * Math.cos(angle)); // y 
        }
        //  At zoom 0, one pixel would equal 156543.03 meters (assuming a tile size of 256 px):
        const mtrsPerPix = (156543.03 * Math.cos(Math.PI / 180 * lat) / (Math.pow(2, meshZoom)));
        // x and y are in pix. z is in metres
        for (var i = 0; i < mesh.vertices.length; i = i + 3) {
            // invert x and z to switch LH to RH coords, and scale.
            mesh.vertices[i] = -1 * mesh.vertices[i] * mtrsPerPix;
            mesh.vertices[i + 1] = mesh.vertices[i + 1] * mtrsPerPix;
            mesh.vertices[i + 2] = -1 * mesh.vertices[i + 2];
        }
        //const tBox = document.createElement("textarea");

        var e = document.getElementById("filetype");
        var fType = e.options[e.selectedIndex].value;
        if (fType == "obj") writeObj(mesh);
        if (fType == "dbacv") writeArrayCalc(mesh);
        if (fType == "txt") writeSoundVision(mesh);
        if (fType == "dae") writeCollada(mesh);
        if (fType == "bprint") writeBlueprint(mesh);
        if (fType == "mappDef") writeMapp(mesh, 0);
        if (fType == "mappUpload") writeMapp(mesh, 1);
        reset();
    }

 


    async function getRegion(tLat, tLong, zoom, api) { // gets the tiles immediately east,south and south east
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
        //    console.log("mesh tile: " + aTLatLng.tLat + " " + aTLatLng.tLng);
        lng = (aTLatLng.tLng / Math.pow(2, z) * 360 - 180);
        var n = Math.PI - 2 * Math.PI * aTLatLng.tLat / Math.pow(2, z);
        lat = (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
        return {
            lat,
            lng
        };
    }

    function latlng2tile(aLatLng, zoom) {
        const tLng = Math.floor(((aLatLng.lng + 180) / 360) * Math.pow(2, zoom)); // WRONG?
        const tLat = Math.floor(
            ((1 -
                Math.log(
                    Math.tan((aLatLng.lat * Math.PI) / 180) + 1 / Math.cos((aLatLng.lat * Math.PI) / 180)
                ) /
                Math.PI) /
                2) *
            Math.pow(2, zoom)
        );
        return {
            tLat,
            tLng
        };
    }

    function loadImage(url) {
        //    console.log(`Downloading ${url}...`);
        return new Promise((accept, error) => {
            const img = new Image();
            img.onload = () => {
                accept(img);
            };
            img.onerror = error;
            img.crossOrigin = "anonymous";
            img.src = url;
        });
    }
}