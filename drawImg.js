

function drawImg(mesh) {
    var drawingCanvas = document.getElementById('drawing');
    var drawctx = drawingCanvas.getContext('2d');
 //   console.log(mesh.vertices);
    drawctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height)
    for (var i = 0; i < mesh.triangles.length; i = i + 3) {
        drawctx.beginPath();

        ax = mesh.vertices[mesh.triangles[i] * 3];
        ay = -1 * mesh.vertices[(mesh.triangles[i] * 3) + 1];
        az = mesh.vertices[mesh.triangles[i] * 3 + 2];
        bx = mesh.vertices[mesh.triangles[i + 1] * 3];
        by = -1 * mesh.vertices[(mesh.triangles[i + 1] * 3) + 1];
        bz = mesh.vertices[(mesh.triangles[i + 1] * 3) + 2];
        cx = mesh.vertices[mesh.triangles[i + 2] * 3];
        cy = -1 * mesh.vertices[(mesh.triangles[i + 2] * 3) + 1];
        cz = mesh.vertices[(mesh.triangles[i + 2] * 3) + 2];


        ax += drawingCanvas.width / 2;
        ay += drawingCanvas.height / 2;
        bx += drawingCanvas.width / 2;
        by += drawingCanvas.height / 2;
        cx += drawingCanvas.width / 2;
        cy += drawingCanvas.height / 2;

        drawctx.beginPath();
        drawctx.moveTo(ax, ay);
        drawctx.lineTo(bx, by);
        drawctx.lineTo(cx, cy);
        drawctx.closePath();

        var range = [az, bz, cz];
        range.sort();
        var heightRange = Math.abs(range[2] - range[0]); // should be 0.1m ?? 
        // varies 0.1 -> 5?

        // all tris are right angle triangles so area of should be good approximation of size.
        // console.log("range: " + heightRange);
        // console.log("range thing: " + triArea(ax, ay, bx, by, cx, cy) / heightRange);

        var grade = triArea(ax, ay, bx, by, cx, cy) / heightRange;
        if(grade>120) grade = 120;
        console.log
        drawctx.fillStyle = numberToColorHsl(grade);
        drawctx.fill();

    }
    // convert a number to a color using hsl
    function numberToColorHsl(i) {
        // as the function expects a value between 0 and 1, and red = 0° and green = 120°
        // we convert the input to the appropriate hue value
        var hue = i * 1.2 / 360;
        // we convert hsl to rgb (saturation 100%, lightness 50%)
        var rgb = hslToRgb(hue, 1, .5);
        // we format to css value and return
        return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
    }
}
function triArea(ax, ay, bx, by, cx, cy) {
    return (Math.abs(ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) / 2);
}


function hslToRgb(h, s, l){
    var r, g, b;

    if(s == 0){
        r = g = b = l; // achromatic
    }else{
        var hue2rgb = function hue2rgb(p, q, t){
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}