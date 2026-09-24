#!/usr/bin/env python3
"""Importa el PLANEADOR de academias del club (Excel → clase_semanal + matrícula).

Uso:
  python3 scripts/import-planeador.py "ruta/PLANEADOR BASE.xlsx"           (simulacro)
  python3 scripts/import-planeador.py "ruta/PLANEADOR BASE.xlsx" --apply   (escribe)

QUÉ HOJA SE LEE Y POR QUÉ
  Se lee **BASE DE DATOS**, no las rejillas por profesor. La rejilla tiene sitio
  para 4 nombres por bloque de 30 min y el 5º se cae a la fila de abajo, donde
  PARECE una clase nueva: medido, 13 bloques fantasma (la "clase de Jorge martes
  17:00" son en realidad los niños 5, 6 y 7 de la de las 16:30). BASE DE DATOS
  trae día + hora + DURACIÓN por niño y no tiene ese defecto.
  "CONSULTA" es esa misma tabla filtrada por fórmula: no aporta nada.

QUÉ ES UNA CLASE
  profesor + día + hora. La duración NO entra en la llave a propósito: Krystal
  García hace 60 min dentro de la clase de 90 de Graciano (lun y vie 16:00), y
  meterla en la llave partiría esa clase en dos. Se toma la duración
  predominante del grupo y las mezclas se reportan.

REGLAS DE SEGURIDAD
 - Simulacro por defecto; escribe solo con --apply.
 - Idempotente: las clases casan por (profesor, día, hora), las inscripciones
   por (academia, miembro) y los enlaces por (inscripción, clase).
 - NO inventa personas. El niño que no exista como `cliente_miembros` se
   reporta y se salta.
 - El documento se cruza junto con el NOMBRE. En el Excel hay 3 documentos que
   dos hermanos comparten (Clemente/Valentín Ramírez Arango, Elena/Matías
   Restrepo, Luciana Osorio/Ema Hoyos): cruzar solo por documento le metería la
   matrícula de uno al otro.
 - Monte Luna y Montessori: al principio se excluyeron; desde el 24-sep-2026 entran como CLASES DE
   COLEGIO (clase_semanal.colegio, sin niños). No están en BASE DE DATOS: se leen de la rejilla de
   cada profesor. Se pagan con la regla de academia de CADA profesor (Laura).
 - El CUPO no existe (decisión de Laura, 22-sep-2026): solo se cuenta cuántos van.
"""
import openpyxl, json, urllib.request, urllib.error, sys, os, unicodedata, re, warnings, datetime
from collections import defaultdict, Counter

warnings.filterwarnings("ignore")
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_args = [a for a in sys.argv[1:] if not a.startswith("--")]
XLSX = _args[0] if _args else REPO + "/PLANEADOR BASE.xlsx"
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
        raise RuntimeError(f"{method} {path[:70]} -> {e.code} {e.read().decode()[:300]}")

def get(path): return req("GET", path)
def insert(table, rows): return req("POST", table, rows, "return=representation")
def patch(path, body): return req("PATCH", path, body)

# ── Normalización ────────────────────────────────────────────────────────────
def nm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().upper()
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", s)).strip()
def dig(s): return re.sub(r"\D", "", str(s or ""))

DIA_NUM = {"DOM": 0, "LUN": 1, "MAR": 2, "MIE": 3, "JUE": 4, "VIE": 5, "SAB": 6}
COLEGIOS = {"MONTESSORI", "MONTELUNA", "MONTE LUNA"}

