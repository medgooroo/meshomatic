/*
https://github.com/mapbox/martini
ISC License

Copyright (c) 2019, Mapbox

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

Any terrible code was undoubtedly added by me - J Walton 2021
*/
class Martini {
    constructor(gridSize = 257) {
        this.gridSize = gridSize;
        const tileSize = gridSize - 1;
        if (tileSize & (tileSize - 1)) throw new Error(
            `Expected grid size to be 2^n+1, got ${gridSize}.`);

        this.numTriangles = tileSize * tileSize * 2 - 2;

        this.numParentTriangles = this.numTriangles - tileSize * tileSize;

        this.indices = new Float32Array(this.gridSize * this.gridSize);

        // coordinates for all possible triangles in an RTIN tile
        this.coords = new Uint16Array(this.numTriangles * 4);

        // get triangle coordinates from its index in an implicit binary tree
        for (let i = 0; i < this.numTriangles; i++) {
            let id = i + 2;
            let ax = 0, ay = 0, bx = 0, by = 0, cx = 0, cy = 0;
            if (id & 1) {
                bx = by = cx = tileSize; // bottom-left triangle
            } else {
                ax = ay = cy = tileSize; // top-right triangle
            }
            while ((id >>= 1) > 1) {
                const mx = (ax + bx) >> 1;
                const my = (ay + by) >> 1;

                if (id & 1) { // left half
                    bx = ax; by = ay;
                    ax = cx; ay = cy;
                } else { // right half
                    ax = bx; ay = by;
                    bx = cx; by = cy;
                }
                cx = mx; cy = my;
            }
            const k = i * 4;
            this.coords[k + 0] = ax;
            this.coords[k + 1] = ay;
            this.coords[k + 2] = bx;
            this.coords[k + 3] = by;
        }
    }

    createTile(terrain) {
        return new Tile(terrain, this);
    }
}

class Tile {
    constructor(terrain, martini) {
        const size = martini.gridSize;
        if (terrain.length !== size * size) throw new Error(
            `Expected terrain data of length ${size * size} (${size} x ${size}), got ${terrain.length}.`);
        this.terrain = terrain;
        this.martini = martini;
        this.errors = new Float32Array(terrain.length);
        this.update();
    }

    update() {
        const { numTriangles, numParentTriangles, coords, gridSize: size } = this.martini;
        const { terrain, errors } = this;

        // iterate over all possible triangles, starting from the smallest level
        for (let i = numTriangles - 1; i >= 0; i--) {
            const k = i * 4;
            const ax = coords[k + 0];
            const ay = coords[k + 1];
            const bx = coords[k + 2];
            const by = coords[k + 3];
            const mx = (ax + bx) >> 1;
            const my = (ay + by) >> 1;
            const cx = mx + my - ay;
            const cy = my + ax - mx;

            // calculate error in the middle of the long edge of the triangle
            const interpolatedHeight = (terrain[ay * size + ax] + terrain[by * size + bx]) / 2;
            const middleIndex = my * size + mx;
            const middleError = Math.abs(interpolatedHeight - terrain[middleIndex]);

            errors[middleIndex] = Math.max(errors[middleIndex], middleError);
            if (i < numParentTriangles) { // bigger triangles; accumulate error with children
                const leftChildIndex = ((ay + cy) >> 1) * size + ((ax + cx) >> 1);
                const rightChildIndex = ((by + cy) >> 1) * size + ((bx + cx) >> 1);
                errors[middleIndex] = Math.max(errors[middleIndex], errors[leftChildIndex], errors[rightChildIndex]);
            }
        }
    }

