import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { instanteClase } from "@/lib/fecha";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { nombreStaff } from "@/lib/staff";
import { valorPaquete } from "@/lib/finanzas";
import { EliminarClase } from "./eliminar-clase";
import { CierreForm } from "./cierre-form";

export default async function CerrarClasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireRole(rolesForModule("cierre_clase"));
  const { id } = await params;
  const claseId = Number(id);
  const supabase = await createClient();

  const { data: clase } = await supabase
    .from("clases")
    .select("id, tipo, fecha, hora_inicio, deporte, estado, academia_id, clase_semanal_id, cliente_id, miembro_id, profesor_id, asistentes_no_registrados, num_asistentes, precio, valor_facturado, paquete_cliente_id")
    .eq("id", claseId)
    .single();
  if (!clase) notFound();

  // Valor que se factura al cliente por esta clase (solo lectura, para que el profe lo vea al cerrar).
  // Se calcula igual que la liquidación. Academia = por alumno asistente → no hay un valor fijo aquí.
  let valorFacturado: number | null = null;
  if (clase.tipo !== "academia") {
    if (clase.paquete_cliente_id) {
      const { data: pc } = await supabase
        .from("paquetes_cliente")
        .select("catalogo_id, num_clases, descuento_pct")
        .eq("id", clase.paquete_cliente_id)
        .single();
      if (pc) {
        const { data: cat } = pc.catalogo_id
          ? await supabase.from("paquetes_catalogo").select("precio, descuento_pct").eq("id", pc.catalogo_id).single()
          : { data: null };
        const base = cat ? valorPaquete(cat.precio, Number(cat.descuento_pct), Number(pc.descuento_pct)) : 0;
        valorFacturado = clase.valor_facturado ?? (pc.num_clases > 0 ? Math.round(base / pc.num_clases) : 0);
      }
    } else {
      valorFacturado = clase.valor_facturado ?? clase.precio ?? 0;
    }
  }

  // El roster se arma por MIEMBRO (hermano): así dos hermanos de la misma
  // academia aparecen por separado y cada uno cuenta para cobro y liquidación.
  let deportistas: { id: number; nombre: string }[] = [];
  let otrosInscritos: { id: number; nombre: string }[] = [];
  if (clase.tipo === "academia") {
    // El roster sale de la CLASE DEL PLANEADOR, que la clase registrada guarda
    // al nacer. Antes había que adivinarlo cruzando día + hora ±20 min contra
    // las franjas del grupo, y eso repartía mal a los grupos que comparten
    // cancha y hora. Ahora es una lectura directa: quien está apuntado a esta
    // clase, es a quien se espera.
    const { data: roster } = clase.clase_semanal_id
      ? await supabase.rpc("clase_semanal_roster", { p_clase: clase.clase_semanal_id })
      : { data: null };

    const esperados = (roster ?? []).map((n) => ({ id: n.miembro_id, nombre: n.nombre }));
    const yaEstan = new Set(esperados.map((d) => d.id));

    // Los demás matriculados en la misma academia van plegados, por si hay que
    // registrar una reposición. Sin `clase_semanal_id` (clases viejas, o una
    // registrada a mano) esta es la única lista que queda.
    let otros: { id: number; nombre: string }[] = [];
    if (clase.academia_id) {
      const { data: ins } = await supabase
        .from("inscripciones")
        .select("miembro_id")
        .eq("academia_id", clase.academia_id)
        .eq("activa", true);
      const ids = (ins ?? [])
        .map((i) => i.miembro_id)
        .filter((id): id is number => id != null && !yaEstan.has(id));
      if (ids.length) {
        const { data: ms } = await supabase
          .from("cliente_miembros")
          .select("id, nombres, apellidos")
          .in("id", ids)
          .eq("activo", true);
        otros = (ms ?? []).map((m) => ({ id: m.id, nombre: `${m.apellidos}, ${m.nombres}` }));
      }
    }

    const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, "es");
    deportistas = esperados.sort(porNombre);
    otrosInscritos = otros.sort(porNombre);
  } else if (clase.miembro_id) {
    const { data: m } = await supabase.from("cliente_miembros").select("id, nombres, apellidos").eq("id", clase.miembro_id).single();
    if (m) deportistas = [{ id: m.id, nombre: `${m.apellidos}, ${m.nombres}` }];
  } else if (clase.cliente_id) {
    // Clase individual sin miembro fijado: cae al titular de la ficha.
    const { data: m } = await supabase
      .from("cliente_miembros")
      .select("id, nombres, apellidos")
      .eq("cliente_id", clase.cliente_id)
      .eq("es_titular", true)
      .maybeSingle();
    if (m) deportistas = [{ id: m.id, nombre: `${m.apellidos}, ${m.nombres}` }];
  }

  const { data: asis } = await supabase
    .from("asistencias")
    .select("miembro_id, presente, estado")
    .eq("clase_id", claseId);
  const estadoPorCliente: Record<number, string> = {};
  for (const a of asis ?? []) if (a.miembro_id != null) estadoPorCliente[a.miembro_id] = a.estado ?? (a.presente ? "presente" : "ausente");

  const profesorNombre = await nombreStaff(clase.profesor_id);
  let academiaNombre: string | null = null;
  if (clase.tipo === "academia" && clase.academia_id) {
    const { data: a } = await supabase.from("academias").select("nombre").eq("id", clase.academia_id).single();
    academiaNombre = a?.nombre ?? null;
  }
  // Clase de colegio (Montessori): no lleva lista, solo se dice si se dictó.
  let colegio: string | null = null;
  if (clase.clase_semanal_id) {
    const { data: cs } = await supabase.from("clase_semanal").select("colegio").eq("id", clase.clase_semanal_id).maybeSingle();
    colegio = cs?.colegio ?? null;
  }
  const titulo =
    clase.tipo === "academia"
      ? colegio
        ? `Colegio ${colegio}`
        : academiaNombre
          ? academiaNombre
          : `Academia de ${clase.deporte === "padel" ? "pádel" : "tenis"}`
      : deportistas[0]?.nombre ?? "Sin deportista";

  // Una clase no se cierra antes de empezar (las sin hora, desde el inicio de su día).
  const noEmpezo = Date.now() < instanteClase(clase.fecha, clase.hora_inicio);

  return (
    <div className="max-w-md space-y-6">
      <div>
        <Link href="/cierre" className="text-muted-foreground text-sm hover:underline">
          ← Pendientes
        </Link>
        <p className="cdaf-eyebrow text-muted-foreground mt-1">Cerrar clase</p>
        <h1 className="cdaf-headline">{titulo}</h1>
        <p className="text-muted-foreground text-sm">
          {clase.fecha} {clase.hora_inicio?.slice(0, 5) ?? ""} ·{" "}
          {clase.tipo === "academia" ? "Academia" : "Individual"}
          {clase.deporte ? ` · ${clase.deporte === "padel" ? "Pádel" : "Tenis"}` : ""} · Profe: {profesorNombre ?? "—"}
        </p>
      </div>
      {noEmpezo ? (
        // Se puede llegar aquí por el enlace directo aunque la cola ya la esconda.
        // El servidor lo valida igual al guardar; esto es para no mostrar un
        // formulario que va a ser rechazado.
        <p className="border-destructive/40 bg-destructive/10 rounded-md border px-3 py-3 text-sm">
          Esta clase todavía no ha empezado ({clase.fecha}
          {clase.hora_inicio ? ` a las ${clase.hora_inicio.slice(0, 5)}` : ""}). Se puede cerrar
          cuando haya iniciado — marcar asistencia antes sería registrar algo que no pasó.
        </p>
      ) : (
        <CierreForm
          claseId={claseId}
          estadoActual={clase.estado}
          deportistas={deportistas}
          otrosInscritos={otrosInscritos}
          estadoPorCliente={estadoPorCliente}
          esAcademia={clase.tipo === "academia"}
          colegio={colegio}
          noRegistrados={clase.asistentes_no_registrados ?? ""}
          numAsistentes={clase.num_asistentes ?? 1}
          valorFacturado={valorFacturado}
        />
      )}

      {/* Solo el superadministrador, y solo mientras siga pendiente (Laura, 24-sep-2026). */}
      {profile.role === "superadmin" && clase.estado === "programada" && (
        <EliminarClase claseId={claseId} dePlaneador={clase.clase_semanal_id != null} />
      )}
    </div>
  );
}
