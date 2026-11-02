"""
TerraCity — stylized people (Blender, reproducible). Soft, rounded figures with
faces, hair and clothing, coloured per vertex with a baked top-light gradient
(no textures). Output: public/models/people.glb with root nodes

  mira          Mira, 9: children mira-body and mira-arm-r (pivot at the shoulder)
  adult-0..3    four distinct adults, standing
  rider         an adult seated on a bicycle (legs bent), no bicycle

Units: metres (street scale), Blender Z-up, figures face -Y (three.js +Z).

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      -P scripts/assets/build_people.py -- public/models
"""
import math
import os
import sys

import bpy
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT_DIR = os.path.abspath(ARGS[0] if ARGS else "public/models")


def lin(h):
    h = h.lstrip("#")
    return tuple((int(h[i : i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))


def finish(obj, color, subsurf=1, shade=True, ao=(0.62, 1.0)):
    """Smooth, subdivided, coloured with a soft top-light gradient."""
    bpy.context.view_layer.objects.active = obj
    if subsurf:
        m = obj.modifiers.new("s", "SUBSURF")
        m.levels = subsurf
        m.render_levels = subsurf
        bpy.ops.object.modifier_apply(modifier="s")
    me = obj.data
    for p in me.polygons:
        p.use_smooth = shade
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    zs = [(obj.matrix_world @ v.co).z for v in me.vertices]
    z0, z1 = min(zs), max(zs)
    c = lin(color)
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index]
            z = (obj.matrix_world @ v.co).z
            n = (obj.matrix_world.to_3x3() @ v.normal).normalized()
            t = (z - z0) / max(1e-6, z1 - z0)
            k = ao[0] + (ao[1] - ao[0]) * (0.55 * t + 0.45 * max(0.0, n.z * 0.5 + 0.5))
            attr.data[li].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)
    return obj


