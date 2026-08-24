#!/usr/bin/env python3
"""Importa la MATRÍCULA de las academias: grupos, franjas e inscripciones.

Uso:
  python3 scripts/import-grupos-academias.py "ruta/al/archivo.xlsx"           (simulacro)
  python3 scripts/import-grupos-academias.py "ruta/al/archivo.xlsx" --apply   (escribe)

Qué NO hace: no crea personas. De eso se encarga `import-ninos-academias.py`, que
carga clientes y cliente_miembros desde el archivo ANCHO. Este toma el archivo
LARGO (una fila = un niño y un día) y arma encima la matrícula:

    academia → grupo (nivel + rango de edad) → franjas → niños inscritos

Formato esperado (hoja "Inscritos"):
  Nombres · Apellidos · Documento · Edad · Deporte · Academia · Nivel · Día ·
  Hora · Duración (min) · Profesor · Cancha

Reglas de seguridad:
 - Simulacro por defecto; escribe solo con --apply.
 - Idempotente: los grupos casan por (academia, nombre), las franjas por
   (grupo, día, hora) y las inscripciones por (academia, miembro). Re-correrlo
   no duplica.
 - Un documento usado por DOS NIÑOS DISTINTOS se REPORTA y se salta entero. Sin
   eso, la plataforma los fundiría en una persona y la asistencia de uno le
   quedaría al otro (ver docs/academias-tenis-datos-a-revisar.md).
 - Un niño que no exista ya como `cliente_miembros` se reporta y se salta: este
   script no inventa personas.
 - El CUPO no bloquea (decisión de Laura): las franjas que lo superan se avisan.
"""
import openpyxl, json, urllib.request, urllib.error, sys, os, unicodedata, re
from collections import defaultdict

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_args = [a for a in sys.argv[1:] if not a.startswith("--")]
XLSX = _args[0] if _args else REPO + "/Copia de CDAF-academias-inscritos.xlsx"
APPLY = "--apply" in sys.argv

env = {}
for line in open(REPO + "/.env"):
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1); env[k] = v.strip().strip('"')
URL = env["NEXT_PUBLIC_SUPABASE_URL"]; KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
HDR = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

def req(method, path, body=None, prefer=None):
    h = dict(HDR)
    if prefer: h["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL + "/rest/v1/" + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read(); return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path[:60]} -> {e.code} {e.read().decode()[:300]}")

def get(path): return req("GET", path)
def insert(table, row): return req("POST", table, [row], "return=representation")[0]

# ── Definición de los grupos. El nombre y el rango son EDITABLES después desde
#    la app; esto es solo el punto de partida para la carga inicial.
GRUPOS = [
    ("tenis", "recreativa",  "Dumbo",         "iniciacion",  3,  6),
    ("tenis", "recreativa",  "Bambi",         "iniciacion",  7,  9),
    ("tenis", "recreativa",  "Pluto",         "intermedio",  7, 10),
    ("tenis", "recreativa",  "Mulán",         "intermedio", 11, 16),
    ("tenis", "recreativa",  "Stitch",        "avanzado",    7,  9),
    ("tenis", "recreativa",  "Hércules",      "avanzado",   13, 16),
    ("tenis", "competencia", "Nadal",         "intermedio",  9, 11),
    ("tenis", "competencia", "Federer",       "avanzado",   10, 12),
    ("tenis", "competencia", "Djokovic",      "avanzado",   13, 16),
]
NIVEL = {"iniciación": "iniciacion", "iniciacion": "iniciacion",
         "intermedio": "intermedio", "avanzado": "avanzado"}
DIA = {"dom": 0, "lun": 1, "mar": 2, "mié": 3, "mie": 3, "jue": 4, "vie": 5, "sáb": 6, "sab": 6}
CUPO = {"iniciacion": 6, "intermedio": 5, "avanzado": 4}

def txt(v): return "" if v is None else str(v).strip()
def doc(v): return txt(v).replace(".0", "")
def entero(v):
    try: return int(float(v))
    except Exception: return None
def hhmm(v):
    m = re.match(r"^(\d{1,2}):(\d{2})", txt(v))
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else ""
def mas_min(h, mins):
    hh, mm = map(int, h.split(":")); t = hh * 60 + mm + mins
    return f"{t // 60:02d}:{t % 60:02d}"
def clave_profe(n):
    """Misma normalización que claveProfesor() en easycancha/client.ts."""
    c = unicodedata.normalize("NFD", txt(n))
    c = "".join(ch for ch in c if unicodedata.category(ch) != "Mn").lower()
    c = re.sub(r"[^a-z0-9\s]", " ", c)
    c = re.sub(r"\b(profesor|entrenador|profe)\b", " ", c)
    return re.sub(r"\s+", " ", c).strip()

