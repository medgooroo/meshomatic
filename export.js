function writeSoundVision(mesh) {
    var objText = `"; Exported by meshomatic thing"
"; "
";   using Outside is front (white)"
";   using Name By Layer"
";   using Visible Entities"
";"
";"
";"
"; LengthUnit", "m"
";"`
    var triCount = 0;
    for (var i = 0; i < mesh.triangles.length; i = i + 3) {
        objText += '\n"Label","Layer0 ' + "triCount01" + '"\n';
        // sound vision likes em wound this way.
        objText += mesh.vertices[mesh.triangles[i] * 3] + "," + mesh.vertices[mesh.triangles[i] * 3 + 1] + "," + mesh.vertices[mesh.triangles[i] * 3 + 2] + "\n";
        objText += mesh.vertices[mesh.triangles[i + 2] * 3] + "," + mesh.vertices[mesh.triangles[i + 2] * 3 + 1] + "," + mesh.vertices[mesh.triangles[i + 2] * 3 + 2] + "\n"; 
        objText += mesh.vertices[mesh.triangles[i + 1] * 3] + "," + mesh.vertices[mesh.triangles[i + 1] * 3 + 1] + "," + mesh.vertices[mesh.triangles[i + 1] * 3 + 2] + "\n";
        objText += '";"';
        triCount++;
    }
    var blob = new Blob([objText], {
        type: "text/plain;charset=utf-8;"
    });
    saveAs(blob, "mesh.txt");
}

function writeBlueprint(mesh) {
    var objText = "";
    for (var i = 0; i < 8; i++) objText += '";"\n';
    objText += '"; LengthUnit","m"\n";"\n';

    var triCount = 0;
    for (var i = 0; i < mesh.triangles.length; i = i + 3) {
        objText += '"Label","ground mesh (' + triCount + ')"\n';
        objText += mesh.vertices[mesh.triangles[i] * 3] + "," + mesh.vertices[mesh.triangles[i] * 3 + 1] + "," + mesh.vertices[mesh.triangles[i] * 3 + 2] + "\n";
        objText += mesh.vertices[mesh.triangles[i + 1] * 3] + "," + mesh.vertices[mesh.triangles[i + 1] * 3 + 1] + "," + mesh.vertices[mesh.triangles[i + 1] * 3 + 2] + "\n";
        objText += mesh.vertices[mesh.triangles[i + 2] * 3] + "," + mesh.vertices[mesh.triangles[i + 2] * 3 + 1] + "," + mesh.vertices[mesh.triangles[i + 2] * 3 + 2] + "\n";
        objText += mesh.vertices[mesh.triangles[i] * 3] + "," + mesh.vertices[mesh.triangles[i] * 3 + 1] + "," + mesh.vertices[mesh.triangles[i] * 3 + 2] + "\n"; // if it smells like a quad...
        objText += '";"\n';
        triCount++;
    }
    var blob = new Blob([objText], {
        type: "text/plain;charset=utf-8;"
    });
    const blobURL = window.URL.createObjectURL(blob);

    const tempLink = document.createElement('a');
    tempLink.style.display = 'none';
    tempLink.href = blobURL;
    tempLink.setAttribute('download', 'mesh.xar');
    // Safari thinks _blank anchor are pop ups. We only want to set _blank
    // target if the browser does not support the HTML5 download attribute.
    // This allows you to download files in desktop safari if pop up blocking
    // is enabled.
    if (typeof tempLink.download === 'undefined') {
        tempLink.setAttribute('target', '_blank');
    }
    document.body.appendChild(tempLink);
    tempLink.click();
    document.body.removeChild(tempLink);
    setTimeout(() => {
        // For Firefox it is necessary to delay revoking the ObjectURL
        window.URL.revokeObjectURL(blobURL);
    }, 100);
}

