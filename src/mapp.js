import JSZip from 'jszip';
import { saveAs } from './export.js';

function genGUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function fileObjFromName(obj, value) {
    return obj.find(function (v) {
        return v["name"] === value;
    });
}

function indexFromName(obj, value) {
    return obj.findIndex(function (element) {
        return element.name == value;
    });
}

async function readZipEntries(zip) {
    const fileList = [];
    zip.forEach(function (path, entry) {
        fileList.push(entry.name);
    });
    const fileData = await Promise.all(fileList.map(name => zip.file(name).async("string")));
    return fileList.map((name, index) => ({ name, data: fileData[index] }));
}

async function getDefaultFiles(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    return readZipEntries(zip);
}

async function getUserFiles() {
    const fileSelector = document.createElement('input');
    fileSelector.id = 'userFileInput';
    fileSelector.setAttribute('type', 'file');
    fileSelector.setAttribute('display', 'none');
    const popupClosed = new Promise((resolve) => {
        fileSelector.addEventListener('change', (event) => {
            resolve(event.target.files[0]);
        });
    });
    fileSelector.click();
    const file = await popupClosed;
    const zip = await JSZip.loadAsync(file);
    return readZipEntries(zip);
}


export async function writeMapp(mesh, userMapp, listenHeight = 0) {
    let mappFiles;
    if (userMapp == 0) {
        mappFiles = await getDefaultFiles("mapp/default.mapp");
    } else {
        mappFiles = await getUserFiles();
    }

    var bounds = getBoundingBox(mesh);

    // Update project.xml
    var projectFile = fileObjFromName(mappFiles, "project.xml");
    var parser = new DOMParser();
    var projectFileXML = parser.parseFromString(projectFile.data, "text/xml");
    // update Bounds. Need bonus +/-2 for mapp3ds meshing to not get sad.
    if (projectFileXML.getElementsByTagName("xMin")[0].textContent > bounds.xMin) {
        projectFileXML.getElementsByTagName("xMin")[0].textContent = bounds.xMin - 2;
    }
    if (projectFileXML.getElementsByTagName("xMax")[0].textContent < bounds.xMax) {
        projectFileXML.getElementsByTagName("xMax")[0].textContent = bounds.xMax + 2;
    }
    if (projectFileXML.getElementsByTagName("yMin")[0].textContent > bounds.yMin) {
        projectFileXML.getElementsByTagName("yMin")[0].textContent = bounds.yMin - 2;
    }
    if (projectFileXML.getElementsByTagName("yMax")[0].textContent < bounds.yMax) {
        projectFileXML.getElementsByTagName("yMax")[0].textContent = bounds.yMax + 2;
    }
    if (projectFileXML.getElementsByTagName("zMin")[0].textContent > bounds.zMin) {
        projectFileXML.getElementsByTagName("zMin")[0].textContent = bounds.zMin - 2;
    }
    if (projectFileXML.getElementsByTagName("zMax")[0].textContent < bounds.zMax) {
        projectFileXML.getElementsByTagName("zMax")[0].textContent = bounds.zMax + 2;
    }
    projectFileXML.getElementsByTagName("distanceUnit")[0].textContent = "Meters";

    // default to a lower resolution
    projectFileXML.getElementsByTagName("sizeOfTriangle")[0].textContent = "1.6";

    // create a new layer
    const layerElements = {
        layergUID: "{" + genGUID() + "}",
        layerName: "groundMesh",
        visible: "true",
        locked: "true",
        colorRed: "0",
        colorGreen: "1",
        colorBlue: "0",
        colorAlpha: "1",
        colorIndex: "1",
        layerIndex: "1",
        colorRedInactive: "0.2",
        colorGreenInactive: "0.2",
        colorBlueInactive: "0.2",
        colorAlphaInactive: "1"
    };
    var newLayer = projectFileXML.createElement("layer");
    projectFileXML.getElementsByTagName("layers")[0].appendChild(newLayer);

    for (const [key, value] of Object.entries(layerElements)) {
        var el = projectFileXML.createElement(key);
        el.textContent = value;
        newLayer.appendChild(el);
    }

    mappFiles[indexFromName(mappFiles, "project.xml")].data = new XMLSerializer().serializeToString(projectFileXML);


    // add the geometry to the file list
    var geomFile = {
        name: "geometry.xml",
        data: genGeom(mesh, listenHeight)
    };
    mappFiles.push(geomFile);

    // zip it all back up and save it.
    var resultZip = new JSZip();
    mappFiles.forEach(function (val, index) {
        var blob = new Blob([mappFiles[index].data], {
            type: "application/xml;charset=utf-8;"
        });
        resultZip.file(mappFiles[index].name, blob);
    });
    var zipFile = await resultZip.generateAsync({ type: "blob" });
    saveAs(zipFile, "mesh.mapp");
}


