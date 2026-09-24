"""Almasi concept showroom. Run with Blender --background --python this_file.
Metres; helpers use Three.js X/Y-up/Z coordinates. No third-party assets.
Reference geometry follows the existing 38m-wide maquette; interiors illustrative.
"""
import bpy, math, random, json, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from presentation import setup_presentation
OUT = ROOT / 'apps/web/public/models/almasi'
OUT.mkdir(parents=True, exist_ok=True)
random.seed(18)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def mat(name, color, rough=.55, metal=0, glow=0, alpha=1):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,alpha); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,alpha)
    p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
    if glow:
        p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=glow
    if alpha<1:
        p.inputs['Alpha'].default_value=alpha
        m.surface_render_method='DITHERED'
    return m

stone=mat('Honed limestone',(.68,.64,.55),.78)
cream=mat('Ivory plaster',(.84,.81,.72),.8)
wood=mat('Smoked walnut',(.16,.085,.042),.5)
oak=mat('Natural oak',(.48,.31,.15),.62)
dark=mat('Bronze frames',(.055,.065,.06),.32,.7)
glass=mat('Blue glass',(.24,.42,.46),.09,.35,alpha=.22)
fabric=mat('Linen upholstery',(.73,.69,.60),.94)
olive=mat('Olive velvet',(.22,.28,.19),.95)
brass=mat('Brushed brass',(.56,.37,.15),.3,.8)
light=mat('Warm cove light',(1,.62,.26),.5,glow=3)
leaf=mat('Foliage',(.075,.17,.065),.9)
leaf2=mat('Foliage light',(.16,.26,.095),.9)
grass=mat('Garden lawn',(.10,.17,.085),1)
water=mat('Pool water',(.045,.32,.36),.12,.4)
white=mat('Porcelain',(.91,.9,.84),.28)
rug=mat('Woven sand rug',(.53,.48,.38),1)
art=mat('Abstract terracotta',(.4,.16,.08),.8)

def texture(material, kind):
    """Small packed, tileable PBR colour maps; no runtime network dependency."""
    size=256; image=bpy.data.images.new(material.name+' texture',width=size,height=size)
    base=material.diffuse_color[:3]; pixels=[]
    for y in range(size):
        for x in range(size):
            noise=random.random()-.5
            if kind=='wood':
                wave=math.sin(x*.4+math.sin(y*.025)*2+math.sin(x*.11)*2)
                value=.85+.09*wave+.06*noise
            elif kind=='stone':
                vein=math.sin(x*.037+y*.019+math.sin(y*.06)*.9)
                value=.95+.04*noise-(.16 if vein>.985 else 0)
            else:value=.94+.10*noise+.03*math.sin(x*math.pi/2)*math.sin(y*math.pi/2)
            # glTF base textures use sRGB rather than Blender's linear base colours.
            pixels.extend([max(0,min(1,(c*value)**(1/2.2))) for c in base]+[1])
    image.pixels=pixels; image.pack()
    tree=material.node_tree; node=tree.nodes.new('ShaderNodeTexImage'); node.image=image
    tree.links.new(node.outputs['Color'],tree.nodes.get('Principled BSDF').inputs['Base Color'])

for material,kind in [(wood,'wood'),(oak,'wood'),(stone,'stone'),(white,'stone'),(fabric,'fabric'),(rug,'fabric')]:texture(material,kind)

current='Site'
def box(name,p,s,m,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(p[0],-p[2],p[1]))
    o=bpy.context.object; o.name=current+'__'+name; o.scale=(s[0],s[2],s[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(m)
    if bevel:
        mod=o.modifiers.new('Soft crafted edges','BEVEL'); mod.width=bevel; mod.segments=3
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

def sphere(name,p,s,m):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,location=(p[0],-p[2],p[1]))
    o=bpy.context.object; o.name=current+'__'+name; o.scale=(s[0],s[2],s[1]); o.data.materials.append(m)
    for f in o.data.polygons:f.use_smooth=True
    return o

def cyl(name,p,r,h,m):
    bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=r,depth=h,location=(p[0],-p[2],p[1]))
    o=bpy.context.object; o.name=current+'__'+name; o.data.materials.append(m)
    return o

