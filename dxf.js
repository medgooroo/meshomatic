function writeDXF(mesh) { // not working yet
    // generic header, extents in "paper space" etc, set up 2 layers
    var bounds = getBoundingBox(mesh);
    var objText = `
999
DXF from meshomatic
0
SECTION
2
HEADER
9
$ACADVER
1
AC1006
9
$INSBASE
10
0.0
20
0.0
30
0.0
9
$EXTMIN
`;
objText += "10\n" + bounds.xMin + "\n";
objText += "20\n" + bounds.yMin + "\n";
objText += "30\n" + bounds.zMin + "\n";
objText += "9\n $EXTMAX\n";
objText += "10\n" + bounds.xMax + "\n";
objText += "20\n" + bounds.yMax + "\n";
objText += "30\n" + bounds.zMax + "\n";
objText += `0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LTYPE
70
1
0
LTYPE
2
CONTINUOUS
70
64
3
Solid line
72
65
73
0
40
0.000000
0
ENDTAB
0
TABLE
2
LAYER
70
6
0
LAYER
2
1
70
64
62
7
6
CONTINUOUS
0
LAYER
2
2
70
64
62
7
6
CONTINUOUS
0
ENDTAB
0
TABLE
2
STYLE
70
0
0
ENDTAB
0
ENDSEC
0
SECTION
2
BLOCKS
0
ENDSEC
0
SECTION
2
ENTITIES
`;
    var lineHeader = `0
LINE
8
1
62
4`;
    for (var i = 0; i < mesh.triangles.length; i = i + 3) {
        //  TODO better plan - make a list of all the lines. Remove any duplicates.

        objText += lineHeader; // A -> B
        objText += "10\n" + mesh.vertices[mesh.triangles[i] * 3] + "\n";
        objText += "20\n" + mesh.vertices[mesh.triangles[i] * 3 + 1] + "\n";
        objText += "30\n" + mesh.vertices[mesh.triangles[i] * 3 + 2] + "\n";
        objText += "11\n" + mesh.vertices[mesh.triangles[i + 1] * 3] + "\n";
        objText += "21\n" + mesh.vertices[mesh.triangles[i + 1] * 3 + 1] + "\n";
        objText += "31\n" + mesh.vertices[mesh.triangles[i + 1] * 3 + 2] + "\n";
        objText += lineHeader; // B -> C
        objText += "10\n" + mesh.vertices[mesh.triangles[i + 1] * 3] + "\n";
        objText += "20\n" + mesh.vertices[mesh.triangles[i + 1] * 3 + 1] + "\n";
        objText += "30\n" + mesh.vertices[mesh.triangles[i + 1] * 3 + 2] + "\n";
        objText += "11\n" + mesh.vertices[mesh.triangles[i + 2] * 3] + "\n";
        objText += "21\n" + mesh.vertices[mesh.triangles[i + 2] * 3 + 1] + "\n";
        objText += "31\n" + mesh.vertices[mesh.triangles[i + 2] * 3 + 2] + "\n";
        objText += lineHeader; // C -> A
        objText += "10\n" + mesh.vertices[mesh.triangles[i + 2] * 3] + "\n";
        objText += "20\n" + mesh.vertices[mesh.triangles[i + 2] * 3 + 1] + "\n";
        objText += "30\n" + mesh.vertices[mesh.triangles[i + 2] * 3 + 2] + "\n";
        objText += "11\n" + mesh.vertices[mesh.triangles[i] * 3] + "\n";
        objText += "21\n" + mesh.vertices[mesh.triangles[i] * 3 + 1] + "\n";
        objText += "31\n" + mesh.vertices[mesh.triangles[i] * 3 + 2] + "\n";
    }
    objText = objText + `0
ENDSEC
0
EOF
`;
    var blob = new Blob([objText], {
        type: "text/plain;charset=utf-8;"
    });
    saveAs(blob, "mesh.dxf");
}