# Niños que el Excel escribe distinto a como están en la plataforma Y a los que
# además les puso un documento que no es suyo, así que no hay forma automática
# de cruzarlos. Va como lista explícita y no como emparejamiento difuso, porque
# esto decide a quién se le cobra: cada entrada lleva la evidencia que la
# sostiene. El mismo patrón de `easycancha_profesor_alias`.
#   · EMA HOYOS: el Excel le da el documento de Luciana Osorio (1040881722). La
#     plataforma tiene a "Emma Hoyos" (m425, doc 1035002652, nac 22-oct-2013 →
#     12 años), que es justo la edad del Excel; y la propia rejilla del club la
#     escribe "EMMA HOYOS". Verificado 22-sep-2026.
#   · VALENTIN RAMIREZ ARANGO: en la plataforma es "Valentin Ramirez" (m92),
#     TITULAR de la ficha 112, donde también está su hermano Clemente Ramírez
#     Arango (m371). Laura confirmó que es el niño (23-sep-2026). OJO: su
#     documento cargado es el de Clemente — ver pendientes en MEMORIA.
ALIAS_NINO = {
    "EMA HOYOS": "EMMA HOYOS",
    "VALENTIN RAMIREZ ARANGO": "VALENTIN RAMIREZ",
}

# Niños que están en el Excel pero NO deben cargarse. El planeador del club
# tiene filas viejas; cada entrada lleva quién lo decidió y cuándo, para que
# nadie la "arregle" creando a la persona.
NO_CARGAR = {
    "SARA SALAZAR": "no continúa en las academias (Laura, 23-sep-2026)",
}

# Duraciones que el Excel trae MAL y el club corrigió. La llave de la clase es
# (profesor, día, hora) y se toma la duración predominante; esto la fija y
# silencia el aviso de "duración mezclada", porque ya no es una duda.
#   · Krystal García: el Excel dice 60 min dentro de la clase de 90 de Graciano,
#     pero hace los 90 (Laura, 23-sep-2026).
DURACION_CONFIRMADA = {
    ("ESTEBAN GRACIANO", 1, "16:00"): 90,
    ("ESTEBAN GRACIANO", 5, "16:00"): 90,
}
# El Excel escribe los nombres cortos; la plataforma los tiene completos.
ALIAS_PROFESOR = {
    "JORGE": "Jorge Pérez",
    "CRISTIAN CASTRO": "Cristian Castro",
    "ESTEBAN GRACIANO": "Esteban Graciano",
    "SEBASTIAN NINO": "Sebastian Niño Mora",
    "YEISON BEDOYA": "Yeison Bedoya",
}

# ── 1 · Leer el Excel ────────────────────────────────────────────────────────
wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb["BASE DE DATOS"]
filas = []
for r in ws.iter_rows(min_row=3, values_only=True):
    nom, ape, doc, edad, aca, dia, hora, dur, prof = [
        str(x).strip() if x is not None else None for x in r[:9]
    ]
    if not nom or not prof or not dia or not hora:
        continue
    if nm(nom) in COLEGIOS or nm(f"{nom} {ape}") in COLEGIOS:
        continue
    if nm(f"{nom} {ape}") in NO_CARGAR:
        continue
    filas.append(dict(nom=nom, ape=ape or "", doc=doc, edad=edad, academia=aca,
                      dia=DIA_NUM[nm(dia)[:3]], hora=str(hora)[:5], dur=int(float(dur)),
                      profesor=nm(prof)))
print(f"Excel: {len(filas)} filas de academia (colegios excluidos)")
for n, por in NO_CARGAR.items(): print(f"  · no se carga {n}: {por}")

# ── 2 · Profesores ───────────────────────────────────────────────────────────
staff = get("profiles?select=id,nombre,activo")
por_nombre = {nm(p["nombre"]): p for p in staff if p["nombre"]}
prof_id, sin_profe = {}, set()
for clave in {f["profesor"] for f in filas}:
    destino = ALIAS_PROFESOR.get(clave)
    p = por_nombre.get(nm(destino)) if destino else por_nombre.get(clave)
    if p: prof_id[clave] = p["id"]
    else: sin_profe.add(clave)
if sin_profe:
    print(f"  ⚠️  profesores sin perfil en la plataforma: {sorted(sin_profe)}")
    filas = [f for f in filas if f["profesor"] not in sin_profe]

