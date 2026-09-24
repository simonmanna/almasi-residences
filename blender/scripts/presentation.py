"""Render-ready camera and lighting for the editable Blender sources."""
import bpy, math
from mathutils import Vector

def setup_presentation(name):
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.samples=48
    scene.cycles.use_denoising=True
    scene.render.resolution_x=1600; scene.render.resolution_y=1000
    scene.render.resolution_percentage=100
    world=scene.world or bpy.data.worlds.new('Almasi atmosphere')
    scene.world=world;world.use_nodes=True
    world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.55,.65,.8,1)
    world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.35
    positions={'exterior':((44,-53,26),(0,0,7)), 'residence':((-.3,-4.7,1.65),(-3.5,-.6,1.1)), 'reception':((0,-4,1.65),(0,2.3,1.4))}
    position,target=positions[name]
    camera=bpy.data.objects.new('Almasi cinematic camera',bpy.data.cameras.new('Almasi camera'))
    scene.collection.objects.link(camera);camera.location=position
    camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.lens=28 if name!='exterior' else 40
    scene.camera=camera
    sun=bpy.data.objects.new('Golden hour sun',bpy.data.lights.new('Golden hour sun','SUN'))
    scene.collection.objects.link(sun);sun.rotation_euler=(math.radians(65),math.radians(-25),math.radians(-30))
    sun.data.energy=2.2;sun.data.color=(1,.77,.52);sun.data.angle=.12
    if name!='exterior':
        for i,(x,y) in enumerate([(-3,-2),(3,-2),(-3,3),(3,3)]):
            light=bpy.data.objects.new(f'Soft interior light {i}',bpy.data.lights.new(f'Soft interior light {i}','AREA'))
            scene.collection.objects.link(light);light.location=(x,y,2.8)
            light.data.energy=110;light.data.shape='DISK';light.data.size=3;light.data.color=(1,.83,.61)

if __name__=='__main__':
    from pathlib import Path
    root=Path(__file__).resolve().parents[1]
    for name in ['exterior','residence','reception']:
        bpy.ops.wm.open_mainfile(filepath=str(root/f'{name}.blend'))
        for o in list(bpy.context.scene.objects):
            if o.type in {'CAMERA','LIGHT'}:bpy.data.objects.remove(o,do_unlink=True)
        setup_presentation(name)
        bpy.ops.wm.save_as_mainfile(filepath=str(root/f'{name}.blend'))
