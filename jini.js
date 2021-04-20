/*
inspired by https://github.com/mapbox/martini but without the style, speed, cunning and quality

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.

ISC License

*/
class Jini {

    constructor(elevData) { // elev data must be square
      this.elevSize = Math.sqrt(elevData.length);
      this.elevData = elevData;
      this.outTriangles = [];
      this.vertices = new Uint32Array();
    }

    dedup(tris, verts) {
      // so this is gonna be reaaaaaaal slow. 
       var outputTris = [];
       var outputVerts = [];
       var newVertIndex = 0;
       for (var i = 0; i < tris.length; i++) { // dont care about tris, its just a list of verts.
         var x = verts[tris[i] * 3];
         var y = verts[tris[i] * 3 + 1];
         var z = verts[tris[i] * 3 + 2];
         // does outputVerts have the verts? 
         var vertsNeeded = 1;
     
         for (var v = 0; v < outputVerts.length / 3; v++) {
           if ((outputVerts[v * 3] == x) && (outputVerts[v * 3 + 1] == y) && (outputVerts[v * 3 + 2] == z)) {
             outputTris.push(v);
             vertsNeeded = 0;
           }
         }
         if (vertsNeeded == 1) {
           outputVerts.push(x);
           outputVerts.push(y);
           outputVerts.push(z);
           outputTris.push(newVertIndex);
           newVertIndex++;
         }
       }
       console.log("input verts: " + verts.length);
       console.log("output verts: " + outputVerts.length);
            return {
             triangles: outputTris,
             vertices: outputVerts
           }
     }
  