# ── 3 · Las clases del planeador ─────────────────────────────────────────────
slots = defaultdict(list)
for f in filas: slots[(f["profesor"], f["dia"], f["hora"])].append(f)
clases_plan, mezcla_dur = {}, []
for k, fs in slots.items():
    durs = Counter(x["dur"] for x in fs)
    if k in DURACION_CONFIRMADA:
        clases_plan[k] = DURACION_CONFIRMADA[k]
        continue
    dur = durs.most_common(1)[0][0]
    if len(durs) > 1: mezcla_dur.append((k, dict(durs)))
    clases_plan[k] = dur
print(f"Clases del planeador: {len(clases_plan)}")

# ── 3b · Clases de COLEGIO (Monte Luna, Montessori) ──────────────────────────
# Solo aparecen en la rejilla de cada profesor, no en BASE DE DATOS. Cada fila
# con hora abre un bloque de 30 min; una celda con el colegio en ese bloque =
# el colegio ocupa esa media hora. Bloques seguidos = una clase.
HOJA_PROFESOR = {
    "PLANEADOR SEMANAL JORGE PEREZ": "JORGE",
    "PLANEADOR SEMANAL CRISTIAN C": "CRISTIAN CASTRO",
    "PLANEADOR SEMANAL GRACIANO": "ESTEBAN GRACIANO",
    "PLANEADOR SEMANAL YEISON BEDOYA": "YEISON BEDOYA",
}
COL_DIA = {"B": 1, "E": 2, "H": 3, "K": 4, "N": 5, "Q": 6, "T": 0}
NOMBRE_COLEGIO = {"MONTESSORI": "Montessori", "MONTELUNA": "Monte Luna", "MONTE LUNA": "Monte Luna"}
# TODA clase de colegio (Monte Luna y Montessori) dura 1 hora (Laura, 24-sep-2026). La rejilla
# decía 120 min para las de Cristian y 30 para la de Graciano en Monte Luna: estaba mal.
DURACION_COLEGIO = 60
colegios_plan = {}  # (profesor, dia, hora) -> (duracion, colegio)
for hoja, clave in HOJA_PROFESOR.items():
    if hoja not in wb.sheetnames: continue
    g = wb[hoja]; bloque = None; vistos_b = defaultdict(set)
    for r in range(7, g.max_row + 1):
        a = g[f"A{r}"].value
        if a and re.match(r"\d\d:\d\d", str(a)): bloque = str(a)[:5]
        for col, dia in COL_DIA.items():
            v = nm(g[f"{col}{r}"].value)
            if v in NOMBRE_COLEGIO and bloque: vistos_b[(dia, NOMBRE_COLEGIO[v])].add(bloque)
    for (dia, col), bl in vistos_b.items():
        bl = sorted(bl)
        if 30 * len(bl) != DURACION_COLEGIO:
            print(f"  ⚠️  {clave} día {dia} {col}: el Excel ocupa {30 * len(bl)} min → se usa {DURACION_COLEGIO}")
        colegios_plan[(clave, dia, bl[0])] = (DURACION_COLEGIO, col)
for k, (d, col) in sorted(colegios_plan.items()):
    print(f"  colegio {col}: {k[0]} día {k[1]} {k[2]} · {d} min")
    if k[0] not in prof_id:
        p = por_nombre.get(nm(ALIAS_PROFESOR.get(k[0], k[0])))
        if p: prof_id[k[0]] = p["id"]
for k, d in mezcla_dur:
    print(f"  ⚠️  duración mezclada en {k}: {d} → se usa {clases_plan[k]} min")

# ── 4 · Cruzar los niños ─────────────────────────────────────────────────────
miembros = get("cliente_miembros?select=id,cliente_id,nombres,apellidos,documento,activo&activo=eq.true&limit=5000")
por_doc = defaultdict(list); por_nom = defaultdict(list)
for m in miembros:
    if m["documento"]: por_doc[dig(m["documento"])].append(m)
    por_nom[nm(f"{m['nombres']} {m['apellidos']}")].append(m)

