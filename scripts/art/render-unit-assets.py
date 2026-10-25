"""Render imported unit GLBs into transparent portraits and sixteen map headings.

From the repository root, with Blender 4.3+:
  blender --background --threads 4 --python scripts/art/render-unit-assets.py
  ... -- --assets cavalry mountain-troops --headings 0 4

Recipes set source models, sizes and formation positions. Geometry and textures
remain unchanged in scripts/art/sources; only the baked PNGs ship to the browser.
"""
import argparse
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src/assets/units"
RECIPES = json.loads((ROOT / "scripts/art/unit-assets.json").read_text())
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--assets", nargs="+", choices=list(RECIPES), default=list(RECIPES))
parser.add_argument("--headings", nargs="+", type=int, choices=range(16), default=list(range(16)))
parser.add_argument("--no-portrait", action="store_true")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

# Same screen projection as iso3d.ts and the first infantry import. Source
# models face -Y; map heading 0 faces +X (screen lower-right).
LIFT = 0.86
SQUASH = Matrix.Diagonal((1, 1, LIFT / math.sqrt(1.5), 1))
SCREEN_AXES = Matrix(((0, 1, 0, 0), (1, 0, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))
FORWARD = Matrix.Rotation(math.pi / 2, 4, "Z")


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 64
    scene.cycles.use_denoising = False  # Distribution builds may lack OpenImageDenoise.
    scene.cycles.seed = 0
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.compression = 100
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.world = bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (0.8, 0.85, 1, 1)
    background.inputs["Strength"].default_value = 0.7
    light = bpy.data.lights.new("Key", "AREA")
    light.energy, light.size = 650, 5
    light.shape = "DISK"
    key = bpy.data.objects.new("Key", light)
    scene.collection.objects.link(key)
    key.location = (4, -3, 7)
    key.rotation_euler = (-key.location).to_track_quat("-Z", "Y").to_euler()
    camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    return scene


def load_source(source):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / "scripts/art/sources" / source / "model.glb"))
    imported = set(bpy.context.scene.objects) - before
    meshes = [(obj.data, obj.matrix_world.copy(), [Vector(v) for v in obj.bound_box])
              for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise ValueError(f"No meshes in {source}")
    points = [matrix @ corner for _, matrix, corners in meshes for corner in corners]
    lo = Vector([min(p[i] for p in points) for i in range(3)])
    hi = Vector([max(p[i] for p in points) for i in range(3)])
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)
    return meshes, lo, hi


def assemble(scene, recipe):
    sources = {}
    instances = []
    for part in recipe["parts"]:
        source = part["source"]
        if source not in sources:
            sources[source] = load_source(source)
        meshes, lo, hi = sources[source]
        dimension = hi.z - lo.z if "height" in part else max(hi.x - lo.x, hi.y - lo.y)
        scale = part.get("height", part.get("length")) / dimension
        centre = Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
        u, v = part.get("at", [0, 0])
        yaw = Matrix.Rotation(math.radians(part.get("yaw", 0)), 4, "Z")
        place = Matrix.Translation((u, v, 0)) @ FORWARD @ yaw @ Matrix.Scale(scale, 4) @ centre
        for mesh, matrix, corners in meshes:
            obj = bpy.data.objects.new(source, mesh)
            scene.collection.objects.link(obj)
            instances.append((obj, place @ matrix, corners))
    return instances


def bounds(instances, headings):
    points = []
    for heading in headings:
        turn = Matrix.Rotation(heading * math.tau / 16, 4, "Z")
        for _, transform, corners in instances:
            for corner in corners:
                p = turn @ transform @ corner
                points.append((p.x - p.y, (p.x + p.y) / 2 - LIFT * p.z))
    half = math.ceil((max(abs(x) for x, _ in points) + 0.2) * 20) / 20
    top = math.floor((min(y for _, y in points) - 0.2) * 20) / 20
    bottom = math.ceil((max(0, max(y for _, y in points)) + 0.2) * 20) / 20
    return {"width": round(half * 2, 2), "height": round(bottom - top, 2), "cx": half, "cy": -top}


def frame(scene, size, pixels):
    width, height, cy = size["width"], size["height"], size["cy"]
    target = Vector((0, 0, (cy - height / 2) / math.sqrt(1.5)))
    scene.camera.location = target + Vector((6, 6, math.sqrt(24)))
    scene.camera.rotation_euler = (target - scene.camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera.data.ortho_scale = max(width, height) / math.sqrt(2)
    scene.render.resolution_x = round(width * pixels)
    scene.render.resolution_y = round(height * pixels)


def render(scene, instances, heading, path):
    turn = Matrix.Rotation(heading * math.tau / 16, 4, "Z")
    for obj, transform, _ in instances:
        obj.matrix_world = SCREEN_AXES @ SQUASH @ turn @ transform
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


metadata_path = OUT / "frames.json"
metadata = json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
# The earlier infantry recipe and images remain reproducible with render-infantry.py.
metadata["wwi-infantry"] = {"width": 5, "height": 3.5, "cx": 2.5, "cy": 2.6}
for asset in args.assets:
    scene = setup()
    instances = assemble(scene, RECIPES[asset])
    size = bounds(instances, range(16))
    target = OUT / asset
    target.mkdir(parents=True, exist_ok=True)
    frame(scene, size, 80)
    for heading in args.headings:
        render(scene, instances, heading, target / f"heading-{heading:02d}.png")
    if not args.no_portrait:
        portrait_size = bounds(instances, [0])
        frame(scene, portrait_size, 360 / max(portrait_size["width"], portrait_size["height"]))
        render(scene, instances, 0, target / "portrait.png")
    metadata[asset] = size
    metadata_path.write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n")
    print(f"Completed {asset}: {size}", flush=True)