def sphere(name, loc, scale, color, seg=16, rings=10, subsurf=0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(o, color, subsurf)


def capsule(name, a, b, r0, r1, color, seg=10):
    """Rounded limb from point a to b (radii r0 at a, r1 at b)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r0, radius2=r1, depth=d.length, location=(a + b) / 2)
    o = bpy.context.active_object
    o.name = name
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    finish(o, color, 0)
    parts = [o, sphere(name + "-ja", tuple(a), (r0, r0, r0), color, 8, 5), sphere(name + "-jb", tuple(b), (r1, r1, r1), color, 8, 5)]
    return parts


def bell(name, z0, z1, r0, r1, color, flare=0.0, seg=14):
    """Skirt / torso: a tapered tube closed at the top, rounded by subdivision."""
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r0, radius2=r1, depth=z1 - z0, location=(0, 0, (z0 + z1) / 2))
    o = bpy.context.active_object
    o.name = name
    if flare:
        for v in o.data.vertices:
            if v.co.z < 0:
                v.co.x *= 1 + flare
                v.co.y *= 1 + flare
    return finish(o, color, 1)


def lathe(name, profile, color, seg=18, close_top=True):
    """A smooth body of revolution from (z, rx, ry) rings (bottom to top): dresses, torsos."""
    import bmesh

    bm = bmesh.new()
    rings = []
    for z, rx, ry in profile:
        rings.append([bm.verts.new((rx * math.cos(2 * math.pi * k / seg), ry * math.sin(2 * math.pi * k / seg), z)) for k in range(seg)])
    for a, b in zip(rings, rings[1:]):
        for k in range(seg):
            bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    bm.faces.new(list(reversed(rings[0])))
    if close_top:
        top = bm.verts.new((0, 0, profile[-1][0] + 0.01))
        for k in range(seg):
            bm.faces.new((rings[-1][k], rings[-1][(k + 1) % seg], top))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.update()
    return finish(o, color, 0)


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    return o


def mouth(cx, cz, r, f, happy, name="mouth"):
    """A curved mouth: the lower half of a thin ring (smile) or the upper half (sad)."""
    import bmesh

    bpy.ops.mesh.primitive_torus_add(major_radius=r * 0.2, minor_radius=r * 0.035, location=(cx, f + r * 0.02, cz - r * (0.3 if happy else 0.4)), rotation=(math.pi / 2, 0, 0))
    t = bpy.context.active_object
    t.name = name
    bm = bmesh.new()
    bm.from_mesh(t.data)
    # After the X rotation local +y is up.
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if (v.co.y > r * 0.02 if happy else v.co.y < -r * 0.02)], context="VERTS")
    bm.to_mesh(t.data)
    bm.free()
    return finish(t, "#8a3b33", 0)


def face(cx, cz, r, skin, eye="#2b2420", y_front=None, smile=True, cheeks=True):
    """Eyes with a highlight, small nose, cheeks, a smile on a head of radius r at (cx, *, cz)."""
    f = -r * 0.93 if y_front is None else y_front
    parts = []
    for sx in (-1, 1):
        ex = cx + sx * r * 0.36
        parts.append(sphere("eye", (ex, f, cz + r * 0.05), (r * 0.13, r * 0.07, r * 0.17), eye, 10, 8))
        parts.append(sphere("glint", (ex + r * 0.04, f - r * 0.06, cz + r * 0.11), (r * 0.045, r * 0.03, r * 0.045), "#ffffff", 8, 6))
        if cheeks:
            parts.append(sphere("cheek", (cx + sx * r * 0.55, f + r * 0.18, cz - r * 0.2), (r * 0.17, r * 0.06, r * 0.11), "#f2a08f", 10, 6))
    parts.append(sphere("nose", (cx, f - r * 0.06, cz - r * 0.1), (r * 0.09, r * 0.08, r * 0.08), skin, 10, 6))
    if smile:
        parts.append(mouth(cx, cz, r, f, True))
    return parts


# ------------------------------------------------------------------ Mira --

def mira():
    skin, hair, dress = "#c98d6a", "#3a2618", "#f2b33d"
    P = []
    # Legs and sandals.
    for sx in (-1, 1):
        P += capsule("leg", (sx * 0.065, 0, 0.06), (sx * 0.06, 0, 0.44), 0.045, 0.05, skin)
        P.append(sphere("shoe", (sx * 0.065, -0.03, 0.035), (0.055, 0.09, 0.04), "#c0563b", 12, 8))
    # Dress: a flared skirt and a fitted top, white collar, a pocket with a flower.
    # One A-line dress: flared hem, fitted waist, rounded shoulders.
    P.append(lathe("dress", [(0.36, 0.27, 0.25), (0.39, 0.27, 0.25), (0.5, 0.23, 0.21), (0.66, 0.17, 0.15), (0.77, 0.14, 0.12), (0.88, 0.15, 0.125), (0.97, 0.14, 0.11), (1.01, 0.09, 0.075), (1.03, 0.05, 0.045)], dress, 20))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.07, minor_radius=0.013, location=(0, 0, 1.015), major_segments=20, minor_segments=6)
    P.append(finish(bpy.context.active_object, "#ffffff", 0))
    P.append(sphere("flower", (0.09, -0.2, 0.62), (0.03, 0.015, 0.03), "#e86a8f", 10, 6))
    # Neck and head (big, friendly proportions).
    P += capsule("neck", (0, 0, 0.98), (0, 0, 1.06), 0.045, 0.045, skin)
    hr = 0.15
    P.append(sphere("head", (0, 0, 1.2), (hr, hr * 0.96, hr * 1.02), skin, 20, 14))
    P += face(0, 1.2, hr, skin, smile=False)  # her mouth follows the simulation (below)
    # Hair: a cap, a fringe, two pigtails with yellow ties.
    P.append(sphere("hair", (0, 0.015, 1.235), (hr * 1.07, hr * 1.06, hr * 1.0), hair, 20, 14))
    for v in P[-1].data.vertices:  # open the face: push front-lower hair inward
        w = P[-1].matrix_world @ v.co
        if w.y < -0.04 and w.z < 1.27:
            v.co.y += 0.05
    P.append(sphere("fringe", (0, -0.1, 1.31), (hr * 0.75, hr * 0.28, hr * 0.22), hair, 16, 10))
    for sx in (-1, 1):
        P.append(sphere("pigtail", (sx * 0.19, 0.03, 1.17), (0.06, 0.06, 0.1), hair, 14, 10))
        P.append(sphere("tie", (sx * 0.16, 0.03, 1.23), (0.03, 0.03, 0.02), "#f2d03d", 10, 6))
    # Left arm, relaxed.
    P += capsule("arm-l", (-0.17, 0, 0.96), (-0.21, -0.02, 0.66), 0.038, 0.032, skin)
    P.append(sphere("hand-l", (-0.215, -0.02, 0.62), (0.042, 0.035, 0.05), skin, 12, 8))
    body = join(P, "mira-body")
    # Right arm: pivot at the shoulder (origin), hanging down along -Z.
    A = capsule("arm-r", (0, 0, 0), (0.03, -0.02, -0.3), 0.038, 0.032, skin)
    A.append(sphere("hand-r", (0.035, -0.02, -0.34), (0.042, 0.035, 0.05), skin, 12, 8))
    arm = join(A, "mira-arm-r")
    arm.location = (0.17, 0, 0.96)
    happy = mouth(0, 1.2, hr, -hr * 0.93, True, "mira-smile")
    sad = mouth(0, 1.2, hr, -hr * 0.93, False, "mira-sad")
    root = bpy.data.objects.new("mira", None)
    bpy.context.scene.collection.objects.link(root)
    for o in (body, arm, happy, sad):
        o.parent = root
    return root


# ---------------------------------------------------------------- adults --

ADULTS = [
    # skin, hair, top, bottom, shoes, kind
    ("#e2b48f", "#7a4a2a", "#3f7a9a", "#e7ddc8", "#6b4a35", "sunhat-dress"),
    ("#8d5a3b", "#1f1a17", "#f2f2f2", "#4a5a6a", "#2b2b2b", "short"),
    ("#f1d3b8", "#bdb6ae", "#c0563b", "#6b5a46", "#4a3a2c", "cap-elder"),
    ("#c99a72", "#2b1d14", "#7a4f8f", "#2f3a4a", "#d9d2c4", "ponytail"),
]


def adult(i, seated=False):
    skin, hair, top, bottom, shoes, kind = ADULTS[i]
    P = []
    hip = 0.88
    for sx in (-1, 1):
        if seated:
            P += capsule("thigh", (sx * 0.1, 0, hip), (sx * 0.1, -0.38, hip - 0.04), 0.07, 0.06, bottom)
            P += capsule("shin", (sx * 0.1, -0.38, hip - 0.04), (sx * 0.1, -0.42, hip - 0.46), 0.055, 0.045, skin if kind == "sunhat-dress" else bottom)
            P.append(sphere("shoe", (sx * 0.1, -0.47, hip - 0.5), (0.055, 0.11, 0.045), shoes, 12, 8))
        else:
            P += capsule("leg", (sx * 0.09, 0, 0.07), (sx * 0.1, 0, hip), 0.055, 0.075, skin if kind == "sunhat-dress" else bottom)
            P.append(sphere("shoe", (sx * 0.09, -0.04, 0.045), (0.06, 0.12, 0.05), shoes, 12, 8))
    if kind == "sunhat-dress" and not seated:
        P.append(lathe("dress", [(0.5, 0.29, 0.26), (0.53, 0.29, 0.26), (0.75, 0.23, 0.2), (0.95, 0.17, 0.14), (1.05, 0.16, 0.13), (1.25, 0.19, 0.14), (1.38, 0.18, 0.12), (1.43, 0.1, 0.08), (1.46, 0.06, 0.05)], top, 20))
    else:
        P.append(lathe("hips", [(hip - 0.06, 0.17, 0.12), (hip + 0.05, 0.18, 0.13), (hip + 0.14, 0.165, 0.12)], bottom, 16, close_top=False))
        P.append(lathe("torso", [(hip + 0.1, 0.165, 0.12), (1.05, 0.165, 0.12), (1.25, 0.2, 0.135), (1.37, 0.19, 0.12), (1.43, 0.1, 0.08), (1.46, 0.06, 0.05)], top, 18))
    P += capsule("neck", (0, 0, 1.4), (0, 0, 1.48), 0.05, 0.05, skin)
    hr = 0.12
    P.append(sphere("head", (0, 0, 1.6), (hr, hr * 0.97, hr * 1.08), skin, 14, 10))
    P += face(0, 1.6, hr, skin, cheeks=kind != "short")
    if kind == "sunhat-dress":
        P.append(sphere("hair", (0, 0.02, 1.63), (hr * 1.08, hr * 1.06, hr * 1.0), hair, 14, 9))
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.24, depth=0.02, location=(0, 0, 1.69))
        P.append(finish(bpy.context.active_object, "#e9d9a8", 0))
        P.append(sphere("crown", (0, 0, 1.73), (0.12, 0.12, 0.07), "#e9d9a8", 16, 10))
        bpy.ops.mesh.primitive_torus_add(major_radius=0.12, minor_radius=0.015, location=(0, 0, 1.71))
        P.append(finish(bpy.context.active_object, "#c0563b", 0))
    elif kind == "short":
        P.append(sphere("hair", (0, 0.02, 1.66), (hr * 1.04, hr * 1.02, hr * 0.7), hair, 14, 9))
    elif kind == "cap-elder":
        P.append(sphere("hair", (0, 0.03, 1.6), (hr * 1.05, hr * 1.04, hr * 0.95), hair, 14, 9))
        P.append(sphere("cap", (0, 0.0, 1.69), (hr * 1.05, hr * 1.05, hr * 0.55), "#3f4f3f", 20, 10))
        P.append(sphere("peak", (0, -0.12, 1.68), (0.09, 0.07, 0.015), "#3f4f3f", 12, 6))
    else:
        P.append(sphere("hair", (0, 0.02, 1.64), (hr * 1.07, hr * 1.06, hr * 0.98), hair, 14, 9))
        P.append(sphere("ponytail", (0, 0.15, 1.56), (0.05, 0.06, 0.13), hair, 12, 10))
    for sx in (-1, 1):
        if seated:
            P += capsule("arm", (sx * 0.22, 0, 1.36), (sx * 0.2, -0.35, 1.08), 0.05, 0.04, top)
            P.append(sphere("hand", (sx * 0.2, -0.39, 1.06), (0.045, 0.045, 0.045), skin, 12, 8))
        else:
            sleeve = top if kind in ("cap-elder", "ponytail") else skin
            P += capsule("arm", (sx * 0.23, 0, 1.36), (sx * 0.27, -0.02, 0.98), 0.05, 0.04, sleeve)
            P.append(sphere("hand", (sx * 0.275, -0.02, 0.93), (0.045, 0.04, 0.06), skin, 12, 8))
    if kind == "cap-elder" and not seated:  # a walking stick
        P += capsule("stick", (0.3, -0.06, 0.0), (0.29, -0.04, 0.93), 0.012, 0.012, "#6b4a35")
    return join(P, "rider" if seated else f"adult-{i}")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = bpy.data.materials.new("people")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.7
    objs = [mira()]
    for i in range(len(ADULTS)):
        objs.append(adult(i))
    objs.append(adult(1, seated=True))
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            o.data.materials.clear()
            o.data.materials.append(mat)
            o.data.color_attributes.active_color = o.data.color_attributes["Col"]
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type == "MESH"}
    out = os.path.join(OUT_DIR, "people.glb")
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = dict(filepath=out, export_format="GLB", export_yup=True, export_normals=True, export_materials="EXPORT", export_apply=True)
    if "export_vertex_color" in props:
        kw["export_vertex_color"] = "ACTIVE"
    bpy.ops.export_scene.gltf(**kw)
    print("triangles:", tris)
    print(f"wrote {out} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    main()