# ─────────────────────────── Leer el archivo ───────────────────────────
ws = openpyxl.load_workbook(XLSX, data_only=True)["Inscritos"]
filas = []
for i, r in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
    if not r[0]: continue
    filas.append({"fila": i, "nom": txt(r[0]), "ape": txt(r[1]), "doc": doc(r[2]),
                  "edad": entero(r[3]), "dep": txt(r[4]).lower(), "aca": txt(r[5]).lower(),
                  "niv": NIVEL.get(txt(r[6]).lower(), ""), "dia": DIA.get(txt(r[7]).lower()[:3], None),
                  "hora": hhmm(r[8]), "dur": entero(r[9]) or 60,
                  "profe": txt(r[10]), "cancha": doc(r[11])})

print(f"Archivo: {os.path.basename(XLSX)}")
print(f"Filas con datos: {len(filas)}\n")

problemas = defaultdict(list)

# ── 1. Documentos compartidos por niños DISTINTOS: se saltan enteros ──
por_doc = defaultdict(set)
for f in filas: por_doc[f["doc"]].add((f["nom"], f["ape"]))
docs_malos = {d for d, ns in por_doc.items() if d and len(ns) > 1}
for d in sorted(docs_malos):
    quienes = " / ".join(sorted(f"{n} {a}" for n, a in por_doc[d]))
    problemas["Documento usado por dos niños distintos (se saltan)"].append(f"{d} → {quienes}")

# ── 2. Catálogos de la plataforma ──
academias = {}
for a in get("academias?select=id,codigo,deporte,categoria&activa=eq.true"):
    academias[(a["deporte"], a["categoria"])] = a["id"]
profes = {}
for p in get("profiles?select=id,nombre&activo=eq.true"):
    k = clave_profe(p["nombre"])
    if k: profes[k] = p["id"]

def buscar_profe(nombre):
    """Casa el profesor del Excel contra `profiles`.

    Exacto primero. Si no, por PREFIJO y solo si es inequívoco: el Excel trae
    nombres cortos ("Jorge", "Sebastián Niño") y la plataforma los tiene
    completos ("Jorge Pérez", "Sebastian Niño Mora"). Si el prefijo casa con dos
    personas se devuelve ambiguo, para no atribuirle clases a quien no es.
    """
    k = clave_profe(nombre)
    if not k: return None, None
    if k in profes: return profes[k], None
    cand = [(kk, v) for kk, v in profes.items() if kk.startswith(k + " ") or k.startswith(kk + " ")]
    if len(cand) == 1: return cand[0][1], None
    if len(cand) > 1: return None, "ambiguo: " + ", ".join(kk for kk, _ in cand)
    return None, "sin coincidencia"
miembros = {}
for m in get("cliente_miembros?select=id,documento,nombres,apellidos&activo=eq.true&documento=not.is.null"):
    if m["documento"]: miembros[m["documento"].strip()] = m["id"]

def grupo_de(dep, aca, niv, edad):
    for d, a, nom, n, lo, hi in GRUPOS:
        if d == dep and a == aca and n == niv and edad is not None and lo <= edad <= hi:
            return nom
    return None

# ── 3. Clasificar cada fila ──
plan_grupos, plan_franjas, plan_insc = {}, {}, {}
validas = 0
for f in filas:
    if f["doc"] in docs_malos: continue
    quien = f"{f['nom']} {f['ape']} (fila {f['fila']})"
    if (f["dep"], f["aca"]) not in academias:
        problemas["Academia desconocida"].append(f"{quien}: {f['dep']}/{f['aca']}"); continue
    if not f["niv"]:
        problemas["Nivel no reconocido"].append(quien); continue
    if f["dia"] is None or not f["hora"]:
        problemas["Día u hora ilegibles"].append(quien); continue
    mid = miembros.get(f["doc"])
    if not mid:
        problemas["El niño no existe en la plataforma (córrelo antes con import-ninos-academias.py)"].append(
            f"{quien} doc {f['doc']}"); continue
    g = grupo_de(f["dep"], f["aca"], f["niv"], f["edad"])
    if not g:
        problemas["Ningún grupo cubre su edad+nivel (revisar con el club)"].append(
            f"{quien}: {f['aca']} {f['niv']} {f['edad']} años"); continue
    pid, motivo = buscar_profe(f["profe"])
    if f["profe"] and not pid:
        problemas[f"Profesor no encontrado (la franja queda sin profesor)"].append(
            f"{quien}: '{f['profe']}' — {motivo}")

    aca_id = academias[(f["dep"], f["aca"])]
    plan_grupos[(aca_id, g)] = next(x for x in GRUPOS if x[2] == g)
    kf = (aca_id, g, f["dia"], f["hora"])
    plan_franjas.setdefault(kf, {"dur": f["dur"], "profe": pid, "cancha": f["cancha"], "niv": f["niv"], "ninos": set()})
    plan_franjas[kf]["ninos"].add(mid)
    plan_insc.setdefault((aca_id, mid), {"grupo": g, "nombre": f"{f['nom']} {f['ape']}", "franjas": set()})
    plan_insc[(aca_id, mid)]["franjas"].add(kf)
    validas += 1

