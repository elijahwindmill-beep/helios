"""
Writes a tiny georeferenced 3D Tiles set for testing Zenit's 3D tiles layer without a Google key:
an orange 150 m tower 150 m east of the Seceda summit and a flat white 600 m plate south of it.
Positions are Earth-centred (ECEF), like Google's tiles, via the root transform.

  python3 make.py            # writes tileset.json + test.glb here
  python3 serve.py           # serves this folder with CORS on http://127.0.0.1:8765
  open http://localhost:5173/?tileset=http://127.0.0.1:8765/tileset.json   (dev server only)

For a Draco-compressed copy (Google's tiles use Draco):
  npx @gltf-transform/cli draco test.glb test-draco.glb   and point the tileset at it.
"""
import json, math, struct

LAT, LNG = 46.60068, 11.72598
# Seceda summit ~2519 m above sea level + EGM96 geoid 49.9 m = height above the WGS84 ellipsoid.
H = 2519 + 49.9
A = 6378137.0
F = 1 / 298.257223563
E2 = F * (2 - F)


def ecef(lat, lng, h):
    sl, cl = math.sin(math.radians(lat)), math.cos(math.radians(lat))
    so, co = math.sin(math.radians(lng)), math.cos(math.radians(lng))
    n = A / math.sqrt(1 - E2 * sl * sl)
    return [(n + h) * cl * co, (n + h) * cl * so, (n * (1 - E2) + h) * sl]


sl, cl = math.sin(math.radians(LAT)), math.cos(math.radians(LAT))
so, co = math.sin(math.radians(LNG)), math.cos(math.radians(LNG))
east, north, up = [-so, co, 0], [-sl * co, -sl * so, cl], [cl * co, cl * so, sl]
transform = east + [0] + north + [0] + up + [0] + ecef(LAT, LNG, H) + [1]  # ENU -> ECEF, column-major

verts, idx = [], []


def quad(*corners):  # corners in ENU metres; glTF is y-up: (x = east, y = up, z = -north)
    base = len(verts)
    verts.extend((e, u, -n) for e, n, u in corners)
    idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])


cx, cy, s, top = 150, 0, 15, 150
ring = [(cx - s, cy - s), (cx + s, cy - s), (cx + s, cy + s), (cx - s, cy + s)]
for i in range(4):
    (x0, y0), (x1, y1) = ring[i], ring[(i + 1) % 4]
    quad((x0, y0, -20), (x1, y1, -20), (x1, y1, top), (x0, y0, top))
quad(*[(x, y, top) for x, y in ring])
tower = len(idx)
px, py, p, z = 0, -400, 300, -60
quad((px - p, py - p, z), (px + p, py - p, z), (px + p, py + p, z), (px - p, py + p, z))

pos = b"".join(struct.pack("<3f", *v) for v in verts)
ind = b"".join(struct.pack("<H", i) for i in idx)
buf = pos + ind
while len(buf) % 4:
    buf += b"\0"
unlit = {"KHR_materials_unlit": {}}
gltf = {
    "asset": {"version": "2.0"},
    "scene": 0,
    "scenes": [{"nodes": [0]}],
    "nodes": [{"mesh": 0}],
    "meshes": [{"primitives": [
        {"attributes": {"POSITION": 0}, "indices": 1, "material": 0},
        {"attributes": {"POSITION": 0}, "indices": 2, "material": 1},
    ]}],
    "materials": [
        {"pbrMetallicRoughness": {"baseColorFactor": [0.95, 0.45, 0.1, 1]}, "extensions": unlit},
        {"pbrMetallicRoughness": {"baseColorFactor": [0.92, 0.92, 0.92, 1]}, "extensions": unlit, "doubleSided": True},
    ],
    "extensionsUsed": ["KHR_materials_unlit"],
    "buffers": [{"byteLength": len(buf)}],
    "bufferViews": [
        {"buffer": 0, "byteOffset": 0, "byteLength": len(pos), "target": 34962},
        {"buffer": 0, "byteOffset": len(pos), "byteLength": tower * 2, "target": 34963},
        {"buffer": 0, "byteOffset": len(pos) + tower * 2, "byteLength": (len(idx) - tower) * 2, "target": 34963},
    ],
    "accessors": [
        {"bufferView": 0, "componentType": 5126, "count": len(verts), "type": "VEC3",
         "min": [min(v[i] for v in verts) for i in range(3)], "max": [max(v[i] for v in verts) for i in range(3)]},
        {"bufferView": 1, "componentType": 5123, "count": tower, "type": "SCALAR"},
        {"bufferView": 2, "componentType": 5123, "count": len(idx) - tower, "type": "SCALAR"},
    ],
}
j = json.dumps(gltf).encode()
while len(j) % 4:
    j += b" "
glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(j) + 8 + len(buf)) + struct.pack("<II", len(j), 0x4E4F534A) + j + struct.pack("<II", len(buf), 0x004E4942) + buf
open("test.glb", "wb").write(glb)
tileset = {"asset": {"version": "1.1"}, "geometricError": 1000, "root": {
    "transform": transform, "boundingVolume": {"box": [0, -200, 50, 500, 0, 0, 0, 500, 0, 0, 0, 300]},
    "geometricError": 0, "refine": "REPLACE", "content": {"uri": "test.glb"}}}
json.dump(tileset, open("tileset.json", "w"))
print("wrote tileset.json and test.glb")