    getElevAt(x, y) {
      return this.elevData[(y) * this.elevSize + x];
    }
    getBlerpElevAt(x, y) {
        
      let xCeil = Math.ceil(x);
      let xFloor = Math.floor(x);
      let yCeil = Math.ceil(y);
      let yFloor = Math.floor(y);
      if ((xCeil === xFloor) && (yCeil === yFloor)) return this.getElevAt(xCeil, yCeil);
  
      if (xCeil === xFloor) {
        let ret =
          (yCeil - y) / (yCeil - yFloor) * (this.elevData[(yCeil) * this.elevSize + xFloor]) +
          (y - yFloor) / (yCeil - yFloor) * (this.elevData[(yFloor) * this.elevSize + xFloor]);
        return ret;
      }
  
      if (yCeil === yFloor) {
        let ret =
          (xCeil - x) / (xCeil - xFloor) * (this.elevData[(yFloor) * this.elevSize + xCeil]) +
          (x - xFloor) / (xCeil - xFloor) * (this.elevData[(yFloor) * this.elevSize + xFloor]);
        return ret;
      }
  
      let interp1 =
        (xCeil - x) / (xCeil - xFloor) * (this.elevData[(yFloor) * this.elevSize + xFloor]) +
        (x - xFloor) / (xCeil - xFloor) * (this.elevData[(yFloor) * this.elevSize + xCeil]);
      let interp2 =
        (xCeil - x) / (xCeil - xFloor) * (this.elevData[(yCeil) * this.elevSize + xFloor]) +
        (x - xFloor) / (xCeil - xFloor) * (this.elevData[(yCeil) * this.elevSize + xCeil]);
  
      let ret =
        (yCeil - y) / (yCeil - yFloor) * interp1 +
        (y - yFloor) / (yCeil - yFloor) * interp2;
      return ret;
      //  return (this.elevData[Math.floor(y) * this.elevSize + Math.floor(x)]);
    }
  
  
    processTriangle(aIndex, bIndex, cIndex, outputMeshRes) { //
      let ax = this.vertices[aIndex * 3]; // just to make things readable.
      let ay = this.vertices[aIndex * 3 + 1];
//      let az = this.vertices[aIndex * 3 + 2];
      let bx = this.vertices[bIndex * 3];
      let by = this.vertices[bIndex * 3 + 1];
//      let bz = this.vertices[bIndex * 3 + 2];
      let cx = this.vertices[cIndex * 3];
      let cy = this.vertices[cIndex * 3 + 1];
//      let cz = this.vertices[cIndex * 3 + 2];
  
      var abDist = Math.sqrt ( ((ax - bx) * (ax - bx)) + ((ay - by) * (ay - by)) );
      var bcDist = Math.sqrt ( ((bx - cx) * (bx - cx)) + ((by - cy) * (by - cy)) );
      var acDist = Math.sqrt ( ((cx - ax) * (cx - ax)) + ((cy - ay) * (cy - ay)) );
      var longestSide = Math.max(abDist, bcDist, acDist);

if (longestSide > outputMeshRes) {
        // split largest side. 
        if (abDist >= longestSide) {
          // split ab, new vert d in the middle of ab
          var dx = (ax + bx) / 2;
          var dy = (ay + by) / 2;
          var dz = this.getBlerpElevAt(dx, dy);
          let dIndex = (this.vertices.push(dx) - 1) / 3;
          this.vertices.push(dy); // replace tri a/b/c with 
          this.vertices.push(dz); // tris d/b/c and a/d/c
          this.processTriangle(dIndex, bIndex, cIndex, outputMeshRes);
          this.processTriangle(aIndex, dIndex, cIndex, outputMeshRes);
          longestSide++; // so we don't split multiple sides if equal
        }
        // split largest side. 
        if (bcDist >= longestSide) {
          // split bc, new vert d in the middle of bc
          var dx = (bx + cx) / 2;
          var dy = (by + cy) / 2;
          var dz = this.getBlerpElevAt(dx, dy);
          let dIndex = (this.vertices.push(dx) - 1) / 3;
          this.vertices.push(dy); // replace tri a/b/c with
          this.vertices.push(dz); // tris a/b/d a/d/c
          this.processTriangle(aIndex, bIndex, dIndex, outputMeshRes);
          this.processTriangle(aIndex, dIndex, cIndex, outputMeshRes);
          longestSide++; // so we don't split multiple sides if equal
        }
        // split largest side. 
        if (acDist >= longestSide) { // either ac is longest or equilateral.
          // split ac, new vert d in the middle of ac
          var dx = (ax + cx) / 2;
          var dy = (ay + cy) / 2;
          var dz = this.getBlerpElevAt(dx, dy);
          let dIndex = (this.vertices.push(dx) - 1) / 3;
          this.vertices.push(dy); // replace tri a/b/c with 
          this.vertices.push(dz); // tris a/b/d and d/b/c
          this.processTriangle(aIndex, bIndex, dIndex, outputMeshRes);
          this.processTriangle(dIndex, bIndex, cIndex, outputMeshRes);
          longestSide++; // so we don't split multiple sides if equal  
        }
      }
        // create new tri, append to tri list 
              else {
          this.outTriangles.push(aIndex);
          this.outTriangles.push(bIndex);
          this.outTriangles.push(cIndex);
        }
    }
    // we're rebuilding a triangle and vertex list - never needs to not be? TODO
    getBoundedMesh(boundingPoints, outputMeshRes) { // bounding points as [x1,y1,x2,y2,x3,y3......]
      // bounding points is 2d. 
      this.vertices = new Array(boundingPoints.length * 1.5); //  make it big enough for x,y and z
      const inTriangles = new Uint32Array(boundingPoints.length / 2); // 
  
      inTriangles.forEach(function(v, i) {
        inTriangles[i] = i
        //console.log("inTriangles: " + inTriangles[i]);
      }); // 0,1,2,....
      var bp = 0;
      for (var i = 0; i < this.vertices.length; i = i + 3) {
        this.vertices[i] = boundingPoints[bp++];
        this.vertices[i + 1] = boundingPoints[bp++];
        this.vertices[i + 2] = this.getBlerpElevAt(this.vertices[i], this.vertices[i + 1]);
      }
  
      for (var i = 0; i < inTriangles.length/3; i++) { // iterate over the coarse triangles making up the mesh.
    //  console.log("process triangle: " + inTriangles[i*3] + " " + (inTriangles[i*3]+1) + " "+ (inTriangles[i*3]+2));
        this.processTriangle(
          inTriangles[i * 3], inTriangles[i * 3] + 1, inTriangles[i * 3] + 2,
          outputMeshRes);
      }

      return this.dedup(this.outTriangles, this.vertices);
      // return {
      //   triangles: this.outTriangles,
      //   vertices: this.vertices
      // }
  
    }
  }
  
  
  /*
  const elev = new Uint32Array(1000);
  elev.fill(0);
  
  const jini = new Jini(elev);
  
  function rand() {
    return Math.random() * 400;
  }
  //const mesh = jini.getBoundedMesh([this.rand(), this.rand(), this.rand(), this.rand(), this.rand(), this.rand()], 1000);
  
  //const mesh = jini.getBoundedMesh([0, 0, 200, 0, 300, 300, 200, 0, 300, 300, 400, 250, 200, 0, 500, 0, 400,250  ], 10000);
  const mesh = jini.getBoundedMesh([0, 0, 200, 0, 300, 300], 10000);
  
  
  let cx = document.querySelector("canvas").getContext("2d");
  cx.beginPath();
  //console.log(mesh.triangles.length);
  for (let i = 0; i < mesh.triangles.length; i = i + 3) {
    //console.log("i: " + i + " x, y: " + mesh.vertices[mesh.triangles[i] * 3] + mesh.vertices[mesh.triangles[i] * 3 + 1]);
    cx.moveTo(mesh.vertices[mesh.triangles[i] * 3], mesh.vertices[mesh.triangles[i] * 3 + 1]);
    cx.lineTo(mesh.vertices[mesh.triangles[i + 1] * 3], mesh.vertices[mesh.triangles[i + 1] * 3 + 1]);
    cx.lineTo(mesh.vertices[mesh.triangles[i + 2] * 3], mesh.vertices[mesh.triangles[i + 2] * 3 + 1]);
  
    cx.lineTo(mesh.vertices[mesh.triangles[i] * 3], mesh.vertices[mesh.triangles[i] * 3 + 1]);
  }
  
  cx.stroke();
  
  */