function writeObj(mesh) {
    // https://en.wikipedia.org/wiki/Wavefront_.obj_file - NOT ZERO INDEXED.
    var objText = "";
    for (var i = 0; i < mesh.vertices.length; i = i + 3) {
        objText += "v " + mesh.vertices[i] + " " + mesh.vertices[i + 1] + " " + mesh.vertices[i + 2] + "\n";
    }
    for (var i = 0; i < mesh.triangles.length; i = i + 3) {
        objText += "f " + (mesh.triangles[i] + 1) + " " + (mesh.triangles[i + 1] + 1) + " " + (mesh.triangles[i + 2] + 1) + "\n";
    }
    var blob = new Blob([objText], {
        type: "text/plain;charset=utf-8;"
    });
    saveAs(blob, "mesh.obj");
}

function writeArrayCalc(mesh) {

    var doc = document.implementation.createDocument("", "", null);
    var main = doc.createElement("ArrayCalc");
    main.setAttribute("Version", "10.10.1");

    var project = doc.createElement("Project");
    project.setAttribute("Name", "Meshomatic");

    var el = doc.createElement("Date");
    var d = new Date();
    el.textContent = d.toLocaleDateString();
    project.appendChild(el);

    el = doc.createElement("Author");
    el.textContent = "User";
    project.appendChild(el);

    el = doc.createElement("Comments");
    el.textContent = "Mesh generated with meshomatic thing."
    project.appendChild(el);
    main.appendChild(project);

    var venue = doc.createElement("Venue");
    venue.setAttribute("Version", "9"); // sure. 9 sounds good.
    main.appendChild(venue);
    var roomObjectGroup = doc.createElement("RoomObject");
    roomObjectGroup.setAttribute("ObjectGroup", "true");
    roomObjectGroup.setAttribute("Shape", "5"); // who knows?
    roomObjectGroup.setAttribute("PlaneType", "1"); // ^^
    roomObjectGroup.setAttribute("RoomObjectGroup", "87af7277-542d-4d11-9fcb-d2362c26409f1"); // hopefully not a hash that makes it barf
    roomObjectGroup.setAttribute("Enabled", "1"); //
    roomObjectGroup.setAttribute("Transparent", "1"); //
    roomObjectGroup.setAttribute("Locked", "0"); // 
    roomObjectGroup.setAttribute("ListenerHeight", "1.7"); //  make this an option?
    roomObjectGroup.setAttribute("Color", "4294967295"); // needs a u.
    roomObjectGroup.setAttribute("PrintColor", "4294945280"); // ^
    roomObjectGroup.setAttribute("ParentVenueObjectId", "0"); // 
    roomObjectGroup.setAttribute("OrderIndex", "4"); // F O U R 
    venue.appendChild(roomObjectGroup);
    ////////////////////////////////////////////////////////////////////// 

    var triCount = 0;
    for (var i = 0; i < mesh.triangles.length; i = i + 3) {
        var roomObject = doc.createElement("RoomObject");
        roomObject.setAttribute("Shape", "6"); // like 5, but one more.
        roomObject.setAttribute("PlaneType", "1");
        roomObject.setAttribute("Name", "Layer" + triCount);
        roomObject.setAttribute("Enabled", "1");
        roomObject.setAttribute("Transparent", "1");
        roomObject.setAttribute("Locked", "0");
        roomObject.setAttribute("ListenerHeight", "1.7");
        roomObject.setAttribute("Color", "4294923348"); // needs a u.
        roomObject.setAttribute("PrintColor", "4294945280"); // ^
        roomObject.setAttribute("ParentVenueObjectId", "1001"); // 
        roomObject.setAttribute("OrderIndex", triCount); // this ruins things?
        el = doc.createElement("Origin");
        el.setAttribute("x", 0);
        el.setAttribute("y", 0);
        el.setAttribute("z", 0);
        roomObject.appendChild(el);
        el = doc.createElement("Rotation");
        roomObject.appendChild(el);
        el = doc.createElement("Scaling");
        el.setAttribute("x", "1");
        el.setAttribute("y", "1");
        el.setAttribute("z", "1");
        roomObject.appendChild(el);
        el = doc.createElement("P1");
        el.setAttribute("y", mesh.vertices[mesh.triangles[i] * 3]);
        el.setAttribute("x", mesh.vertices[mesh.triangles[i] * 3 + 1]);
        el.setAttribute("z", mesh.vertices[mesh.triangles[i] * 3 + 2]);
        roomObject.appendChild(el);
        el = doc.createElement("P2");
        el.setAttribute("y", mesh.vertices[mesh.triangles[i + 1] * 3]);
        el.setAttribute("x", mesh.vertices[mesh.triangles[i + 1] * 3 + 1]);
        el.setAttribute("z", mesh.vertices[mesh.triangles[i + 1] * 3 + 2]);
        roomObject.appendChild(el);
        el = doc.createElement("P3");
        el.setAttribute("y", mesh.vertices[mesh.triangles[i + 2] * 3]);
        el.setAttribute("x", mesh.vertices[mesh.triangles[i + 2] * 3 + 1]);
        el.setAttribute("z", mesh.vertices[mesh.triangles[i + 2] * 3 + 2]);
        roomObject.appendChild(el);
        /////////////////////////////////
        roomObjectGroup.appendChild(roomObject);
        triCount++;
    }

    //objText += mesh.vertices[mesh.triangles[i] * 3] + "," + mesh.vertices[mesh.triangles[i] * 3 + 1] + "," + mesh.vertices[mesh.triangles[i] * 3 + 2] + "\n";
    //objText += mesh.vertices[mesh.triangles[i + 1] * 3] + "," + mesh.vertices[mesh.triangles[i + 1] * 3 + 1] + "," + mesh.vertices[mesh.triangles[i + 1] * 3 + 2] + "\n";
    //objText += mesh.vertices[mesh.triangles[i + 2] * 3] + "," + mesh.vertices[mesh.triangles[i + 2] * 3 + 1] + "," + mesh.vertices[mesh.triangles[i + 2] * 3 + 2] + "\n";

    el = doc.createElement("Origin");
    el.setAttribute("x", 0);
    el.setAttribute("y", 0);
    el.setAttribute("z", 0);
    roomObjectGroup.appendChild(el);
    el = doc.createElement("Rotation");
    roomObjectGroup.appendChild(el);
    el = doc.createElement("Scaling");
    el.setAttribute("x", "1");
    el.setAttribute("y", "1");
    el.setAttribute("z", "1");
    roomObjectGroup.appendChild(el);

    roomObjectGroup.appendChild(roomObject);
    var xmlText = new XMLSerializer().serializeToString(main);
    xmlText = "<!DOCTYPE ArrayCalc>" + xmlText;
    var blob = new Blob([xmlText], {
        type: "application/xml;charset=utf-8;"
    });
    saveAs(blob, "mesh.dbacv");

}

