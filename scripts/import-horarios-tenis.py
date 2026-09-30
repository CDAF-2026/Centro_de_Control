#!/usr/bin/env python3
"""Importa el archivo "HORARIOS ENTRENADORES.xlsx" (tenis, 30-sep-2026) → planeador.

Uso:
  python3 scripts/import-horarios-tenis.py "ruta/HORARIOS ENTRENADORES.xlsx"           (simulacro)
  python3 scripts/import-horarios-tenis.py "ruta/HORARIOS ENTRENADORES.xlsx" --apply   (escribe)

FORMATO DEL ARCHIVO (distinto al PLANEADOR BASE de septiembre)
  Una pestaña por entrenador. Fila = hora de inicio (columna A), columna = día
  (LUNES..SABADO en la fila 2), celda = niños separados por coma. No trae
  duración, documento ni fecha de nacimiento. Las celdas "APOYO A …" (el
  entrenador acompaña la clase de otro) y "OFERTAR" (hueco libre) NO son clases.
  Las notas debajo de la rejilla de Graciano (fila 23 en adelante) se ignoran:
  Laura (30-sep-2026) dijo que manda la rejilla, no las notas.

DECISIONES DE LAURA (30-sep-2026)
  - "La información de profesores y clases es la que hay en el archivo nuevo. No
    debe aparecer nada de información vieja": toda clase de tenis con niños que
    no esté en el archivo se APAGA (activa=false) y el niño que no aparezca en
    ninguna celda se RETIRA (activa=false + retirada_el; no se borra).
  - Los COLEGIOS (clase_semanal.colegio) se quedan como están: no vienen en el
    archivo y no se tocan.
  - Duración: las clases que ya existen conservan la suya; las nuevas, 60 min.
  - "(PERSONALIZADA)" no es academia: no se carga (Evelyn Montilla).
  - Los niños que no existen en la plataforma se crean con DATOS DEMO (ficha
    sin documento ni fecha, con un acudiente "POR CONFIRMAR" porque un menor
    exige acudiente) y se le entrega a Laura la lista para pedir los datos.

REGLAS DE SEGURIDAD (las mismas de import-planeador.py)
  - Simulacro por defecto; escribe solo con --apply. Idempotente.
  - La clase casa por (profesor, día, hora); la inscripción por (miembro); el
    enlace por (inscripción, clase).
  - Un nombre que cruza con VARIAS personas no se carga (va a PENDIENTES).
"""
import openpyxl, json, urllib.request, urllib.error, sys, os, unicodedata, re, warnings, datetime
from collections import defaultdict

warnings.filterwarnings("ignore")
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_args = [a for a in sys.argv[1:] if not a.startswith("--")]
XLSX = _args[0] if _args else os.path.expanduser("~/Downloads/HORARIOS ENTRENADORES.xlsx")
APPLY = "--apply" in sys.argv
VIGENTE_DESDE = "2026-10-01"          # el planeador arranca el 1-oct (decisión de Laura, 22-sep)
RETIRADA_EL = "2026-09-30"            # último día de la programación vieja
DURACION_NUEVA = 60

env = {}
for line in open(REPO + "/.env"):
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1); env[k] = v.strip().strip('"')
URL = env["NEXT_PUBLIC_SUPABASE_URL"]; KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
HDR = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Range": "0-9999"}

def req(method, path, body=None, prefer=None):
    h = dict(HDR)
    if prefer: h["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL + "/rest/v1/" + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read(); return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path[:80]} -> {e.code} {e.read().decode()[:300]}")
def get(path): return req("GET", path)
def insert(table, rows): return req("POST", table, rows, "return=representation")
def patch(path, body): return req("PATCH", path, body, "return=representation")
def delete(path): return req("DELETE", path)

def nm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().upper()
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", s)).strip()

DIA = {"LUNES": 1, "MARTES": 2, "MIERCOLES": 3, "JUEVES": 4, "VIERNES": 5, "SABADO": 6}
DN = {1: "LUN", 2: "MAR", 3: "MIE", 4: "JUE", 5: "VIE", 6: "SAB"}
# Pestaña del Excel → nombre en `profiles`
PROFESOR = {"CRISTIAN CASTRO": "Cristian Castro", "JUAN ESTEBAN GRACIANO": "Esteban Graciano",
            "JORGE PEREZ": "Jorge Pérez", "YEISON BEDOYA": "Yeison Bedoya"}
# Filas a partir de las cuales la pestaña ya no es rejilla sino notas sueltas
NOTAS_DESDE = {"JUAN ESTEBAN GRACIANO": 21, "CRISTIAN CASTRO": 16}