export function getBoundingBox(mesh) {
    var res = {
        xMin: 0,
        xMax: 0,
        yMin: 0,
        yMax: 0,
        zMin: 0,
        zMax: 0
    };
    for (var i = 0; i < mesh.vertices.length; i = i + 3) {
        var x = mesh.vertices[i];
        var y = mesh.vertices[i + 1];
        var z = mesh.vertices[i + 2];
        if (x > res.xMax) res.xMax = Math.ceil(x);
        if (x < res.xMin) res.xMin = Math.floor(x);
        if (y > res.yMax) res.yMax = Math.ceil(y);
        if (y < res.yMin) res.yMin = Math.floor(y);
        if (z > res.zMax) res.zMax = Math.ceil(z);
        if (z < res.zMin) res.zMin = Math.floor(z);
    }
    return res;
}

function genGeom(mesh, listenHeight = 0) {
    var doc = document.implementation.createDocument("", "", null);
    var main = doc.createElement("Geometries");

    var triCount = 0;
    for (var i = 0; i < mesh.triangles.length; i = i + 3) {
        var geom = doc.createElement("Geometry");
        main.appendChild(geom);

        // X, Y, Z here need to be the midpoint of the bounding box of the tri.
        // PX, PY, PZ seem to be the user defined point. Doesn't seem to matter to us.
        // Points within an element e.g. FreeDrawPoints can be referenced to the real origin, however it seems internally
        // the midpoint is calculated, the points are rereferenced to that and then offset by the XYZ mentioned before.
        // Use the absolute coords, but set the midpoint coords as well.

        var ax = mesh.vertices[mesh.triangles[i] * 3];
        var ay = mesh.vertices[mesh.triangles[i] * 3 + 1];
        var az = mesh.vertices[mesh.triangles[i] * 3 + 2];
        var bx = mesh.vertices[mesh.triangles[i + 1] * 3];
        var by = mesh.vertices[mesh.triangles[i + 1] * 3 + 1];
        var bz = mesh.vertices[mesh.triangles[i + 1] * 3 + 2];
        var cx = mesh.vertices[mesh.triangles[i + 2] * 3];
        var cy = mesh.vertices[mesh.triangles[i + 2] * 3 + 1];
        var cz = mesh.vertices[mesh.triangles[i + 2] * 3 + 2];

        var xRange = [ax, bx, cx];
        xRange.sort(function (a, b) { return a - b; });
        var yRange = [ay, by, cy];
        yRange.sort(function (a, b) { return a - b; });
        var zRange = [az, bz, cz];
        zRange.sort(function (a, b) { return a - b; });

        const defaultElements = {
            gUID: "{" + genGUID() + "}",
            objectName: "MeshTri " + triCount,
            layerName: "groundMesh",
            isOffset: 'false',
            isGrouped: 'false',
            isMultiLevelVA: 'false',
            objectType: '23',
            colorIndex: '1',
            primitiveType: 'freeDrawObject',
            dimension: '2D',
            x: ((xRange[0] + xRange[2]) / 2).toFixed(4),
            y: ((yRange[0] + yRange[2]) / 2).toFixed(4),
            z: ((zRange[0] + zRange[2]) / 2).toFixed(4),
            rotX: 0,
            rotY: 0,
            rotZ: 0,
            length: 1,
            width: 1,
            height: 1,
            depth: 1,
            radius: 1,
            rearWidth: 1,
            totalAngle: 0,
            px: ((xRange[0] + xRange[2]) / 2).toFixed(4),
            py: ((yRange[0] + yRange[2]) / 2).toFixed(4),
            pz: ((zRange[0] + zRange[2]) / 2).toFixed(4),
            refPointId: -1,
            numberoffaces: 1,
            isMeshed: 0,
            FacePredictionOffset0: listenHeight,
            FacePredictionState0: 1,
            FaceThroughState0: 0,
            FaceReflectiveState0: 0,
            PartialPredictionState0: 0,
            PartialThroughState0: 0,
            PartialReflectiveState0: 0,
            FaceName0: "Face 1"
        };

        for (const [key, value] of Object.entries(defaultElements)) {
            var el = doc.createElement(key);
            el.textContent = value;
            geom.appendChild(el);
        }
        var el = doc.createElement("FreeDrawPoints");
        el.setAttribute("PointsCount", "3");
        el.setAttribute("IsClosed", "true");
        var pt = doc.createElement("Point");
        pt.setAttribute("X", ax.toFixed(4));
        pt.setAttribute("Y", ay.toFixed(4));
        pt.setAttribute("Z", az.toFixed(4));
        el.appendChild(pt);
        pt = doc.createElement("Point");
        pt.setAttribute("X", bx.toFixed(4));
        pt.setAttribute("Y", by.toFixed(4));
        pt.setAttribute("Z", bz.toFixed(4));
        el.appendChild(pt);
        pt = doc.createElement("Point");
        pt.setAttribute("X", cx.toFixed(4));
        pt.setAttribute("Y", cy.toFixed(4));
        pt.setAttribute("Z", cz.toFixed(4));
        el.appendChild(pt);
        geom.appendChild(el);
        triCount++;
    }
    return (new XMLSerializer().serializeToString(main));
}
