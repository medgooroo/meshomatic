function genGUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function unzipFile(fileName, zip) {
    return new Promise(async (resolve, reject) => {
        resolve(zip.file(fileName).async("string"));
    })
}
function fileObjFromName(obj, value) {
    return obj.find(function (v) {
        return v["name"] === value
    });
}
function indexFromName(obj, value) {
    return obj.findIndex(function (element) {
        return element.name == value;
    });
}

async function getDefaultFiles(userMapp) {
    var zip;
    if (userMapp === undefined) {
    let data = await JSZipUtils.getBinaryContent('mapp/default.mapp');
    zip = await JSZip.loadAsync(data);
    }
    else {
        zip = await JSZipUtils.loadAsync(userMapp);
    }
    var fileList = [];
    zip.forEach(function (path, entry) {
        fileList.push(entry.name);
    });
    // the goggles... they do nothing?
    let fileData = await Promise.all(fileList.map(async fileName => await unzipFile(fileName, zip)));
    filesAndXML = [];
    fileList.forEach(function (val, index) {
        var aFile = {
            name: fileList[index],
            data: fileData[index]
        };
        filesAndXML.push(aFile);
    });
    return (filesAndXML);
}

async function writeMapp(mesh, userMapp, listenHeight = 0) {
    let mappFiles = await getDefaultFiles(userMapp); // wait until the promise resolves (*)
    // or mappFiles = user Uploaded files
    //console.log(mappFiles);
    //////////////
    var fileObj = fileObjFromName(mappFiles, "loudspeaker.xml");
    var parser = new DOMParser();
    var xmlDoc = parser.parseFromString(fileObj.data, "text/xml"); // read the xml text
    var el = xmlDoc.createElement("testEl");
    xmlDoc.getElementsByTagName("Loudspeakers")[0].appendChild(el);
    fileObj.data = new XMLSerializer().serializeToString(xmlDoc); // write the xml back to text
    //////////////
    // Update project.xml
    var bounds = getBoundingBox(mesh);

    var projectFile = fileObjFromName(mappFiles, "project.xml");
    parser = new DOMParser();
    var projectFileXML = parser.parseFromString(projectFile.data, "text/xml");
    // update Bounds. Need bonus +/-2 for mapp3ds meshing to not get sad.

    projectFileXML.getElementsByTagName("xMin")[0].textContent = bounds.xMin - 2;
    projectFileXML.getElementsByTagName("xMax")[0].textContent = bounds.xMax + 2;
    projectFileXML.getElementsByTagName("yMin")[0].textContent = bounds.yMin - 2;
    projectFileXML.getElementsByTagName("yMax")[0].textContent = bounds.yMax + 2;
    projectFileXML.getElementsByTagName("zMin")[0].textContent = bounds.zMin - 2;
    projectFileXML.getElementsByTagName("zMax")[0].textContent = bounds.zMax + 2;
    
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
        layerIndex: "1", // hmmm
        colorRedInactive: "0.2",
        colorGreenInactive: "0.2",
        colorBlueInactive: "0.2",
        colorAlphaInactive: "1"
    }
    var newLayer = xmlDoc.createElement("layer");
    projectFileXML.getElementsByTagName("layers")[0].appendChild(newLayer);

    for (const [key, value] of Object.entries(layerElements)) {
        var el = xmlDoc.createElement(key);
        el.textContent = value;
        newLayer.appendChild(el);
    }

    mappFiles[indexFromName(mappFiles, "project.xml")].data = new XMLSerializer().serializeToString(projectFileXML); // write the xml back to text


    // add the geometry to the file list
    var geomFile = {
        name: "geometry.xml",
        data: genGeom(mesh, listenHeight)
    };
    mappFiles.push(geomFile);

    // zip it all back up and save it.
    var resultZip = new JSZip();
    mappFiles.forEach(function (val, index) { // zip em back up
        var blob = new Blob([mappFiles[index].data], {
            type: "application/xml;charset=utf-8;"
        });
        resultZip.file(mappFiles[index].name, blob)
    });
    var zipFile = await resultZip.generateAsync({ type: "blob" })
    saveAs(zipFile, "mesh.mapp"); // will be mapp. zip for debug
}