    getMesh(maxError = 0) {
        const { gridSize: size, indices } = this.martini;
        const { errors } = this;
        const { terrain } = this;

        let numVertices = 0;
        let numTriangles = 0;
        const max = size - 1;

        // use an index grid to keep track of vertices that were already used to avoid duplication
        indices.fill(0);

        // retrieve mesh in two stages that both traverse the error map:
        // - countElements: find used vertices (and assign each an index), and count triangles (for minimum allocation)
        // - processTriangle: fill the allocated vertices & triangles typed arrays

        function countElements(ax, ay, bx, by, cx, cy) {
            const mx = (ax + bx) >> 1;
            const my = (ay + by) >> 1;

            if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && errors[my * size + mx] > maxError) {
                countElements(cx, cy, ax, ay, mx, my);
                countElements(bx, by, cx, cy, mx, my);
            } else {
                indices[ay * size + ax] = indices[ay * size + ax] || ++numVertices;
                indices[by * size + bx] = indices[by * size + bx] || ++numVertices;
                indices[cy * size + cx] = indices[cy * size + cx] || ++numVertices;
                numTriangles++;
            }
        }
        countElements(0, 0, max, max, max, 0);
        countElements(max, max, 0, 0, 0, max);

        const vertices = new Float32Array(numVertices * 3);
        const triangles = new Uint32Array(numTriangles * 3);
        let triIndex = 0;



