function genGUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}


function writeMappXML(mesh, listenHeight = 0) {
    var doc = document.implementation.createDocument("", "", null);
    var main = doc.createElement("Geometries");

    var triCount = 0;

    for (var i = 0; i < mesh.triangles.length; i = i + 3) {
        var geom = doc.createElement("Geometry");
        main.appendChild(geom);

        // This took me way too long to figure out.
        // X, Y, Z here need to be the midpoint of the bounding box of the tri.
        // PX, PY, PZ seem to be the user defined point, any vertex or the aforementioned mid point. Doesn't seem to matter to us.
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
            layerName: "Layer 0",
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

    var xmlText = new XMLSerializer().serializeToString(main);
    xmlText = '<?xml version="1.0" encoding="UTF-8"?>' + xmlText;
    var blob = new Blob([xmlText], {
        type: "application/xml;charset=utf-8;"
    });

    var zip = new JSZip();
    zip.file("geometry.xml", blob);

    zip.generateAsync({ type: "blob" })
        .then(function (content) {
            // see FileSaver.js
            saveAs(content, "mesh.mapp");
        });


    const blobURL = window.URL.createObjectURL(blob);
}


function xmlTest() {
    console.log("xmlTest");
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function () {
        if (this.readyState == 4 && this.status == 200) {
            var data = xhttp.responseXML;
            console.log("got loudpeakers?");
        }
    };
    xhttp.open("GET", "mapp/loudspeaker.xml", true);
    xhttp.send();
}