#!/usr/bin/env python3
"""Importa una BBD de niños de academias (formato ANCHO) a clientes/cliente_miembros.

Uso:
  python3 scripts/import-ninos-academias.py "ruta/al/archivo.xlsx"            (simulacro)
  python3 scripts/import-ninos-academias.py "ruta/al/archivo.xlsx" --apply    (escribe)
  (sin ruta usa el archivo por defecto en la raíz del proyecto)

Formato esperado: hojas por deporte; una FILA = una familia; el primer niño en las
columnas 0-8, datos del acudiente/facturación en 9-17, y hasta 4 hermanos más en
bloques de 9 columnas (18, 27, 36, 45). Cada bloque de niño:
Nombre, Apellidos, Documento, FechaNac, Celular, Correo, EPS, RH, Deporte.

Simulacro por defecto; escribe con --apply. Idempotente: cruza por documento, así
que re-correrlo actualiza en vez de duplicar.

Reglas de seguridad:
 - NO fija factura_a_nit (no auto-atribuye plata de Siigo). Guarda tipo/correo/nombre.
 - No pisa datos existentes no vacíos (solo rellena huecos) salvo deportes (une).
 - Familias con niños en 2 fichas distintas o menores sin acudiente: se REPORTAN y se saltan.
 - Backup de las filas que se van a actualizar, antes de tocar.
"""
import openpyxl, json, urllib.request, urllib.error, sys, os, datetime

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_args = [a for a in sys.argv[1:] if not a.startswith("--")]
XLSX = _args[0] if _args else REPO + "/BBD CDAF Niños Academias y Particulares.xlsx"
APPLY = "--apply" in sys.argv
HOY = datetime.date.today()

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
        raise RuntimeError(f"{method} {path[:40]} -> {e.code} {e.read().decode()[:200]}")

def get(path): return req("GET", path)
def insert(table, row): return req("POST", table, [row], "return=representation")[0]
def patch(table, cond, body): return req("PATCH", f"{table}?{cond}", body, "return=representation")

def clean(v):
    if v is None: return ""
    if isinstance(v, datetime.datetime): return v.date().isoformat()
    if isinstance(v, datetime.date): return v.isoformat()
    s = str(v).strip()
    if s.endswith(".0") and s[:-2].isdigit(): s = s[:-2]
    return s

def titulo(s):
    return " ".join(w.capitalize() for w in s.split()) if s else s

PREFIJOS = ("PPT", "NIT", "RC", "TI", "CC", "CE", "PP")
def parse_doc(v):
    s = clean(v).upper().replace(".", "").replace(" ", "").replace("-", "")
    if not s: return (None, None)
    for p in PREFIJOS:
        if s.startswith(p) and s[len(p):].isdigit() and len(s) > len(p):
            return (s[len(p):], p)
    if s.isdigit(): return (s, None)
    return (s, "PP")  # alfanumérico raro -> pasaporte

def edad(fnac):
    if not fnac: return None
    try: d = datetime.date.fromisoformat(fnac)
    except Exception: return None
    return HOY.year - d.year - ((HOY.month, HOY.day) < (d.month, d.day))

def tipo_edad(e):
    if e is None: return None
    return "RC" if e < 7 else "TI" if e < 18 else "CC"

def norm_rh(v):
    s = clean(v).upper().replace(" ", "").replace("0", "O")
    return s if s in ("O+","O-","A+","A-","B+","B-","AB+","AB-") else None

def norm_dep(v):
    s = clean(v).upper()
    return "padel" if "PAD" in s else "tenis" if "TEN" in s else None