# Un documento que DOS niños distintos del Excel reclaman es un hermano mal
# digitado (3 casos medidos). Ahí el documento deja de ser evidencia y manda el
# nombre; si el nombre tampoco casa, se reporta y se salta — fundirlos le dejaría
# la matrícula de uno al otro.
reclaman = defaultdict(set)
for f in filas: reclaman[dig(f["doc"])].add((f["nom"], f["ape"]))
COMPARTIDOS = {d for d, k in reclaman.items() if len(k) > 1}

def cruzar(nom, ape, doc):
    clave = nm(f"{nom} {ape}")
    clave = ALIAS_NINO.get(clave, clave)
    d = dig(doc)
    cands = por_doc.get(d, [])
    exacto = [m for m in cands if nm(f"{m['nombres']} {m['apellidos']}") == clave]
    if d in COMPARTIDOS:
        if len(exacto) == 1: return exacto[0], "documento compartido, resuelto por nombre"
        porn = por_nom.get(clave, [])
        if len(porn) == 1: return porn[0], "documento de un hermano; resuelto por nombre"
        return None, "documento que el Excel le da a dos hermanos"
    if len(exacto) == 1: return exacto[0], "documento+nombre"
    # El documento es de una sola persona: el nombre puede venir escrito distinto
    # ("Simon Velez" / "SIMON VÉLEZ") y aun así ser ella.
    if len(cands) == 1: return cands[0], "documento"
    if len(cands) > 1:
        # Ficha duplicada en la plataforma: se toma la más antigua y se avisa.
        elegido = min(cands, key=lambda m: m["id"])
        return elegido, f"OJO ficha duplicada (ids {sorted(m['id'] for m in cands)})"
    porn = por_nom.get(clave, [])
    if len(porn) == 1: return porn[0], "nombre único"
    if len(porn) > 1: return None, "nombre repetido y sin documento que lo separe"
    return None, "no existe en la plataforma"

ninos, sin_cruce, avisos, vistos = {}, [], [], set()
for f in filas:
    clave = (f["nom"], f["ape"])
    if clave in vistos: continue
    vistos.add(clave)
    m, como = cruzar(f["nom"], f["ape"], f["doc"])
    if m:
        ninos[clave] = m
        if como.startswith("OJO"): avisos.append((f["nom"], f["ape"], como))
    else:
        sin_cruce.append((f["nom"], f["ape"], f["doc"], como))
print(f"Niños: {len(ninos)} cruzados · {len(sin_cruce)} sin cruce (de {len(vistos)} en el Excel)")
for s_ in sin_cruce: print(f"  ⚠️  {s_[0]} {s_[1]} (doc {s_[2]}) — {s_[3]}")
for a in avisos: print(f"  ⚠️  {a[0]} {a[1]} — {a[2]}")

# ── 5 · Academias destino ────────────────────────────────────────────────────
acas = get("academias?select=id,codigo,categoria,deporte")
ACA = {a["categoria"]: a["id"] for a in acas if a["deporte"] == "tenis"}
def academia_de(txt): return ACA["competencia"] if nm(txt).startswith("COMP") else ACA["recreativa"]

# ── 6 · Plan de escritura ────────────────────────────────────────────────────
quiere_insc = {}   # miembro_id -> academia_id
quiere_link = set()  # (miembro_id, clave de clase)
for f in filas:
    m = ninos.get((f["nom"], f["ape"]))
    if not m: continue
    quiere_insc[m["id"]] = academia_de(f["academia"])
    quiere_link.add((m["id"], (f["profesor"], f["dia"], f["hora"])))

print(f"\nA escribir: {len(clases_plan)} clases + {len(colegios_plan)} de colegio · {len(quiere_insc)} inscripciones · {len(quiere_link)} enlaces niño-clase")

if not APPLY:
    print("\n(simulacro — nada se escribió. Agrega --apply para aplicar)")
    sys.exit(0)

