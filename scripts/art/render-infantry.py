"""Bake the supplied WWI infantry GLB into the map's sixteen headings.

Run from any directory with Blender 4.3+:
  blender --background --threads 4 --python scripts/art/render-infantry.py

The GLB and its embedded textures are source assets only. The browser loads PNGs.
"""
import argparse
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--headings", nargs="+", type=int, default=list(range(16)))
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
OUT = ROOT / "src/assets/units/wwi-infantry"
OUT.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / "scripts/art/sources/wwi-infantry/model.glb"))
parts = [(obj.data, obj.matrix_world.copy()) for obj in bpy.context.scene.objects if obj.type == "MESH"]
for obj in list(bpy.context.scene.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 64
# Also works in distribution builds without OpenImageDenoise.
scene.cycles.use_denoising = False
scene.cycles.seed = 0
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.compression = 100
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "AgX"
scene.world = bpy.data.worlds.new("World")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.8, 0.85, 1, 1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7

light = bpy.data.lights.new("Key", "AREA")
light.energy = 650
light.shape = "DISK"
light.size = 5
key = bpy.data.objects.new("Key", light)
scene.collection.objects.link(key)
key.location = (4, -3, 7)
key.rotation_euler = (-key.location).to_track_quat("-Z", "Y").to_euler()

camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"

# iso3d.ts projects (x, y, z) as (x-y, (x+y)/2 - 0.86*z).
# A 30-degree orthographic camera gives the ground diamond; compressing z
# by this factor reproduces its vertical lift as well. Front in the GLB is -Y.
lift = 0.86 / math.sqrt(1.5)
squash = Matrix.Diagonal((1, 1, lift, 1))
# The SVG projection's screen X runs opposite a conventional camera at +X,+Y.
# Swap the ground axes so heading 0 faces screen lower-right, just like headingFor.
screen_axes = Matrix(((0, 1, 0, 0), (1, 0, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))
instances = []
for _ in range(3):
    group = []
    for mesh, transform in parts:
        obj = bpy.data.objects.new("Infantry", mesh)
        scene.collection.objects.link(obj)
        group.append((obj, transform))
    instances.append(group)


def frame(width, height, cy, pixels):
    """Frame in the same projected units as UnitModel.ts; origin is (width/2, cy)."""
    target = Vector((0, 0, (cy - height / 2) / math.sqrt(1.5)))
    camera.location = target + Vector((6, 6, math.sqrt(24)))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = max(width, height) / math.sqrt(2)
    scene.render.resolution_x = round(width * pixels)
    scene.render.resolution_y = round(height * pixels)


def soldiers(heading, spots):
    angle = heading * math.tau / 16
    turn = Matrix.Rotation(angle, 4, "Z")
    face_forward = Matrix.Rotation(math.pi / 2, 4, "Z")
    for i, group in enumerate(instances):
        for obj, original in group:
            obj.hide_render = i >= len(spots)
            if i < len(spots):
                u, v = spots[i]
                obj.matrix_world = screen_axes @ squash @ turn @ Matrix.Translation((u, v, 0)) @ face_forward @ original


def render(name):
    scene.render.filepath = str(OUT / name)
    bpy.ops.render.render(write_still=True)


# One fixed canvas/anchor for all headings prevents jumps when an army turns.
# The three figures occupy the same wedge as the existing procedural squad.
frame(5, 3.5, 2.6, 80)
for heading in args.headings:
    if not 0 <= heading < 16:
        raise ValueError("headings must be between 0 and 15")
    soldiers(heading, [(0.5, 0), (-0.32, 0.64), (-0.32, -0.64)])
    render(f"heading-{heading:02d}.png")

# Single figure for unit cards, research nodes and compact army rows.
frame(1.8, 2.2, 1.9, 160)
soldiers(0, [(0, 0)])
render("portrait.png")