# ── Listas explícitas: cada entrada dice quién lo decidió y cuándo ──────────
# Excel → nombre exacto en la plataforma (mismo niño, escrito distinto).
ALIAS = {
    "SIMON VELEZ": "SIMON VELEZ URIBE", "GABRIELA BETANCOURT GALLO": "Gabriela Betancur Gallo",
    "NICOLAS BETANCOURT": "Nicolás Betancur Gallo", "JUAN MARTIN ACEVEDO": "Juan Martin Acevedo Rivera",
    "VALERIE CARRILLO": "Valerie Carrillo Londoño", "CRISTOPHER JEFFUS": "Christopher Jeffus",
    "MELANIA EL JAMAL": "Melania El - Jamal", "AMAIA EL JAMAL": "Amaia El - Jamal",
    "EMILIA EL JAMAL": "Emilia El - Jamal", "VIENTE TABORDA": "Vicente Taborda",
    "MATEO SALMANCA": "Mateo Salamanca", "CLEMENTE RAMIREZ": "Clemente Ramirez Arango",
    "MARIA PAZ": "Maria Paz Ortiz", "MAXIMILIANO FLOREZ": "MAXIMILIANO FLOREZ MOLINA",
    "LUCIANA JARAMILLO": "Luciana Jaramillo Henao", "VICTORIA LENIS": "Victoria Lenis Orrego",
    "VERONICA LENIS": "Veronica Lenis Orrego",
}
# Nombres que NO se cargan en academias, con el motivo.
NO_CARGAR = {
    "EVELYN MONTILLA": "(PERSONALIZADA): clase particular, no academia — Laura, 30-sep-2026",
}
# Solo nombre de pila y hay varias personas con ese nombre: no se carga hasta
# que Laura diga cuál es. Se reportan como PENDIENTES.
PENDIENTE = {"EMMA", "LUCIANA", "JULIA"}
# Celdas mal escritas: dos niños sin coma.
ARREGLOS_CELDA = {"HELENA TORRES CRISTOPHER JEFFUS": "HELENA TORRES, CRISTOPHER JEFFUS"}
# La rejilla de Yeison pone el grupo del viernes a las 17:00, pero la nota del
# club dice "5:30 PM A 6:30 PM". Se toma la nota: 17:30, 60 min (sugerencia
# aceptada por Laura, 30-sep-2026).
HORA_CORREGIDA = {("YEISON BEDOYA", 5, "17:00"): "17:30"}
# Niños que no existen en la plataforma: se crean con DATOS DEMO (sin documento
# ni fecha de nacimiento) agrupados por familia. Laura pide los datos al club.
# Cada familia = una ficha; el primer niño es el titular (lo crea el trigger).
DEMO_FAMILIAS = [
    [("Samuel", "Arango")], [("Helena", "Zuluaga"), ("Julia", "Zuluaga")],
    [("Isaac", "(apellido pendiente)")], [("Agustin", "Urquiza")], [("Simon", "Urrea")],
    [("Antonia", "Marin"), ("Mateo", "Marin")], [("Renata", "Graciano")], [("Isabella", "Espinoza")],
    [("Melissa", "Hurtado")], [("Sofia", "Escamilla")], [("Pedro", "Moreno")], [("Valentino", "Mejia")],
    [("Renata", "(apellido pendiente)")],
]
DEMO_NOMBRES = {nm(f"{n} {a}"): (n, a) for fam in DEMO_FAMILIAS for n, a in fam}
DEMO_NOMBRES["ISAAC"] = ("Isaac", "(apellido pendiente)")
DEMO_NOMBRES["RENATA"] = ("Renata", "(apellido pendiente)")

# ── 1 · Leer el Excel ────────────────────────────────────────────────────────
wb = openpyxl.load_workbook(XLSX, data_only=True)
celdas = {}   # (profesor, dia, "HH:MM") -> dict(nombres, competencia, origen)
ignoradas = []
for ws in wb.worksheets:
    hoja = ws.title.strip()
    prof = PROFESOR[hoja]
    hdr = {c.column: DIA[nm(c.value)] for c in ws[2] if c.value and nm(c.value) in DIA}
    for row in ws.iter_rows(min_row=3):
        if row[0].row >= NOTAS_DESDE.get(hoja, 10**6): break
        a = row[0].value
        if not isinstance(a, datetime.time): continue
        hora = a.strftime("%H:%M")
        if hora == "00:00": hora = "12:00"   # sábado de Graciano: la celda "0:00" va después de las 11:00
        for c in row[1:]:
            if c.column not in hdr or not c.value: continue
            dia = hdr[c.column]; txt = str(c.value).strip()
            if nm(txt).startswith("APOYO A") or nm(txt) == "OFERTAR":
                ignoradas.append(f"{prof} {DN[dia]} {hora}: {txt}"); continue
            hora = HORA_CORREGIDA.get((hoja, dia, hora), hora)
            etiquetas = [nm(e) for e in re.findall(r"\(([^)]*)\)", txt)]
            limpio = re.sub(r"\([^)]*\)", "", txt)
            for malo, bueno in ARREGLOS_CELDA.items(): limpio = limpio.replace(malo, bueno)
            nombres = [n.strip() for n in limpio.split(",") if n.strip()]
            celdas[(prof, dia, hora)] = dict(nombres=nombres, competencia="COMPETENCIA" in etiquetas,
                                             origen=f"{hoja}!{c.coordinate}")