def foliage(x,y,z,r=2.5):
    # Individual leaf sprays give a broken canopy silhouette rather than balls.
    verts=[]; faces=[]
    for i in range(340):
        a=random.random()*math.tau; u=random.uniform(-1,1); radius=r*random.random()**.35
        xx=x+math.cos(a)*math.sqrt(1-u*u)*radius; zz=z+math.sin(a)*math.sqrt(1-u*u)*radius; yy=y+u*radius*.68
        length=random.uniform(.18,.43); width=length*.42; angle=random.random()*math.tau
        vx=math.cos(angle)*length; vz=math.sin(angle)*length
        k=len(verts)
        for px,py,pz in [(xx-vx,yy,zz-vz),(xx-vz*.42,yy+.05,zz+vx*.42),(xx+vx,yy+.09,zz+vz),(xx+vz*.42,yy+.05,zz-vx*.42)]:verts.append((px,-pz,py))
        faces.extend([(k,k+1,k+2),(k,k+2,k+3)])
    mesh=bpy.data.meshes.new('Leaves');mesh.from_pydata(verts,[],faces);mesh.materials.append(leaf);mesh.materials.append(leaf2)
    for f in mesh.polygons:f.material_index=random.randrange(2)
    o=bpy.data.objects.new(current+'__Leaf canopy',mesh);bpy.context.collection.objects.link(o)

def plant(x,y,z,scale=1):
    cyl('Planter',(x,y+.22*scale,z),.25*scale,.44*scale,stone)
    for i in range(7):
        a=i*2.4
        o=sphere('Broadleaf',(x+math.cos(a)*.2*scale,y+(.6+i*.09)*scale,z+math.sin(a)*.2*scale),(.12*scale,.4*scale,.075*scale),leaf if i%2 else leaf2)
        o.rotation_euler[1]=math.cos(a)*.7

def chair(x,y,z):
    box('Chair seat',(x,y+.45,z),(.65,.18,.65),fabric,.08)
    box('Chair back',(x,y+.78,z-.26),(.65,.65,.15),fabric,.08)
    for dx in [-.23,.23]:
        for dz in [-.23,.23]:box('Chair leg',(x+dx,y+.2,z+dz),(.04,.4,.04),wood)

def sofa(x,y,z):
    box('Sofa plinth',(x,y+.18,z),(3.1,.25,1.1),wood,.07)
    box('Sofa back',(x,y+.75,z-.48),(3.2,.9,.23),fabric,.12)
    for dx in [-1.48,1.48]:box('Sofa arm',(x+dx,y+.55,z),(.25,.65,1.1),fabric,.1)
    for dx in [-.95,0,.95]:
        box('Seat cushion',(x+dx,y+.48,z),(.9,.25,.92),fabric,.10)
        box('Loose cushion',(x+dx,y+.86,z-.26),(.66,.45,.18),olive if dx else cream,.08)

def bed(x,z):
    box('Bed frame',(x,.23,z),(2.25,.4,2.5),wood,.09)
    box('Mattress',(x,.51,z),(2.15,.32,2.4),white,.12)
    box('Duvet',(x,.72,z+.25),(2.17,.16,1.8),fabric,.12)
    box('Headboard',(x,.85,z-1.28),(2.65,1.65,.16),olive,.1)
    for dx in [-.55,.55]:box('Pillow',(x+dx,.77,z-.8),(.85,.2,.45),white,.12)
    for dx in [-1.65,1.65]:
        box('Bedside',(x+dx,.35,z-1),(.55,.65,.5),oak,.04)
        cyl('Lamp stem',(x+dx,.87,z-1),.035,.4,brass)
        sphere('Opal lamp',(x+dx,1.08,z-1),(.15,.15,.15),light)

def export(name):
    # Merge by level + material, retaining semantic names and cutting draw calls.
    groups={}
    for o in list(bpy.context.scene.objects):
        if o.type=='MESH':groups.setdefault((o.name.split('__')[0],o.data.materials[0].name),[]).append(o)
    for (level,m),objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]; bpy.ops.object.convert(target='MESH'); bpy.ops.object.join()
        bpy.context.object.name=level+'__'+m
    setup_presentation(name)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender'/f'{name}.blend'))
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'{name}.glb'),export_format='GLB',export_yup=True,export_cameras=False,export_lights=False)
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