# ── 4. Informe ──
print(f"{'='*70}\nQUÉ SE VA A CREAR\n{'='*70}")
print(f"  Grupos ............ {len(plan_grupos)}")
print(f"  Franjas ........... {len(plan_franjas)}")
print(f"  Niños inscritos ... {len(plan_insc)}")
print(f"  Filas usadas ...... {validas} de {len(filas)}\n")

print("GRUPOS")
for (aca_id, nom), (d, a, _, niv, lo, hi) in sorted(plan_grupos.items(), key=lambda x: (x[1][1], x[1][3], x[1][4])):
    fr = [k for k in plan_franjas if k[1] == nom]
    ninos = {m for k in fr for m in plan_franjas[k]["ninos"]}
    print(f"  {nom:10s} {a:11s} {niv:10s} {lo:2d}-{hi:2d} años · {len(fr):2d} franjas · {len(ninos):2d} niños")

sobre = [(k, v) for k, v in plan_franjas.items() if len(v["ninos"]) > CUPO[v["niv"]]]
if sobre:
    print(f"\n⚠️  FRANJAS SOBRE EL CUPO ({len(sobre)}) — se cargan igual, solo se avisa")
    DIAS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"]
    for k, v in sorted(sobre, key=lambda x: -len(x[1]["ninos"])):
        print(f"     {k[1]:10s} {DIAS[k[2]]} {k[3]} → {len(v['ninos'])} niños (tope {CUPO[v['niv']]})")

if problemas:
    print(f"\n{'='*70}\nSE SALTAN / REVISAR\n{'='*70}")
    for t, xs in problemas.items():
        print(f"\n{t} ({len(xs)}):")
        for x in xs[:12]: print(f"   · {x}")
        if len(xs) > 12: print(f"   … y {len(xs)-12} más")

# ── 5. Escribir ──
if not APPLY:
    print(f"\n{'='*70}\nSIMULACRO — no se escribió nada. Corre con --apply para aplicar.\n{'='*70}")
    sys.exit(0)

print(f"\n{'='*70}\nESCRIBIENDO\n{'='*70}")
gid = {}
for (aca_id, nom), (d, a, _, niv, lo, hi) in plan_grupos.items():
    ya = get(f"academia_grupo?select=id&academia_id=eq.{aca_id}&nombre=eq.{urllib.parse.quote(nom)}")
    gid[(aca_id, nom)] = ya[0]["id"] if ya else insert("academia_grupo", {
        "academia_id": aca_id, "nombre": nom, "nivel": niv, "edad_min": lo, "edad_max": hi})["id"]
print(f"  grupos listos: {len(gid)}")

fid = {}
for k, v in plan_franjas.items():
    aca_id, nom, dia, hora = k
    g = gid[(aca_id, nom)]
    ya = get(f"grupo_franja?select=id&grupo_id=eq.{g}&dia_semana=eq.{dia}&hora_inicio=eq.{hora}:00")
    fid[k] = ya[0]["id"] if ya else insert("grupo_franja", {
        "grupo_id": g, "dia_semana": dia, "hora_inicio": hora, "hora_fin": mas_min(hora, v["dur"]),
        "profesor_id": v["profe"], "cancha": v["cancha"] or None})["id"]
print(f"  franjas listas: {len(fid)}")

n_ins = n_lnk = 0
for (aca_id, mid), v in plan_insc.items():
    ya = get(f"inscripciones?select=id&academia_id=eq.{aca_id}&miembro_id=eq.{mid}")
    if ya:
        iid = ya[0]["id"]
        req("PATCH", f"inscripciones?id=eq.{iid}", {"grupo_id": gid[(aca_id, v['grupo'])]})
    else:
        cli = get(f"cliente_miembros?select=cliente_id&id=eq.{mid}")[0]["cliente_id"]
        iid = insert("inscripciones", {"academia_id": aca_id, "cliente_id": cli, "miembro_id": mid,
                                       "grupo_id": gid[(aca_id, v["grupo"])]})["id"]
        n_ins += 1
    for kf in v["franjas"]:
        f_id = fid[kf]
        if not get(f"inscripcion_franja?select=id&inscripcion_id=eq.{iid}&franja_id=eq.{f_id}"):
            insert("inscripcion_franja", {"inscripcion_id": iid, "franja_id": f_id}); n_lnk += 1

print(f"  inscripciones nuevas: {n_ins} · enlaces niño↔franja: {n_lnk}")
print("\n✅ Listo.")