# ── 2 · Lo que hay en la plataforma ─────────────────────────────────────────
academias = {a["categoria"]: a["id"] for a in get("academias?select=id,categoria&deporte=eq.tenis")}
ACA_IDS = ",".join(str(v) for v in academias.values())
perfiles = {p["nombre"]: p["id"] for p in get("profiles?select=id,nombre&activo=eq.true")}
prof_id = {}
for p in set(PROFESOR.values()):
    if p not in perfiles: sys.exit(f"❌ El profesor '{p}' no existe en profiles")
    prof_id[p] = perfiles[p]
miembros = get("cliente_miembros?select=id,cliente_id,nombres,apellidos,documento,activo")
por_nombre = defaultdict(list)
for m in miembros: por_nombre[nm(m["nombres"] + " " + m["apellidos"])].append(m)
inscs = get(f"inscripciones?select=id,miembro_id,cliente_id,academia_id,activa,retirada_el&academia_id=in.({ACA_IDS})")
insc_por_miembro = {}
for i in inscs:
    if i["miembro_id"] and (i["activa"] or i["miembro_id"] not in insc_por_miembro):
        insc_por_miembro[i["miembro_id"]] = i
en_tenis = {mid for mid, i in insc_por_miembro.items() if i["activa"]}

def cruzar(nombre):
    """→ (miembro | None, motivo). Nunca adivina entre dos personas."""
    k = nm(nombre)
    if k in NO_CARGAR: return None, "NO_CARGAR " + NO_CARGAR[k]
    if k in PENDIENTE: return None, "PENDIENTE (solo nombre de pila, varias personas se llaman así)"
    if k in ALIAS: k = nm(ALIAS[k])
    if k in DEMO_NOMBRES: k = nm(" ".join(DEMO_NOMBRES[k]))   # "ISAAC" → "ISAAC APELLIDO PENDIENTE" una vez creado
    cand = por_nombre.get(k, [])
    if len(cand) == 1: return cand[0], "exacto"
    if len(cand) > 1:
        vivos = [m for m in cand if m["id"] in en_tenis]
        if len(vivos) == 1: return vivos[0], "exacto (el que ya está matriculado en tenis)"
        return None, f"AMBIGUO: {[m['id'] for m in cand]}"
    if k in {nm(" ".join(v)) for v in DEMO_NOMBRES.values()}: return None, "DEMO"
    return None, "NO EXISTE (y no está en DEMO_FAMILIAS)"

# ── 3 · Resolver cada celda ─────────────────────────────────────────────────
quiere_clase = {}                  # (prof, dia, hora) -> [miembro_id]
quiere_insc = {}                   # miembro_id -> academia_id
pendientes, demo_necesarios, no_cargados, errores = [], {}, [], []
for k, v in sorted(celdas.items()):
    prof, dia, hora = k; ids = []
    for n in v["nombres"]:
        m, como = cruzar(n)
        if m:
            ids.append(m["id"])
            if m["id"] in insc_por_miembro and insc_por_miembro[m["id"]]["activa"]:
                quiere_insc[m["id"]] = insc_por_miembro[m["id"]]["academia_id"]   # su academia no cambia
            else:
                quiere_insc.setdefault(m["id"], academias["competencia" if v["competencia"] else "recreativa"])
        elif como == "DEMO":
            demo_necesarios.setdefault(nm(n), []).append(k); ids.append(("DEMO", nm(n)))
        elif como.startswith("NO_CARGAR"):
            no_cargados.append(f"{n} ({prof} {DN[dia]} {hora}): {como}")
        elif como.startswith("PENDIENTE"):
            pendientes.append(f"{n} ({prof} {DN[dia]} {hora})")
        else:
            errores.append(f"{n} ({prof} {DN[dia]} {hora}): {como}")
    quiere_clase[k] = ids