# Exterior: same scale and floors as lib/building-model.ts.
box('Ground',(0,-.35,0),(125,.5,110),grass)
box('Plaza',(0,-.06,2),(48,.18,48),stone,.1)
box('Drive',(0,.05,21),(46,.1,5),dark)
for l in range(6):
    current=f'Floor_{l}'; y=l*3.4
    w=38 if l<4 else 32
    box('Slab',(0,y,0),(w,.32,23),cream,.10)
    if l==5:continue
    box('Rear wall',(0,y+1.7,-10.6),(w,3.1,.25),stone)
    for x in [-w/2,w/2]:box('Sidewall',(x,y+1.7,0),(.3,3.1,21),cream)
    for x in range(-16,17,8):
        if abs(x)>w/2-2:continue
        box('Window',(x,y+1.7,9),(7.3,2.8,.08),glass)
        box('Warm interior',(x,y+1.4,7.2),(7,2.4,.08),wood)
        for dx in [-3.7,0,3.7]:box('Window mullion',(x+dx,y+1.7,9.05),(.065,3,.08),dark)
        box('Stone pier',(x-3.85,y+1.6,10.2),(.34,3.2,2.6),stone,.04)
        box('Glass railing',(x,y+.85,11.35),(7.4,1.1,.065),glass)
        box('Railing cap',(x,y+1.43,11.35),(7.4,.035,.05),dark)
        box('Cove',(x,y+3.17,10),(7.2,.04,.06),light)
        for dx in [-2.7,2.7]:plant(x+dx,y+.18,10,1.05)
        if l>0:
            chair(x,y+.16,10)
            for dx in [2.9,3.1,3.3,3.5]:box('Walnut fins',(x+dx,y+1.75,10),(.07,2.9,.7),wood)
    for z in range(-8,9,4):
        for x in [-w/2-.17,w/2+.17]:box('Side glazing',(x,y+1.65,z),(.055,2.5,2.8),glass)
current='Site'
box('Entry canopy',(0,3.18,15),(13,.3,8),cream,.18)
for x in [-6,6]:box('Entry column',(x,1.5,18),(.35,3,.35),stone)
box('Pool surround',(-5,.13,-20),(21,.35,10),cream,.16)
box('Pool',(-5,.34,-20),(18,.06,7),water,.08)
for x in [-12,-8,-4,0,4]:
    box('Daybed',(x,.48,-26),(1.15,.42,2.2),fabric,.12)
    box('Daybed frame',(x,.22,-26),(1.22,.14,2.3),wood)
for x,z in [(-25,-15),(-25,0),(-25,15),(25,-15),(25,0),(25,15),(-18,28),(18,28),(-23,-30),(23,-30)]:
    cyl('Tree trunk',(x,2,z),.23,4,wood)
    foliage(x,4.6,z,3.1)
    for i in range(5):
        a=i*2.4
        branch=cyl('Branch',(x+math.cos(a)*.55,3.5,z+math.sin(a)*.55),.075,2,wood)
        branch.rotation_euler=(math.sin(a)*.6,math.cos(a)*.6,0)
for x in range(-23,24,2):
    plant(x,0,25,.8)
    if x%4==1:
        box('Bollard',(x,.45,24),(.15,.9,.15),dark)
        box('Path light',(x,.8,24),(.17,.14,.17),light)
export('exterior')

# One connected reference home: living south, bedroom wing north, 1.8m hall.
current='Interior'
box('Subfloor',(0,-.16,0),(14,.25,12),stone)
for x in range(28):
    for z in range(6):box('Oak plank',(-6.75+x*.5,-.014,-5+z*2),(.492,.025,1.99),oak)