# ── 7 · Escribir ─────────────────────────────────────────────────────────────
# ⚠️ TODO lo que sigue se limita a TENIS. Desde que entró pádel (24-sep-2026) este
# script retiraba a cualquiera que no estuviera en el Excel de tenis — o sea, a
# todos los niños de pádel — y les borraba sus clases. Cada deporte tiene su
# propio importador y ninguno toca al otro.
ya = {(c["profesor_id"], c["dia_semana"], c["hora_inicio"][:5]): c["id"]
      for c in get("clase_semanal?select=id,profesor_id,dia_semana,hora_inicio&activa=eq.true&deporte=eq.tenis")}
nuevas = [dict(profesor_id=prof_id[k[0]], deporte="tenis", dia_semana=k[1],
               hora_inicio=f"{k[2]}:00", duracion_min=d)
          for k, d in clases_plan.items()
          if (prof_id[k[0]], k[1], k[2]) not in ya]
nuevas += [dict(profesor_id=prof_id[k[0]], deporte="tenis", dia_semana=k[1], hora_inicio=f"{k[2]}:00",
                duracion_min=d, colegio=col, vigente_desde="2026-10-01")
           for k, (d, col) in colegios_plan.items()
           if (prof_id[k[0]], k[1], k[2]) not in ya]
for c in insert("clase_semanal", nuevas) if nuevas else []:
    ya[(c["profesor_id"], c["dia_semana"], c["hora_inicio"][:5])] = c["id"]
print(f"clase_semanal: +{len(nuevas)} (total {len(ya)})")

vivas = get("inscripciones?select=id,miembro_id,academia_id,activa&academia_id=in.(" + ",".join(str(v) for v in ACA.values()) + ")")
insc_id = {}
for i in vivas:
    if i["activa"] and i["miembro_id"]: insc_id[i["miembro_id"]] = i
faltan = [dict(academia_id=a, cliente_id=next(m["cliente_id"] for m in miembros if m["id"] == mid),
               miembro_id=mid)
          for mid, a in quiere_insc.items() if mid not in insc_id]
for i in insert("inscripciones", faltan) if faltan else []:
    insc_id[i["miembro_id"]] = i
# Al que cambió de categoría se le mueve la inscripción, no se le crea otra.
movidos = 0
for mid, a in quiere_insc.items():
    cur = insc_id.get(mid)
    if cur and cur["academia_id"] != a:
        patch(f"inscripciones?id=eq.{cur['id']}", {"academia_id": a}); movidos += 1
print(f"inscripciones: +{len(faltan)} nuevas · {movidos} cambiaron de academia")

# Al que ya no está en el planeador se le RETIRA (no se borra: la asistencia
# pasada tiene que poder explicarse).
fuera = [i for mid, i in insc_id.items() if mid not in quiere_insc]
for i in fuera:
    patch(f"inscripciones?id=eq.{i['id']}", {"activa": False, "retirada_el": datetime.date.today().isoformat()})
print(f"inscripciones retiradas (ya no están en el planeador): {len(fuera)}")

clases_tenis = set(ya.values())
links_ya = {(l["inscripcion_id"], l["clase_id"]) for l in get("inscripcion_clase?select=inscripcion_id,clase_id&limit=5000")
            if l["clase_id"] in clases_tenis}
quiero = set()
for mid, k in quiere_link:
    i = insc_id.get(mid); c = ya.get((prof_id[k[0]], k[1], k[2]))
    if i and c: quiero.add((i["id"], c))
add = [dict(inscripcion_id=i, clase_id=c) for i, c in quiero - links_ya]
if add: insert("inscripcion_clase", add)
sobran = links_ya - quiero
for i, c in sobran:
    req("DELETE", f"inscripcion_clase?inscripcion_id=eq.{i}&clase_id=eq.{c}")
print(f"inscripcion_clase: +{len(add)} · -{len(sobran)} (total {len(quiero)})")
print("\n✅ Listo.")
