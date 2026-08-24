#!/usr/bin/env python3
"""Fusiona fichas de cliente duplicadas en UNA sola (la familia queda unificada).

Uso:
  python3 scripts/fusionar-fichas.py <ID_CONSERVA> <ID_BORRAR> [<ID_BORRAR2> ...]           (simulacro)
  python3 scripts/fusionar-fichas.py <ID_CONSERVA> <ID_BORRAR> [...] --apply                (escribe)

Qué hace (con la ficha CONSERVA como titular de la familia):
  - Miembros de las fichas a borrar -> se mueven a la ficha CONSERVA como hermanos.
  - Si un miembro tiene el MISMO documento que uno ya presente en CONSERVA, se
    DEDUPLICA: se rellenan los huecos (eps/rh/fecha/tipo/deportes) en el que se
    queda y se borra el repetido (no crea dos).
  - La operación por cliente_id (siigo_facturas, paquetes_cliente, cliente_documentos)
    se repunta a CONSERVA. La operación por miembro (inscripciones, asistencias) sigue
    al miembro automáticamente.
  - Se borra la ficha vacía. NO toca factura_a_nit de CONSERVA (se reporta el de las
    borradas por si hay que decidir).
  - Backup en /tmp antes de tocar. Simulacro por defecto.

⚠ Ojo con miembros SIN documento: no se pueden deduplicar por documento, así que se
mueven tal cual. Si es la misma persona, revísalo a mano.
"""
import json, urllib.request, urllib.error, sys, os, datetime

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
APPLY = "--apply" in sys.argv
if len(args) < 2:
    print("Uso: fusionar-fichas.py <ID_CONSERVA> <ID_BORRAR> [<ID_BORRAR2> ...] [--apply]")
    sys.exit(1)
KEEP = int(args[0]); DROPS = [int(x) for x in args[1:]]

env = {}
for line in open(REPO + "/.env"):
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1); env[k] = v.strip().strip('"')
URL = env["NEXT_PUBLIC_SUPABASE_URL"]; KEY = env["SUPABASE_SERVICE_ROLE_KEY"]

def req(m, p, b=None, pref=None):
    h = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
    if pref: h["Prefer"] = pref
    d = json.dumps(b).encode() if b is not None else None
    r = urllib.request.Request(URL + "/rest/v1/" + p, data=d, headers=h, method=m)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read(); return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise RuntimeError("%s %s -> %s %s" % (m, p[:50], e.code, e.read().decode()[:200]))

# Tablas de operación que cuelgan de cliente_id (se repuntan a KEEP).
OP_TABLES = ["siigo_facturas", "paquetes_cliente", "cliente_documentos"]

def ficha(cid):
    r = req("GET", "clientes?id=eq.%d&select=id,nombres,apellidos,documento,factura_a_nit&limit=1" % cid)
    return r[0] if r else None
def miembros(cid):
    return req("GET", "cliente_miembros?cliente_id=eq.%d&select=id,nombres,apellidos,documento,eps,rh,fecha_nacimiento,tipo_documento,deportes,es_titular" % cid)
def op_count(cid, t):
    return len(req("GET", "%s?cliente_id=eq.%d&select=id" % (t, cid)))

keep = ficha(KEEP)
if not keep:
    print("ERROR: la ficha CONSERVA #%d no existe." % KEEP); sys.exit(1)
keep_mem = {m["documento"]: m for m in miembros(KEEP) if m["documento"]}

print("CONSERVA #%d %s %s (factura_a_nit=%s)" % (KEEP, keep["nombres"], keep["apellidos"], keep["factura_a_nit"]))
plan = []
for D in DROPS:
    f = ficha(D)
    if not f:
        print("  ⚠ ficha a borrar #%d no existe, se omite" % D); continue
    acciones = []
    for m in miembros(D):
        if m["documento"] and m["documento"] in keep_mem:
            acciones.append(("dedup", m))
        else:
            acciones.append(("mover" + (" (SIN DOC)" if not m["documento"] else ""), m))
    ops = {t: op_count(D, t) for t in OP_TABLES}
    plan.append((D, f, acciones, ops))
    print("  BORRAR #%d %s %s (factura_a_nit=%s)" % (D, f["nombres"], f["apellidos"], f["factura_a_nit"]))
    for a, m in acciones:
        print("     %s: %s %s (doc %s%s)" % (a.upper(), m["nombres"], m["apellidos"], m["documento"], ", titular" if m["es_titular"] else ""))
    print("     operación a mover: %s" % ops)

if not APPLY:
    print("\n🔍 SIMULACRO — nada escrito. Agrega --apply para ejecutar.")
    sys.exit(0)

ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
bk = {"keep": keep, "keep_miembros": miembros(KEEP),
      "drops": [{"ficha": f, "miembros": miembros(D)} for D, f, _, _ in plan]}
path = "/tmp/cdaf-fusion-%d-%s.json" % (KEEP, ts)
open(path, "w").write(json.dumps(bk, indent=2, ensure_ascii=False))
print("\n💾 Backup: %s" % path)

moved = deld_m = deld_f = 0
for D, f, acciones, ops in plan:
    for a, m in acciones:
        if a.startswith("dedup"):
            dest = keep_mem[m["documento"]]
            body = {}
            for fld in ("eps", "rh", "fecha_nacimiento", "tipo_documento"):
                if m.get(fld) and not dest.get(fld): body[fld] = m[fld]
            nd = sorted(set(dest.get("deportes") or []) | set(m.get("deportes") or []))
            if nd != (dest.get("deportes") or []): body["deportes"] = nd
            if body: req("PATCH", "cliente_miembros?id=eq.%d" % dest["id"], body)
            req("DELETE", "cliente_miembros?id=eq.%d" % m["id"]); deld_m += 1
        else:
            req("PATCH", "cliente_miembros?id=eq.%d" % m["id"], {"cliente_id": KEEP, "es_titular": False}); moved += 1
    for t in OP_TABLES:
        req("PATCH", "%s?cliente_id=eq.%d" % (t, D), {"cliente_id": KEEP})
    req("DELETE", "cliente_miembros?cliente_id=eq.%d" % D)   # por si quedó alguno
    req("DELETE", "clientes?id=eq.%d" % D); deld_f += 1

print("✅ Miembros movidos %d · deduplicados %d · fichas borradas %d" % (moved, deld_m, deld_f))