def child(row, s):
    nom, ape = clean(row[s]), clean(row[s+1])
    if not nom and not ape: return None
    doc, pref = parse_doc(row[s+2])
    fnac = clean(row[s+3]); e = edad(fnac)
    dep = norm_dep(row[s+8])
    return {"nombres": titulo(nom), "apellidos": titulo(ape), "documento": doc,
            "tipo_documento": pref or tipo_edad(e), "fecha_nacimiento": fnac or None,
            "eps": clean(row[s+6]) or None, "rh": norm_rh(row[s+7]),
            "celular": clean(row[s+4]) or None, "correo": (clean(row[s+5]) or None),
            "deportes": [dep] if dep else [], "edad": e}

# ── 1) Leer filas -> familias crudas ──
wb = openpyxl.load_workbook(XLSX, data_only=True)
STARTS = [0, 18, 27, 36, 45]
raw = []
for ws in wb.worksheets:
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r: continue
        row = list(r) + [None] * (54 - len(r))
        if not clean(row[0]) and not clean(row[1]): continue
        kids = [c for c in (child(row, s) for s in STARTS) if c]
        if not kids: continue
        fr = clean(row[14])
        raw.append({"kids": kids,
            "acu_nombre": titulo(clean(row[9])) or None, "acu_doc": parse_doc(row[10])[0],
            "acu_correo": clean(row[11]) or None, "acu_cel": clean(row[12]) or None,
            "acu_parent": titulo(clean(row[13])) or None,
            "fact_raw": fr, "fact_nit": (clean(row[15]).split("-")[0] or None),
            "fact_email": clean(row[16]) or None})

# ── 2) Unir familias que comparten documento de niño o de acudiente ──
par = list(range(len(raw)))
def find(x):
    while par[x] != x: par[x] = par[par[x]]; x = par[x]
    return x
seen = {}
for i, f in enumerate(raw):
    for key in [("d", k["documento"]) for k in f["kids"] if k["documento"]] + ([("a", f["acu_doc"])] if f["acu_doc"] else []):
        if key in seen: par[find(i)] = find(seen[key])
        else: seen[key] = i
groups = {}
for i in range(len(raw)): groups.setdefault(find(i), []).append(i)

families = []
for idxs in groups.values():
    fam = {"kids": {}, "acu_nombre": None, "acu_doc": None, "acu_correo": None,
           "acu_cel": None, "acu_parent": None, "fact_raw": "", "fact_nit": None, "fact_email": None}
    for i in idxs:
        f = raw[i]
        for fld in ("acu_nombre","acu_doc","acu_correo","acu_cel","acu_parent","fact_nit","fact_email"):
            if not fam[fld] and f[fld]: fam[fld] = f[fld]
        if not fam["fact_raw"] and f["fact_raw"]: fam["fact_raw"] = f["fact_raw"]
        for k in f["kids"]:
            key = k["documento"] or (k["nombres"] + "|" + k["apellidos"]).lower()
            if key in fam["kids"]:
                ex = fam["kids"][key]
                ex["deportes"] = sorted(set(ex["deportes"]) | set(k["deportes"]))
                for fld in ("fecha_nacimiento","eps","rh","tipo_documento","documento","celular","correo"):
                    if not ex.get(fld) and k.get(fld): ex[fld] = k[fld]
            else:
                fam["kids"][key] = dict(k)
    fam["kids"] = list(fam["kids"].values())
    families.append(fam)

# ── 3) Estado actual en la BD (por documento de niño) ──
alldocs = sorted({k["documento"] for f in families for k in f["kids"] if k["documento"]})
def fetch(table, cols, docs):
    out = []
    for i in range(0, len(docs), 60):
        vals = ",".join('"' + d + '"' for d in docs[i:i+60])
        out += get(f"{table}?select={cols}&documento=in.({vals})")
    return out
cli = {r["documento"]: r for r in fetch("clientes", "id,documento,eps,rh,fecha_nacimiento,tipo_documento,deportes", alldocs)}
mie = {r["documento"]: r for r in fetch("cliente_miembros", "id,cliente_id,documento,eps,rh,fecha_nacimiento,tipo_documento,deportes,es_titular", alldocs)}