function getBoundingBox(mesh) {
    var res = {
        xMin: 0,
        xMax: 0,
        yMin: 0,
        yMax: 0,
        zMin: 0,
        zMax: 0
    }
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

function genGeom(mesh, listenHeight = 0) { // returns xml document  - TODO make this add to an existing file ?
    var doc = document.implementation.createDocument("", "", null);
    var main = doc.createElement("Geometries");

    var triCount = 0;
    for (var i = 0; i < mesh.triangles.length; i = i + 3) {
        var geom = doc.createElement("Geometry");
        main.appendChild(geom);

        // This took me way too long to figure out.
        // X, Y, Z here need to be the midpoint of the bounding box of the tri.
        // PX, PY, PZ seem to be the user defined point. i.e. any vertex or the aforementioned mid point. Doesn't seem to matter to us.
        // Points within an element e.g. FreeDrawPoints can be referenced to the real origin, however it seems internally the midpoint is calculated,
        // the points are rereferenced to that and then offset by the XYZ mentioned before. 
        // accordingly we'll just use the absolute coords, but set the midpoint coords as well.

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
        xRange.sort(function (a, b) { return a - b });
        var yRange = [ay, by, cy];
        yRange.sort(function (a, b) { return a - b });
        var zRange = [az, bz, cz];
        zRange.sort(function (a, b) { return a - b });

        const defaultElements = {
            gUID: "{" + genGUID() + "}",
            objectName: "MeshTri " + triCount,
            // layerName: "Layer 0",
            layerName: "groundMesh",
            isOffset: 'false',
            isGrouped: 'false',
            isMultiLevelVA: 'false',
            objectType: '23', // mysteries.
            colorIndex: '1',
            primitiveType: 'freeDrawObject', // hmm tris are possible?
            dimension: '2D', // 3D primitives aren't for us.
            x: ((xRange[0] + xRange[2]) / 2).toFixed(4), // midpoint of bounding box
            y: ((yRange[0] + yRange[2]) / 2).toFixed(4),
            z: ((zRange[0] + zRange[2]) / 2).toFixed(4),
            rotX: 0,
            rotY: 0,
            rotZ: 0,
            length: 1, // stack of properties for other primitives
            width: 1,
            height: 1,
            depth: 1,
            radius: 1,
            rearWidth: 1,
            totalAngle: 0,
            px: ((xRange[0] + xRange[2]) / 2).toFixed(4), // midpoint of bounding box
            py: ((yRange[0] + yRange[2]) / 2).toFixed(4),
            pz: ((zRange[0] + zRange[2]) / 2).toFixed(4),
            refPointId: -1, // zero indexed reference to points listed, seems redundant?  -1 indicates center
            // px: ax, // midpoint of bounding box
            // py: ay,
            // pz: az,
            // refPointId: 0, // zero indexed reference to points listed, seems redundant?  -1 indicates center
            // numberoftriangles: 0, // camel case disappears for a bit?
            numberoffaces: 1,
            isMeshed: 0, // possibly related to the {guid}.vtk files produced
            FacePredictionOffset0: listenHeight, // initial letter capitalisation now... perhaps this is the stuff actually passed to simulation?
            FacePredictionState0: 1, // turn on prediction
            FaceThroughState0: 0, // its the floor, lets not project lines through it.
            FaceReflectiveState0: 0, // this doesn't seem to be user visible - interesting?
            PartialPredictionState0: 0, // ?
            PartialThroughState0: 0, // hm?
            PartialReflectiveState0: 0,
            FaceName0: "Face 1" // yup, everything is face 1?
        }

        for (const [key, value] of Object.entries(defaultElements)) {
            var el = doc.createElement(key);
            el.textContent = value;
            geom.appendChild(el);
        }
        var el = doc.createElement("FreeDrawPoints");
        el.setAttribute("PointsCount", "3"); // in tris we trust.
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
    return (new XMLSerializer().serializeToString(main)); // write the xml back to text

}

