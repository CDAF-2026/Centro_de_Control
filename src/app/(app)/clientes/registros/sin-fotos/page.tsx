import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PUEDE_REVISAR_REGISTROS } from "@/lib/registro/revision";
import { edadDesde } from "@/lib/validations/cliente";
import { fechaHoraCorta } from "@/lib/fecha";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CameraOff } from "lucide-react";

/**
 * Niños cuyo acudiente NO autorizó fotos y videos (23-oct-2026): el club ve de un vistazo a
 * quién no puede publicar. Sale de `consentimiento_firma.autoriza_imagen = false` (la casilla
 * SÍ/NO de menores, desde el 18-oct). Vale la firma MÁS RECIENTE asignada de cada niño, la misma
 * regla de la ficha: si después firmaron que SÍ, ya no sale. Las firmas aún sin asignar también
 * cuentan (el NO ya está dado aunque falte escoger la ficha); las anuladas no.
 */
export default async function SinFotosPage() {
  await requireRole(PUEDE_REVISAR_REGISTROS);
  const supabase = await createClient();

  const { data: noAutorizan } = await supabase
    .from("consentimiento_firma")
    .select("id, miembro_id, cliente_id, estado, menor_nombre, menor_documento, firmante_nombre, firmante_parentesco, firmado_el")
    .eq("autoriza_imagen", false)
    .in("estado", ["asignada", "pendiente_asignar"])
    .order("firmado_el", { ascending: false });

  const miembroIds = Array.from(new Set((noAutorizan ?? []).map((f) => f.miembro_id).filter((x): x is number => x != null)));
  const [{ data: firmasMiembros }, { data: miembros }, { data: inscripciones }, { data: listaAcademias }] = miembroIds.length
    ? await Promise.all([
        supabase.from("consentimiento_firma").select("id, miembro_id").in("miembro_id", miembroIds).eq("estado", "asignada").order("firmado_el", { ascending: false }),
        supabase.from("cliente_miembros").select("id, nombres, apellidos, documento, fecha_nacimiento").in("id", miembroIds),
        supabase.from("inscripciones").select("miembro_id, academia_id").in("miembro_id", miembroIds).eq("activa", true),
        supabase.from("academias").select("id, nombre"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  // La firma vigente de cada niño es la más reciente asignada.
  const vigente = new Map<number, string>();
  for (const f of firmasMiembros ?? []) if (f.miembro_id != null && !vigente.has(f.miembro_id)) vigente.set(f.miembro_id, f.id);
  const miembro = new Map((miembros ?? []).map((m) => [m.id, m]));
  const nombreAcademia = new Map((listaAcademias ?? []).map((a) => [a.id, a.nombre]));
  const academias = new Map<number, string[]>();
  for (const i of inscripciones ?? []) {
    const n = nombreAcademia.get(i.academia_id);
    if (i.miembro_id != null && n) academias.set(i.miembro_id, [...(academias.get(i.miembro_id) ?? []), n]);
  }

  const filas = (noAutorizan ?? [])
    .filter((f) => f.estado === "pendiente_asignar" || (f.miembro_id != null && vigente.get(f.miembro_id) === f.id))
    .map((f) => {
      const m = f.miembro_id != null ? miembro.get(f.miembro_id) : undefined;
      return {
        id: f.id,
        clienteId: f.estado === "asignada" ? f.cliente_id : null,
        nombre: m ? `${m.nombres} ${m.apellidos}`.trim() : f.menor_nombre,
        documento: m?.documento ?? f.menor_documento,
        edad: edadDesde(m?.fecha_nacimiento),
        academia: f.miembro_id != null ? (academias.get(f.miembro_id) ?? []).join(", ") : "",
        firmante: `${f.firmante_nombre}${f.firmante_parentesco ? ` (${f.firmante_parentesco.toLowerCase()})` : ""}`,
        firmadoEl: f.firmado_el,
        sinAsignar: f.estado === "pendiente_asignar",
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/clientes/registros" className="text-muted-foreground text-sm hover:underline">← Registros</Link>
        <h1 className="cdaf-headline mt-1">Sin autorización de fotos</h1>
      </div>

      {filas.length === 0 ? (
        <EmptyState icon={CameraOff} title="Todos autorizaron" description="Ningún acudiente ha dicho que no a las fotos y videos de su hijo(a)." />
      ) : (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="cdaf-eyebrow text-muted-foreground text-xs">Niños · {filas.length}</h2>
            <span className="text-muted-foreground text-xs">No publicar fotos ni videos en redes</span>
          </div>
          <Card>
            <CardContent>
              <div className="cdaf-table-wrap">
                <table className="cdaf-table">
                  <thead><tr><th>Niño</th><th>Documento</th><th>Edad</th><th>Academia</th><th>Firmó</th><th>Fecha de la firma</th></tr></thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.id}>
                        <td>
                          {f.clienteId ? <Link href={`/clientes/${f.clienteId}`} className="font-semibold hover:underline">{f.nombre}</Link> : <span className="font-semibold">{f.nombre}</span>}
                          {f.sinAsignar && <Badge variant="warning" className="ml-2">Firma sin asignar</Badge>}
                        </td>
                        <td className="whitespace-nowrap tabular-nums">{f.documento ?? "—"}</td>
                        <td className="whitespace-nowrap">{f.edad != null ? `${f.edad} años` : "—"}</td>
                        <td>{f.academia || "—"}</td>
                        <td className="text-muted-foreground">{f.firmante}</td>
                        <td className="text-muted-foreground whitespace-nowrap">{fechaHoraCorta(f.firmadoEl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