def fact_tipo_nombre(fam):
    s = fam["fact_raw"] or ""; low = s.lower()
    if "jurid" in low:
        comp = None
        for sep in ("-", ":"):
            if sep in s: comp = titulo(s.split(sep, 1)[1].strip()); break
        return "juridica", (comp or None)
    if "natural" in low:
        return "natural", fam["acu_nombre"]
    return None, fam["acu_nombre"]

# ── 4) Planear ──
plan_new, plan_attach, ambiguos, sin_acu = [], [], [], []
for fam in families:
    cids = set()
    for k in fam["kids"]:
        d = k["documento"]
        if d and d in mie: cids.add(mie[d]["cliente_id"])
        elif d and d in cli: cids.add(cli[d]["id"])
    menor_sin_acu = any((k["edad"] is not None and k["edad"] < 18) for k in fam["kids"]) and not fam["acu_nombre"]
    if len(cids) > 1:
        ambiguos.append((fam, cids)); continue
    if len(cids) == 0 and menor_sin_acu:
        sin_acu.append(fam); continue
    (plan_attach if cids else plan_new).append((fam, next(iter(cids)) if cids else None))

def resumen():
    nk = lambda P: sum(len(f["kids"]) for f, _ in P)
    print(f"Familias en el archivo (tras unir): {len(families)}")
    print(f"  NUEVAS (crear ficha): {len(plan_new)}  · niños: {nk(plan_new)}")
    print(f"  ATTACH (a ficha existente): {len(plan_attach)} · niños: {nk(plan_attach)}")
    print(f"  ⚠ AMBIGUAS (niños en >1 ficha, se saltan): {len(ambiguos)}")
    for f, c in ambiguos: print(f"      {[k['nombres']+' '+k['apellidos'] for k in f['kids']]} -> fichas {c}")
    print(f"  ⚠ MENOR SIN ACUDIENTE (se saltan): {len(sin_acu)}")
    for f in sin_acu: print(f"      {[k['nombres']+' '+k['apellidos'] for k in f['kids']]}")
    # cuántos niños nuevos vs a actualizar
    nuevos = sum(1 for f, _ in plan_new + plan_attach for k in f["kids"] if not (k["documento"] and (k["documento"] in mie or k["documento"] in cli)))
    upd = sum(1 for f, _ in plan_new + plan_attach for k in f["kids"] if k["documento"] and (k["documento"] in mie or k["documento"] in cli))
    print(f"  niños a CREAR: {nuevos} · a ACTUALIZAR (ya existen): {upd}")
    ft = {}
    for f in families:
        t, _ = fact_tipo_nombre(f); ft[t] = ft.get(t, 0) + 1
    print(f"  facturación por tipo: {ft}")

resumen()

if not APPLY:
    print("\n🔍 SIMULACRO — no se escribió nada. Con --apply escribe.")
    sys.exit(0)

# ── 5) Backup de lo que se va a actualizar ──
ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
bkids = [mie[k["documento"]] for f, _ in plan_new + plan_attach for k in f["kids"] if k["documento"] in mie]
bcli = [cli[k["documento"]] for f, _ in plan_new + plan_attach for k in f["kids"] if k["documento"] in cli]
open(f"/tmp/cdaf-import-ninos-backup-{ts}.json", "w").write(json.dumps({"cliente_miembros": bkids, "clientes": bcli}, indent=2))
print(f"\n💾 Backup: /tmp/cdaf-import-ninos-backup-{ts}.json")

def merge_dep(exist, nuevos):
    return sorted(set(exist or []) | set(nuevos or []))

