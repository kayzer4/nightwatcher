import bpy
import bmesh
from mathutils import Vector

# ==============================================================================
# КОМПАКТНЫЕ АККУРАТНЫЕ ПАРАМЕТРЫ
# ==============================================================================
ROAD_LENGTH = 1.2       # Длина дороги (аккуратный размер)
ROAD_WIDTH = 1.1        # Ширина дороги (аккуратная двухполосная дорога)
SIDEWALK_W = 0.10       # Стандартная ширина тротуара (как в KayKit)
MEDIAN_W = 0.12         # Аккуратный узкий островок (под фонарь)
H_SIDEWALK = 0.02       # Высота тротуаров и центрального островка
H_ROAD = 0.01           # Высота полотна асфальта
JOIN_LAMP_PARTS = True  # Объединить части фонаря, если разбиты
REMOVE_OLD_ROAD = True  # Удалить старые объекты дорог
LAMP_COUNT = 1          # 1 фонарь строго по центру
ENABLE_TEXTURES = True  # Автоматически включить отображение текстур во вьюпорте
# ==============================================================================

def run():
    print("=== Применение дороги с включением текстур ===")

    # 1. Поиск материала colormap
    colormap_mat = None
    for mat in bpy.data.materials:
        if "colormap" in mat.name.lower():
            colormap_mat = mat
            break

    # 2. Удаление предыдущих версий дороги
    if REMOVE_OLD_ROAD:
        for obj in list(bpy.data.objects):
            if any(name in obj.name.lower() for name in ["road-end", "road-straight", "road-straight-median"]):
                print(f"Удаление старой дороги: {obj.name}")
                bpy.data.objects.remove(obj, do_unlink=True)

    # 3. Расчёт координат
    x_half = ROAD_LENGTH / 2.0
    y_half = ROAD_WIDTH / 2.0
    m_half = MEDIAN_W / 2.0
    lane_l = -y_half + SIDEWALK_W
    lane_r = y_half - SIDEWALK_W

    segments = [
        (-y_half, 0.0, -y_half, H_SIDEWALK, 'side'),
        (-y_half, H_SIDEWALK, lane_l, H_SIDEWALK, 'sidewalk'),
        (lane_l, H_SIDEWALK, lane_l, H_ROAD, 'curb'),
        (lane_l, H_ROAD, -m_half, H_ROAD, 'road'),
        (-m_half, H_ROAD, -m_half, H_SIDEWALK, 'curb'),
        (-m_half, H_SIDEWALK, m_half, H_SIDEWALK, 'island'),
        (m_half, H_SIDEWALK, m_half, H_ROAD, 'curb'),
        (m_half, H_ROAD, lane_r, H_ROAD, 'road'),
        (lane_r, H_ROAD, lane_r, H_SIDEWALK, 'curb'),
        (lane_r, H_SIDEWALK, y_half, H_SIDEWALK, 'sidewalk'),
        (y_half, H_SIDEWALK, y_half, 0.0, 'side'),
        (y_half, 0.0, -y_half, 0.0, 'bottom'),
    ]

    uv_map = {
        'road': (0.41, 0.12),      # Тёмно-серый асфальт
        'sidewalk': (0.47, 0.48),  # Светлый тротуар
        'island': (0.47, 0.48),    # Островок посередине
        'curb': (0.47, 0.38),      # Грани бордюра
        'side': (0.47, 0.27),      # Торцы
        'bottom': (0.47, 0.27),    # Дно
    }

    mesh = bpy.data.meshes.new("road-straight-median")
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")

    for (y1, z1, y2, z2, seg_type) in segments:
        v1 = bm.verts.new((-x_half, y1, z1))
        v2 = bm.verts.new(( x_half, y1, z1))
        v3 = bm.verts.new(( x_half, y2, z2))
        v4 = bm.verts.new((-x_half, y2, z2))
        f = bm.faces.new((v1, v2, v3, v4))
        uv_coord = uv_map.get(seg_type, (0.47, 0.48))
        for loop in f.loops:
            loop[uv_layer].uv = uv_coord

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0001)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    road_obj = bpy.data.objects.new("road-straight-median", mesh)
    if colormap_mat:
        road_obj.data.materials.append(colormap_mat)
    
    col = bpy.context.collection if bpy.context.collection else bpy.data.collections[0]
    col.objects.link(road_obj)
    print("Создана аккуратная дорога:", road_obj.name)

    # 4. Фонарь: центрирование на островке
    lamp_objs = [o for o in bpy.data.objects if any(k in o.name.lower() for k in ["light", "lamp"])]
    if lamp_objs:
        if JOIN_LAMP_PARTS and len(lamp_objs) > 1 and all("light-square." in o.name for o in lamp_objs[1:]):
            bpy.ops.object.select_all(action='DESELECT')
            for lp in lamp_objs:
                lp.select_set(True)
            bpy.context.view_layer.objects.active = lamp_objs[0]
            bpy.ops.object.join()
            main_lamp = bpy.context.view_layer.objects.active
        else:
            main_lamp = lamp_objs[0]

        # Ставим фонарь ровно на островок
        main_lamp.location = Vector((0.0, 0.0, H_SIDEWALK))
        print(f"Фонарь {main_lamp.name} установлен в центр островка (0, 0, {H_SIDEWALK})")

    # 5. Включение отображения текстур во вьюпорте
    if ENABLE_TEXTURES:
        for window in bpy.context.window_manager.windows:
            screen = window.screen
            for area in screen.areas:
                if area.type == 'VIEW_3D':
                    for space in area.spaces:
                        if space.type == 'VIEW_3D':
                            # Переключаем в режим Material Preview
                            space.shading.type = 'MATERIAL'
                            # А для режима Solid включаем цвет текстуры
                            space.shading.color_type = 'TEXTURE'
        print("Режим отображения вьюпорта переключен на Material Preview (текстуры включены)!")

    print("=== Успешно выполнено! ===")

if __name__ == "__main__":
    run()