if errores:
    print("❌ Nombres sin resolver — no se escribe nada:"); [print("   ", e) for e in errores]; sys.exit(1)

# Clases que quedan sin ningún niño (p. ej. la de Evelyn, personalizada) no son clases de academia.
quiere_clase = {k: v for k, v in quiere_clase.items() if v}

clases = get("clase_semanal?select=id,profesor_id,dia_semana,hora_inicio,duracion_min,colegio,activa&deporte=eq.tenis")
activas = {(c["profesor_id"], c["dia_semana"], c["hora_inicio"][:5]): c for c in clases if c["activa"]}
inactivas = {(c["profesor_id"], c["dia_semana"], c["hora_inicio"][:5]): c for c in clases if not c["activa"]}
clave = lambda k: (prof_id[k[0]], k[1], k[2])
crear = [k for k in quiere_clase if clave(k) not in activas and clave(k) not in inactivas]
reactivar = [k for k in quiere_clase if clave(k) not in activas and clave(k) in inactivas]
apagar = [c for kk, c in activas.items() if not c["colegio"] and kk not in {clave(k) for k in quiere_clase}]
colegios = [c for c in activas.values() if c["colegio"]]

print(f"📄 {XLSX}")
print(f"Celdas con niños: {len(celdas)} · ignoradas (apoyo/ofertar): {len(ignoradas)}")
print(f"Clases: {len(quiere_clase)} en el archivo · crear {len(crear)} · reactivar {len(reactivar)} · apagar {len(apagar)} · colegios intactos {len(colegios)}")
for k in crear: print(f"   🆕 {k[0]} {DN[k[1]]} {k[2]} ({DURACION_NUEVA} min, {len(quiere_clase[k])} niños)")
for c in apagar:
    nombre = next(p for p, i in prof_id.items() if i == c["profesor_id"]) if c["profesor_id"] in prof_id.values() else c["profesor_id"][:8]
    print(f"   ❌ apagar #{c['id']} {nombre} {DN[c['dia_semana']]} {c['hora_inicio'][:5]}")
print(f"Niños DEMO a crear: {sum(len(f) for f in DEMO_FAMILIAS)} en {len(DEMO_FAMILIAS)} fichas")
faltan_demo = set(demo_necesarios) - set(DEMO_NOMBRES)
if faltan_demo: sys.exit(f"❌ En el Excel hay nombres marcados DEMO que no están en DEMO_FAMILIAS: {faltan_demo}")
print("No cargados:"); [print("   ", x) for x in no_cargados]
print("PENDIENTES (Laura decide quién es):"); [print("   ", x) for x in pendientes]
retirar = [i for mid, i in insc_por_miembro.items() if i["activa"] and mid not in quiere_insc]
nuevas_insc = [mid for mid in quiere_insc if mid not in en_tenis]
print(f"Matrículas: {len(en_tenis)} activas hoy · retirar {len(retirar)} · nuevas/reactivar {len(nuevas_insc)} (+{sum(len(f) for f in DEMO_FAMILIAS)} demo)")
nombre_m = lambda mid: next(f'{m["nombres"]} {m["apellidos"]}' for m in miembros if m["id"] == mid)
for i in retirar: print(f"   ⏏ retirar {nombre_m(i['miembro_id'])}")

if not APPLY:
    print("\n(simulacro — nada escrito; usa --apply para escribir)"); sys.exit(0)

# ── 4 · Escribir ─────────────────────────────────────────────────────────────
print("\n✍️  Escribiendo…")
# 4a. Fichas y niños demo (idempotente: si ya existe un miembro con ese nombre, se reutiliza)
demo_id = {}
for fam in DEMO_FAMILIAS:
    for idx, (n, a) in enumerate(fam):
        k = nm(f"{n} {a}")
        ya = por_nombre.get(k, [])
        if ya: demo_id[k] = ya[0]; continue
        if idx == 0:
            # Un menor exige acudiente (check de `clientes`): va uno demo, para reemplazar con el dato real.
            acu = insert("acudientes", [{"nombre": f"Acudiente de {n} {a} (POR CONFIRMAR)", "parentesco": "por confirmar"}])[0]
            ficha = insert("clientes", [{"nombres": n, "apellidos": a, "es_menor": True, "deportes": ["tenis"], "acudiente_id": acu["id"]}])[0]
            tit = get(f"cliente_miembros?select=id,cliente_id,nombres,apellidos&cliente_id=eq.{ficha['id']}&es_titular=eq.true")
            if not tit: sys.exit(f"❌ El trigger no creó el titular de la ficha {ficha['id']}")
            m = tit[0]
        else:
            cid = demo_id[nm(" ".join(fam[0]))]["cliente_id"]
            m = insert("cliente_miembros", [{"cliente_id": cid, "nombres": n, "apellidos": a, "deportes": ["tenis"], "es_titular": False}])[0]
        demo_id[k] = m; miembros.append(m); por_nombre[k].append(m)
