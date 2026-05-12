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
      const outputTris = new Array(tris.length);
      const outputVerts = [];
      const vertIndex = new Map();
      for (let i = 0; i < tris.length; i++) {
        const base = tris[i] * 3;
        const x = verts[base];
        const y = verts[base + 1];
        const z = verts[base + 2];
        const key = `${x},${y},${z}`;
        let idx = vertIndex.get(key);
        if (idx === undefined) {
          idx = outputVerts.length / 3;
          outputVerts.push(x, y, z);
          vertIndex.set(key, idx);
        }
        outputTris[i] = idx;
      }
      return { triangles: outputTris, vertices: outputVerts };
    }

    getElevAt(x, y) {
      return this.elevData[(y) * this.elevSize + x];
    }
    getBlerpElevAt(x, y) {
      // Clamp to valid index range. Subdivided midpoints can sit on the
      // SE edge of the grid; without this, the lookup reads NaN.
      const max = this.elevSize - 1;
      let xCeil = Math.min(Math.ceil(x), max);
      let xFloor = Math.max(Math.floor(x), 0);
      let yCeil = Math.min(Math.ceil(y), max);
      let yFloor = Math.max(Math.floor(y), 0);
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


    // sub-pixel floor — stops recursion at cliffs / nodata steps where the
    // error metric can never fall below the local discontinuity height.
    static MIN_EDGE_PX = 1;

    processTriangle(aIndex, bIndex, cIndex, maxError) {
      const ax = this.vertices[aIndex * 3];
      const ay = this.vertices[aIndex * 3 + 1];
      const az = this.vertices[aIndex * 3 + 2];
      const bx = this.vertices[bIndex * 3];
      const by = this.vertices[bIndex * 3 + 1];
      const bz = this.vertices[bIndex * 3 + 2];
      const cx = this.vertices[cIndex * 3];
      const cy = this.vertices[cIndex * 3 + 1];
      const cz = this.vertices[cIndex * 3 + 2];

      // sample points: edge midpoints + centroid
      const abx = (ax + bx) / 2, aby = (ay + by) / 2;
      const bcx = (bx + cx) / 2, bcy = (by + cy) / 2;
      const cax = (cx + ax) / 2, cay = (cy + ay) / 2;
      const cenx = (ax + bx + cx) / 3, ceny = (ay + by + cy) / 3;

      // actual DEM elevation at each sample point
      const abActual = this.getBlerpElevAt(abx, aby);
      const bcActual = this.getBlerpElevAt(bcx, bcy);
      const caActual = this.getBlerpElevAt(cax, cay);
      const cenActual = this.getBlerpElevAt(cenx, ceny);

      // what the triangle plane (linear interp of vertices) gives at each point
      const abInterp = (az + bz) / 2;
      const bcInterp = (bz + cz) / 2;
      const caInterp = (cz + az) / 2;
      const cenInterp = (az + bz + cz) / 3;

      const errAB = Math.abs(abActual - abInterp);
      const errBC = Math.abs(bcActual - bcInterp);
      const errCA = Math.abs(caActual - caInterp);
      const errCen = Math.abs(cenActual - cenInterp);
      const worstErr = Math.max(errAB, errBC, errCA, errCen);

      if (worstErr <= maxError) {
        this.outTriangles.push(aIndex, bIndex, cIndex);
        return;
      }

      const abLen = Math.hypot(ax - bx, ay - by);
      const bcLen = Math.hypot(bx - cx, by - cy);
      const caLen = Math.hypot(cx - ax, cy - ay);

      // Always bisect the longest edge (Rivara longest-edge refinement). The
      // error trigger above decides WHETHER to split; geometry decides WHERE.
      // Longest-edge bisection converges to a bounded set of triangle shapes,
      // so we don't produce arbitrarily skinny tris — important because the
      // consuming acoustic-modelling software handles slivers poorly.
      let splitEdge, dx, dy, dz, splitLen;
      if (abLen >= bcLen && abLen >= caLen) {
        splitEdge = 'AB'; dx = abx; dy = aby; dz = abActual; splitLen = abLen;
      } else if (bcLen >= caLen) {
        splitEdge = 'BC'; dx = bcx; dy = bcy; dz = bcActual; splitLen = bcLen;
      } else {
        splitEdge = 'CA'; dx = cax; dy = cay; dz = caActual; splitLen = caLen;
      }

      // Floor: when the longest edge is at the pixel limit there's no more
      // data to resolve. Higher error past this point is a real discontinuity
      // (cliff, building, nodata) that the DEM can't represent any finer.
      if (splitLen <= Jini.MIN_EDGE_PX) {
        this.outTriangles.push(aIndex, bIndex, cIndex);
        return;
      }

      const dIndex = (this.vertices.push(dx) - 1) / 3;
      this.vertices.push(dy);
      this.vertices.push(dz);

      if (splitEdge === 'AB') {
        this.processTriangle(dIndex, bIndex, cIndex, maxError);
        this.processTriangle(aIndex, dIndex, cIndex, maxError);
      } else if (splitEdge === 'BC') {
        this.processTriangle(aIndex, bIndex, dIndex, maxError);
        this.processTriangle(aIndex, dIndex, cIndex, maxError);
      } else {
        this.processTriangle(aIndex, bIndex, dIndex, maxError);
        this.processTriangle(dIndex, bIndex, cIndex, maxError);
      }
    }

    // boundingPoints is a flat list of pre-triangulated vertices:
    // [x1,y1,x2,y2,x3,y3,...] where every three consecutive points form a
    // triangle (output of earcut against the user polygon).
    // maxError is the vertical deviation threshold in the elevation grid's
    // units (metres for terrain-rgb).
    getBoundedMesh(boundingPoints, maxError) {
      this.vertices = new Array(boundingPoints.length * 1.5);
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
          maxError);
      }

      return this.dedup(this.outTriangles, this.vertices);
    }
}