def upsert_kid_member(k, cliente_id):
    """Crea o actualiza el miembro del niño en la ficha cliente_id."""
    d = k["documento"]
    m = mie.get(d)
    if m:
        body = {"cliente_id": cliente_id}
        for fld in ("eps", "rh", "fecha_nacimiento", "tipo_documento"):
            if k.get(fld) and not m.get(fld): body[fld] = k[fld]
        nd = merge_dep(m.get("deportes"), k["deportes"])
        if nd != (m.get("deportes") or []): body["deportes"] = nd
        patch("cliente_miembros", f"id=eq.{m['id']}", body)
        return "upd"
    # ¿existe como su propia ficha clientes? entonces su miembro titular ya está: se maneja aparte
    insert("cliente_miembros", {"cliente_id": cliente_id, "nombres": k["nombres"], "apellidos": k["apellidos"],
        "fecha_nacimiento": k["fecha_nacimiento"], "documento": d, "tipo_documento": k["tipo_documento"],
        "eps": k["eps"], "rh": k["rh"], "deportes": k["deportes"], "es_titular": False})
    return "new"

def crear_acudiente(fam):
    if not fam["acu_nombre"]: return None
    return insert("acudientes", {"nombre": fam["acu_nombre"], "documento": fam["acu_doc"],
        "telefono": fam["acu_cel"], "parentesco": fam["acu_parent"]})["id"]

creados_fichas = creados_mie = act_mie = 0
for fam, _ in plan_new:
    tipo_f, nombre_f = fact_tipo_nombre(fam)
    acu_id = crear_acudiente(fam)
    first = fam["kids"][0]
    menor = first["edad"] is not None and first["edad"] < 18
    ficha = insert("clientes", {"nombres": first["nombres"], "apellidos": first["apellidos"],
        "documento": first["documento"], "tipo_documento": first["tipo_documento"],
        "eps": first["eps"], "rh": first["rh"], "fecha_nacimiento": first["fecha_nacimiento"],
        "es_menor": menor, "celular": first["celular"] or fam["acu_cel"], "email": first["correo"] or fam["acu_correo"],
        "deportes": first["deportes"], "acudiente_id": acu_id,
        "factura_a_nombre": nombre_f, "factura_tipo": tipo_f, "factura_email": fam["fact_email"]})
    creados_fichas += 1
    cid = ficha["id"]
    # el trigger creó el titular = first; el resto van como miembros
    for k in fam["kids"][1:]:
        r = upsert_kid_member(k, cid); creados_mie += (r == "new"); act_mie += (r == "upd")

for fam, cid in plan_attach:
    tipo_f, nombre_f = fact_tipo_nombre(fam)
    # completar acudiente/facturación de la ficha solo si están vacíos
    fic = get(f"clientes?select=id,acudiente_id,factura_tipo,factura_email,factura_a_nombre&id=eq.{cid}")[0]
    upd = {}
    if not fic["acudiente_id"] and fam["acu_nombre"]:
        upd["acudiente_id"] = crear_acudiente(fam)
    for col, val in (("factura_tipo", tipo_f), ("factura_email", fam["fact_email"]), ("factura_a_nombre", nombre_f)):
        if val and not fic[col]: upd[col] = val
    if upd: patch("clientes", f"id=eq.{cid}", upd)
    for k in fam["kids"]:
        # si el niño ES su propia ficha titular (cli), actualizar esa ficha; el trigger espeja
        if k["documento"] in cli and cli[k["documento"]]["id"] == cid:
            body = {}
            c = cli[k["documento"]]
            for fld in ("eps", "rh", "fecha_nacimiento", "tipo_documento"):
                if k.get(fld) and not c.get(fld): body[fld] = k[fld]
            nd = merge_dep(c.get("deportes"), k["deportes"])
            if nd != (c.get("deportes") or []): body["deportes"] = nd
            if body: patch("clientes", f"id=eq.{cid}", body)
            act_mie += 1
        else:
            r = upsert_kid_member(k, cid); creados_mie += (r == "new"); act_mie += (r == "upd")

print(f"\n✅ Aplicado: fichas nuevas {creados_fichas} · miembros nuevos {creados_mie} · actualizados {act_mie}")