        function processTriangle(ax, ay, bx, by, cx, cy) {
            const mx = (ax + bx) >> 1;
            const my = (ay + by) >> 1;

            if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && errors[my * size + mx] > maxError) {
                // triangle doesn't approximate the surface well enough; drill down further
                processTriangle(cx, cy, ax, ay, mx, my);
                processTriangle(bx, by, cx, cy, mx, my);

            } else {

                // add a triangle
                // probably save  z into the indices list
                const a = indices[ay * size + ax] - 1;
                const b = indices[by * size + bx] - 1;
                const c = indices[cy * size + cx] - 1;

                vertices[3 * a] = ax;
                vertices[3 * a + 1] = ay;
                vertices[3 * a + 2] = terrain[ay * size + ax];// * zoom; // added for z. We'll scale Z later

                vertices[3 * b] = bx;
                vertices[3 * b + 1] = by;
                vertices[3 * b + 2] = terrain[by * size + bx];// * zoom;

                vertices[3 * c] = cx;
                vertices[3 * c + 1] = cy;
                vertices[3 * c + 2] = terrain[cy * size + cx];// * zoom;

                triangles[triIndex++] = a;
                triangles[triIndex++] = b;
                triangles[triIndex++] = c;
            }
        }
        processTriangle(0, 0, max, max, max, 0);
        processTriangle(max, max, 0, 0, 0, max);

        return { vertices, triangles };
    }

    getBoundedMesh(maxError = 0, boundingPoints) {  // bounding points as [x1,y1,x2,y2,x3,y3......]
        const { gridSize: size, indices } = this.martini;
        const { errors } = this;
        const { terrain } = this;

        let numVertices = 0;
        let numTriangles = 0;
        const max = size - 1;

        // use an index grid to keep track of vertices that were already used to avoid duplication
        indices.fill(0);

        // retrieve mesh in two stages that both traverse the error map:
        // - countElements: find used vertices (and assign each an index), and count triangles (for minimum allocation)
        // - processTriangle: fill the allocated vertices & triangles typed arrays

        function countElements(ax, ay, bx, by, cx, cy) {
            const mx = (ax + bx) >> 1;
            const my = (ay + by) >> 1;

            if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && errors[my * size + mx] > maxError) {
                countElements(cx, cy, ax, ay, mx, my);
                countElements(bx, by, cx, cy, mx, my);
            } else {
                // iterate over all the tris in points. rather than just this square. <-----------------------------------------------------------------------------------------------------------------------------------
                var isTriNeeded = false;
                for (var i = 0; i < boundingPoints.length; i = i + 6) {
                    if (isTriInTri(ax, ay, bx, by, cx, cy, boundingPoints[i], boundingPoints[i+1], boundingPoints[i + 2], boundingPoints[i + 3], boundingPoints[i + 4], boundingPoints[i + 5])) {
                        isTriNeeded = true;
                    }
                }
                //    if (isTriInTri(ax, ay, bx, by, cx, cy, points[0].x, points[0].y, points[1].x, points[1].y, points[2].x, points[2].y) || // is it within the rectangular bounds?
                //      isTriInTri(ax, ay, bx, by, cx, cy, points[1].x, points[1].y, points[3].x, points[3].y, points[2].x, points[2].y)) { // make 2 tris so we can use vaguely quick point in tri
                if (isTriNeeded == true) {
                    indices[ay * size + ax] = indices[ay * size + ax] || ++numVertices;
                    indices[by * size + bx] = indices[by * size + bx] || ++numVertices;
                    indices[cy * size + cx] = indices[cy * size + cx] || ++numVertices;
                    numTriangles++;
                }
            }
        }
        countElements(0, 0, max, max, max, 0);
        countElements(max, max, 0, 0, 0, max);

        const vertices = new Float32Array(numVertices * 3);
        const triangles = new Uint32Array(numTriangles * 3);
        let triIndex = 0;

        function isTriInTri(aax, aay, abx, aby, acx, acy, bax, bay, bbx, bby, bcx, bcy) { // probably not best name. is any point of the mesh tri within the bounds <---------------------------------- this could be better?
            if (isPointInTri(aax, aay, bax, bay, bbx, bby, bcx, bcy) ||
                isPointInTri(abx, aby, bax, bay, bbx, bby, bcx, bcy) ||
                isPointInTri(acx, acy, bax, bay, bbx, bby, bcx, bcy)) {
                return true;
            }
            else return false;
        }

        function isPointInTri(px, py, ax, ay, bx, by, cx, cy) {
            //credit: http://www.blackpawn.com/texts/pointinpoly/default.html

            var v0 = [cx - ax, cy - ay];
            var v1 = [bx - ax, by - ay];
            var v2 = [px - ax, py - ay];

            var dot00 = (v0[0] * v0[0]) + (v0[1] * v0[1]);
            var dot01 = (v0[0] * v1[0]) + (v0[1] * v1[1]);
            var dot02 = (v0[0] * v2[0]) + (v0[1] * v2[1]);
            var dot11 = (v1[0] * v1[0]) + (v1[1] * v1[1]);
            var dot12 = (v1[0] * v2[0]) + (v1[1] * v2[1]);

            var invDenom = 1 / (dot00 * dot11 - dot01 * dot01);

            var u = (dot11 * dot02 - dot01 * dot12) * invDenom;
            var v = (dot00 * dot12 - dot01 * dot02) * invDenom;

            return ((u >= 0) && (v >= 0) && (u + v < 1));
        }

        function processTriangle(ax, ay, bx, by, cx, cy) {
            const mx = (ax + bx) >> 1;
            const my = (ay + by) >> 1;

            if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && errors[my * size + mx] > maxError) { // here to increase minimum size?
                // triangle doesn't approximate the surface well enough; drill down further
                processTriangle(cx, cy, ax, ay, mx, my);
                processTriangle(bx, by, cx, cy, mx, my);

            } else {
                var isTriNeeded = false;
                for (var i = 0; i < boundingPoints.length; i = i + 6) {
                    if (isTriInTri(ax, ay, bx, by, cx, cy, boundingPoints[i], boundingPoints[i+1], boundingPoints[i + 2], boundingPoints[i + 3], boundingPoints[i + 4], boundingPoints[i + 5])) {
                        isTriNeeded = true;
                    }
                }
                if (isTriNeeded == true) {
                    // add a triangle
                    // save z into the indices list
                    const a = indices[ay * size + ax] - 1;
                    const b = indices[by * size + bx] - 1;
                    const c = indices[cy * size + cx] - 1;

                    vertices[3 * a] = ax;
                    vertices[3 * a + 1] = ay;
                    vertices[3 * a + 2] = terrain[ay * size + ax];// * zoom; // added for z. We'll scale Z later

                    vertices[3 * b] = bx;
                    vertices[3 * b + 1] = by;
                    vertices[3 * b + 2] = terrain[by * size + bx];// * zoom;

                    vertices[3 * c] = cx;
                    vertices[3 * c + 1] = cy;
                    vertices[3 * c + 2] = terrain[cy * size + cx];// * zoom;

                    triangles[triIndex++] = a;
                    triangles[triIndex++] = b;
                    triangles[triIndex++] = c;
                }
            }

        }
        processTriangle(0, 0, max, max, max, 0);
        processTriangle(max, max, 0, 0, 0, max);

        return { vertices, triangles };
    }




}