for corto, (n, a) in DEMO_NOMBRES.items():   # "ISAAC" / "RENATA" → el miembro creado como "(apellido pendiente)"
    demo_id.setdefault(corto, demo_id[nm(f"{n} {a}")])
for k, ids in quiere_clase.items():
    quiere_clase[k] = [demo_id[x[1]]["id"] if isinstance(x, tuple) else x for x in ids]
    for mid in quiere_clase[k]:
        quiere_insc.setdefault(mid, academias["competencia" if celdas[k]["competencia"] else "recreativa"])
print(f"   fichas/niños demo listos: {len(demo_id)}")

# 4b. Clases
for k in crear:
    c = insert("clase_semanal", [{"profesor_id": prof_id[k[0]], "deporte": "tenis", "dia_semana": k[1], "hora_inicio": k[2] + ":00",
                                  "duracion_min": DURACION_NUEVA, "vigente_desde": VIGENTE_DESDE}])[0]
    activas[clave(k)] = c
for k in reactivar:
    c = patch(f"clase_semanal?id=eq.{inactivas[clave(k)]['id']}", {"activa": True, "vigente_desde": VIGENTE_DESDE})[0]
    activas[clave(k)] = c
for c in apagar:
    patch(f"clase_semanal?id=eq.{c['id']}", {"activa": False})
    delete(f"inscripcion_clase?clase_id=eq.{c['id']}")
    activas = {kk: v for kk, v in activas.items() if v["id"] != c["id"]}
print(f"   clases: +{len(crear)} · reactivadas {len(reactivar)} · apagadas {len(apagar)}")

# 4c. Matrículas
for i in retirar:
    patch(f"inscripciones?id=eq.{i['id']}", {"activa": False, "retirada_el": RETIRADA_EL})
    delete(f"inscripcion_clase?inscripcion_id=eq.{i['id']}")
creadas = reactivadas = 0
for mid, aca in quiere_insc.items():
    cur = insc_por_miembro.get(mid)
    if cur and cur["activa"]: continue
    if cur:
        insc_por_miembro[mid] = patch(f"inscripciones?id=eq.{cur['id']}", {"activa": True, "retirada_el": None, "academia_id": aca})[0]; reactivadas += 1
    else:
        cid = next(m["cliente_id"] for m in miembros if m["id"] == mid)
        insc_por_miembro[mid] = insert("inscripciones", [{"academia_id": aca, "cliente_id": cid, "miembro_id": mid, "fecha_inscripcion": VIGENTE_DESDE}])[0]; creadas += 1
print(f"   matrículas: retiradas {len(retirar)} · nuevas {creadas} · reactivadas {reactivadas}")

# 4d. Enlaces niño ↔ clase
ids_activas = {c["id"] for c in activas.values()}
quiero = {(insc_por_miembro[mid]["id"], activas[clave(k)]["id"]) for k, mids in quiere_clase.items() for mid in mids}
links = {(l["inscripcion_id"], l["clase_id"]) for l in get("inscripcion_clase?select=inscripcion_id,clase_id") if l["clase_id"] in ids_activas}
add = [{"inscripcion_id": i, "clase_id": c} for i, c in quiero - links]
if add: insert("inscripcion_clase", add)
for i, c in links - quiero: delete(f"inscripcion_clase?inscripcion_id=eq.{i}&clase_id=eq.{c}")
print(f"   enlaces: +{len(add)} · -{len(links - quiero)} · total {len(quiero)}")

# ── 5 · Verificar contra la base ─────────────────────────────────────────────
act = get("clase_semanal?select=id,colegio&deporte=eq.tenis&activa=eq.true")
vivas = get(f"inscripciones?select=id&activa=eq.true&academia_id=in.({ACA_IDS})")
con_link = {l["inscripcion_id"] for l in get("inscripcion_clase?select=inscripcion_id")}
sin_dia = [i["id"] for i in vivas if i["id"] not in con_link]
print(f"\n✅ Verificado: {len(act)} clases activas ({sum(1 for c in act if c['colegio'])} de colegio) · {len(vivas)} matrículas activas · {len(sin_dia)} niños sin día {sin_dia if sin_dia else ''}")
json.dump({k: v["id"] for k, v in demo_id.items()}, open(REPO + "/docs/demo-ninos-tenis-2026-09-30.json", "w"), indent=1)
