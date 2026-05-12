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
export class Jini {

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
    }


    processTriangle(aIndex, bIndex, cIndex, outputMeshRes) {
      let ax = this.vertices[aIndex * 3];
      let ay = this.vertices[aIndex * 3 + 1];
      let bx = this.vertices[bIndex * 3];
      let by = this.vertices[bIndex * 3 + 1];
      let cx = this.vertices[cIndex * 3];
      let cy = this.vertices[cIndex * 3 + 1];

      var abDist = Math.sqrt ( ((ax - bx) * (ax - bx)) + ((ay - by) * (ay - by)) );
      var bcDist = Math.sqrt ( ((bx - cx) * (bx - cx)) + ((by - cy) * (by - cy)) );
      var acDist = Math.sqrt ( ((cx - ax) * (cx - ax)) + ((cy - ay) * (cy - ay)) );
      var longestSide = Math.max(abDist, bcDist, acDist);

      if (longestSide > outputMeshRes) {
        // split largest side.
        if (abDist >= longestSide) {
          var dx = (ax + bx) / 2;
          var dy = (ay + by) / 2;
          var dz = this.getBlerpElevAt(dx, dy);
          let dIndex = (this.vertices.push(dx) - 1) / 3;
          this.vertices.push(dy);
          this.vertices.push(dz);
          this.processTriangle(dIndex, bIndex, cIndex, outputMeshRes);
          this.processTriangle(aIndex, dIndex, cIndex, outputMeshRes);
          longestSide++; // so we don't split multiple sides if equal
        }
        if (bcDist >= longestSide) {
          var dx = (bx + cx) / 2;
          var dy = (by + cy) / 2;
          var dz = this.getBlerpElevAt(dx, dy);
          let dIndex = (this.vertices.push(dx) - 1) / 3;
          this.vertices.push(dy);
          this.vertices.push(dz);
          this.processTriangle(aIndex, bIndex, dIndex, outputMeshRes);
          this.processTriangle(aIndex, dIndex, cIndex, outputMeshRes);
          longestSide++;
        }
        if (acDist >= longestSide) {
          var dx = (ax + cx) / 2;
          var dy = (ay + cy) / 2;
          var dz = this.getBlerpElevAt(dx, dy);
          let dIndex = (this.vertices.push(dx) - 1) / 3;
          this.vertices.push(dy);
          this.vertices.push(dz);
          this.processTriangle(aIndex, bIndex, dIndex, outputMeshRes);
          this.processTriangle(dIndex, bIndex, cIndex, outputMeshRes);
          longestSide++;
        }
      }
      else {
        this.outTriangles.push(aIndex);
        this.outTriangles.push(bIndex);
        this.outTriangles.push(cIndex);
      }
    }

    // bounding points as [x1,y1,x2,y2,x3,y3......]
    getBoundedMesh(boundingPoints, outputMeshRes) {
      this.vertices = new Array(boundingPoints.length * 1.5); //  make it big enough for x,y and z
      const inTriangles = new Uint32Array(boundingPoints.length / 2);

      inTriangles.forEach(function(v, i) {
        inTriangles[i] = i;
      });
      var bp = 0;
      for (var i = 0; i < this.vertices.length; i = i + 3) {
        this.vertices[i] = boundingPoints[bp++];
        this.vertices[i + 1] = boundingPoints[bp++];
        this.vertices[i + 2] = this.getBlerpElevAt(this.vertices[i], this.vertices[i + 1]);
      }

      for (var i = 0; i < inTriangles.length/3; i++) {
        this.processTriangle(
          inTriangles[i * 3], inTriangles[i * 3] + 1, inTriangles[i * 3] + 2,
          outputMeshRes);
      }

      return this.dedup(this.outTriangles, this.vertices);
    }
}