function writeCollada(mesh) {
    // for (var i = 0; i < mesh.vertices.length; i = i + 3) {
    //     //  switch coord system
    //     var x = mesh.vertices[i];
    //     var y = mesh.vertices[i+1];
    //     var z = mesh.vertices[i+2];
    //     mesh.vertices[i] =  z;
    //     mesh.vertices[i + 1] = x;
    //     mesh.vertices[i + 2] =  y;
    // }
    // https://www.codeproject.com/Articles/625701/COLLADA-TinyXML-and-OpenGL
    var doc = document.implementation.createDocument("", "", null);
    var main = doc.createElement("COLLADA");

    var asset = doc.createElement("asset");
    main.appendChild(asset);
    var unit = doc.createElement("unit");
    unit.setAttribute("meter", "1.0");
    unit.setAttribute("name", "meter");
    asset.appendChild(unit);
    var ax = doc.createElement("up_axis");
    ax.textContent = "Z_UP";
    asset.appendChild(ax);

    var lib_geo = doc.createElement("library_geometries");
    main.appendChild(lib_geo);
    var geom = doc.createElement("geometry");
    geom.setAttribute("id", "aLovelyMesh");
    lib_geo.appendChild(geom);
    var meshTag = doc.createElement("mesh");
    geom.appendChild(meshTag);
    var source = doc.createElement("source");
    source.setAttribute("id", "verts");
    source.setAttribute("name", "position");
    meshTag.appendChild(source);

    var floatArray = doc.createElement("float_array");
    floatArray.setAttribute("id", "vertFloats");
    floatArray.setAttribute("count", mesh.vertices.length);
    var floatString = "";
    for (var i = 0; i < mesh.vertices.length; i++) {
        floatString += mesh.vertices[i] + " ";
    }
    floatArray.textContent = floatString;
    source.appendChild(floatArray);

    var technique = doc.createElement("technique_common");
    source.appendChild(technique);
    var accessor = doc.createElement("accessor");
    accessor.setAttribute("count", mesh.vertices.length / 3);
    accessor.setAttribute("offset", "0");
    accessor.setAttribute("source", "#vertFloats");
    accessor.setAttribute("stride", "3");
    technique.appendChild(accessor);

    var param = doc.createElement("param");
    param.setAttribute("name", "X");
    param.setAttribute("type", "float");
    accessor.appendChild(param);

    param = doc.createElement("param");
    param.setAttribute("name", "Y");
    param.setAttribute("type", "float");
    accessor.appendChild(param);

    param = doc.createElement("param");
    param.setAttribute("name", "Z");
    param.setAttribute("type", "float");
    accessor.appendChild(param);


    var verticesTag = doc.createElement("vertices");
    verticesTag.setAttribute("id", "vertices");
    meshTag.appendChild(verticesTag);
    var inputTag = doc.createElement("input");
    inputTag.setAttribute("semantic", "POSITION");
    inputTag.setAttribute("source", "#verts");
    verticesTag.appendChild(inputTag);
    var trianglesTag = doc.createElement("triangles");
    trianglesTag.setAttribute("count", mesh.triangles.length);
    meshTag.appendChild(trianglesTag);
    var triInputTag = doc.createElement("input");
    triInputTag.setAttribute("offset", "0");
    triInputTag.setAttribute("semantic", "VERTEX");
    triInputTag.setAttribute("source", "#vertices");
    trianglesTag.appendChild(triInputTag);
    var pTag = doc.createElement("p");
    var pStr = "";
    for (var i = 0; i < mesh.triangles.length; i++) {
        pStr += mesh.triangles[i] + " ";
    }
    pTag.textContent = pStr;
    trianglesTag.appendChild(pTag);


    var lvs = doc.createElement("library_visual_scenes");
    var vs = doc.createElement("visual_scene");
    vs.setAttribute("id", "vsNode");
    vs.setAttribute("name", "vs");
    var node = doc.createElement("node");
    node.setAttribute("id", "node");
    node.setAttribute("name", "node");
    vs.appendChild(node);
    var instance = doc.createElement("instance_geometry");
    instance.setAttribute("url", "#aLovelyMesh");
    node.appendChild(instance);
    lvs.appendChild(vs);
    main.appendChild(lvs);

    var scene = doc.createElement("scene");
    main.appendChild(scene);
    var el = doc.createElement("instance_visual_scene");
    el.setAttribute("url", "#vsNode");
    scene.appendChild(el);


    ////////////////////////////////////////////////////////////////////// 

    var xmlText = new XMLSerializer().serializeToString(main);
    var blob = new Blob([xmlText], {
        type: "application/xml;charset=utf-8;"
    });
    saveAs(blob, "mesh.dae");
}



function saveAs(content, fName) {
    const blobURL = window.URL.createObjectURL(content);
    const tempLink = document.createElement('a');
    tempLink.style.display = 'none';
    tempLink.href = blobURL;
    tempLink.setAttribute('download', fName);
    // Safari thinks _blank anchor are pop ups. We only want to set _blank
    // target if the browser does not support the HTML5 download attribute.
    // This allows you to download files in desktop safari if pop up blocking
    // is enabled.
    if (typeof tempLink.download === 'undefined') {
        tempLink.setAttribute('target', '_blank');
    }
    document.body.appendChild(tempLink);
    tempLink.click();
    document.body.removeChild(tempLink);
    setTimeout(() => {
        // For Firefox it is necessary to delay revoking the ObjectURL
        window.URL.revokeObjectURL(blobURL);
    }, 100);
}