box('North wall',(0,1.55,-6),(14,3.1,.18),cream)
for x in [-7,7]:box('End wall',(x,1.55,0),(.18,3.1,12),cream)
# Doorways between the open living space and northern rooms.
for x,w in [(-6.5,1),(-3.1,3.8),(0,1.8),(3.1,3.8),(6.5,1)]:box('Partition',(x,1.55,-1),(w,3.1,.16),cream)
box('Door lintel',(0,2.78,-1),(14,.64,.16),cream)
for x in [-1,1]:box('Hall wall',(x,1.55,-3.5),(.14,3.1,5),cream)
box('Bath divider',(2.7,1.55,-4.1),(3.4,3.1,.12),cream)
box('Bath divider',(6.25,1.55,-4.1),(1.5,3.1,.12),cream)
box('Bath lintel',(4.95,2.78,-4.1),(1.1,.64,.12),cream)
# Opening through bath divider.
# Keep bathroom reached by a room jump, bounded navigation within each room.
box('Window',(-3.9,1.55,5.98),(6,3,.035),glass)
box('Window',(3.9,1.55,5.98),(6,3,.035),glass)
for x in [-6.9,-3.5,0,3.5,6.9]:box('Window frame',(x,1.55,6),(.045,3.1,.07),dark)
box('Terrace',(0,-.1,7.1),(14,.2,2.3),stone)
box('Balustrade',(0,.65,8.2),(14,1.2,.04),glass)
for x in [-6.9,6.9]:box('Balcony side',(x,.65,7.1),(.05,1.2,2.3),glass)
current='Ceiling'
box('Ceiling',(0,3.12,0),(14,.16,12),cream)
for x in [-6.65,6.65]:box('Cove',(x,3,0),(.045,.045,11.8),light)
current='Interior'
box('Living rug',(-3.5,.026,2.5),(5.3,.02,4.8),rug,.05)
sofa(-3.5,0,.5)
cyl('Coffee table',(-3.4,.4,2.45),.78,.13,stone)
cyl('Table pedestal',(-3.4,.2,2.45),.27,.4,wood)
box('Art frame',(-6.86,1.65,1.8),(.08,1.65,2),brass)
box('Art canvas',(-6.8,1.65,1.8),(.04,1.5,1.85),art)
plant(-6.3,0,5.3,1.5)
chair(-1.5,0,3.5)
# Kitchen and island, fitted cabinet seams and brass handles.
for x in [1.7,2.7,3.7,4.5]:
    box('Cabinet',(x,.47,-.4),(.94,.92,.85),wood,.025)
    box('Overhead cabinet',(x,2.3,-.65),(.94,.9,.45),cream,.015)
    box('Handle',(x,.8,.04),(.32,.025,.03),brass)
box('Marble countertop',(3.1,.96,-.36),(3.8,.09,1),white,.02)
box('Induction hob',(3.5,1.02,-.3),(1,.02,.55),dark)
box('Sink',(4.5,1.02,-.3),(.7,.02,.5),dark,.06)
cyl('Tap',(4.5,1.22,-.65),.025,.45,brass)
box('Island',(3.8,.48,1.55),(3.4,.92,1.1),wood,.03)
box('Island marble',(3.8,.97,1.55),(3.65,.10,1.3),white,.03)
for x in [2.6,3.8,5]:
    cyl('Pendant cord',(x,2.6,1.55),.008,1,brass)
    sphere('Pendant',(x,2.03,1.55),(.17,.18,.17),light)
cyl('Dining table',(3.8,.77,4.45),1.1,.12,stone)
cyl('Dining pedestal',(3.8,.36,4.45),.35,.72,wood)
for x,z in [(2.2,4.5),(5.4,4.5),(3.8,5.7)]:chair(x,0,z)
bed(-4,-3.9); bed(3.2,-2.6)
box('Wardrobe',(-6.55,1.4,-3.6),(.65,2.8,3.3),wood,.02)
box('Bath vanity',(5.7,.45,-5.4),(1.8,.85,.75),oak,.03)
box('Basin',(5.7,.92,-5.4),(.65,.18,.45),white,.09)
box('Mirror',(5.7,1.75,-5.87),(1.8,1.2,.035),glass)
box('Shower screen',(3.2,1.15,-5.15),(.04,2.3,1.65),glass)
cyl('Shower head',(2.2,2.4,-5.7),.15,.035,brass)
box('Shower tray',(2.1,.035,-5.1),(1.8,.05,1.6),white,.03)
for x in [-5,5]:plant(x,0,7.3,1.3)
chair(-2,0,7); chair(2,0,7)
export('residence')

current='Reception'
box('Lobby floor',(0,-.1,0),(12,.2,10),stone)
box('Lobby back',(0,2,-5),(12,4,.2),wood)
for x in [-6,6]:box('Lobby wall',(x,2,0),(.2,4,10),cream)
box('Reception desk',(0,.6,-2.3),(4,1.2,1.1),stone,.12)
box('Desk trim',(0,.15,-1.73),(3.8,.03,.02),light)
sofa(-3,0,1.4); chair(3,0,2)
for x in [-5,5]:plant(x,0,-3.5,1.8)
for x in [-2,0,2]:
    cyl('Pendant',(x,3.2,-2.3),.24,.15,brass)
    sphere('Light',(x,3,-2.3),(.2,.2,.2),light)
export('reception')
print('ALMASI: exterior, residence, reception exported successfully.')
