import { createClient } from "@/lib/supabase/server";
import type { AppRole, NotaEstado, NotaPrioridad } from "@/lib/database.types";

/**
 * Filtros del RPC. Los tres primeros son las pestañas de la bandeja;
 * `sin_leer` es interno (alimenta el desplegable de la campanita).
 */
export type NotaFiltro = "mias" | "todas" | "resueltas" | "sin_leer";

/** Pestañas visibles en /notas. */
export const NOTA_FILTROS: { value: NotaFiltro; label: string }[] = [
  { value: "mias", label: "Para mí" },
  { value: "todas", label: "Todas" },
  { value: "resueltas", label: "Resueltas" },
];

export function esFiltro(v: string | undefined): NotaFiltro {
  // Por defecto "Todas": Notas es la pantalla de inicio de todo el que no es
  // superadministrador, y lo primero que debe ver es el tablón del turno
  // completo, no solo lo que le tocó a él.
  return v === "mias" || v === "todas" || v === "resueltas" ? v : "todas";
}

export type NotaEtiquetado = { id: string; nombre: string | null; leida: boolean };

/** Enganche de la nota con el resto del sistema (cliente / clase / evento). */
export type NotaEnlace = { label: string; href: string };

export type NotaVista = {
  id: number;
  texto: string;
  autorId: string;
  autorNombre: string;
  prioridad: NotaPrioridad;
  estado: NotaEstado;
  paraTodos: boolean;
  createdAt: string;
  editadaEl: string | null;
  resueltaEl: string | null;
  resueltaPorNombre: string | null;
  destinatarios: NotaEtiquetado[];
  soyDestinatario: boolean;
  leidaPorMi: boolean;
  /** Cuántas respuestas tiene el hilo (el contenido se carga al desplegarlo). */
  nComentarios: number;
  enlace: NotaEnlace | null;
  /** Enganche crudo, para reabrir el formulario de edición. */
  clienteId: number | null;
  claseId: number | null;
  eventoId: number | null;
  /** Cambiar el TEXTO de la nota: solo su autor (ver `notas_solo_autor_edita`). */
  puedeEditar: boolean;
  /** Marcarla resuelta o reabrirla: autor, admins y a quien se le asignó. */
  puedeResolver: boolean;
  puedeEliminar: boolean;
};

/**
 * Quién puede RESOLVER o reabrir notas ajenas. NO es un permiso de módulo (los
 * cinco roles tienen `notas` en E, es el tablón común): es una regla de dentro
 * del módulo, y por eso va escrita aquí y no sale de la matriz. La autorización
 * de verdad la aplica RLS; esto solo evita pintar botones que serían rechazados.
 *
 * ⚠️ Ya NO decide quién edita el texto: eso es solo del autor. Antes `puedeEditar`
 * era `autor || admin || soy destinatario`, y como una nota sin etiquetar se
 * reparte a TODO el staff, en la práctica cualquiera de los 9 podía reescribir
 * cualquier nota del tablón general — y esta constante quedaba casi inerte.
 */
const ADMIN_NOTAS: AppRole[] = ["superadmin", "coord_admin"];

/**
 * Notas ya resueltas (nombres + destinatarios) vía RPC.
 * `perfilId`/`role` son los del usuario en sesión: definen qué botones se pintan.
 * La autorización real la aplica RLS en la base — esto solo evita ofrecer
 * acciones que igual serían rechazadas.
 */
export async function listarNotas(opts: {
  filtro?: NotaFiltro;
  clienteId?: number;
  limite?: number;
  perfilId: string;
  role: AppRole;
}): Promise<NotaVista[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("notas_listar", {
    p_filtro: opts.filtro ?? "todas",
    p_cliente: opts.clienteId ?? null,
    p_limite: opts.limite ?? 100,
  });
  if (error || !data) return [];

  const esAdmin = ADMIN_NOTAS.includes(opts.role);

  return data.map((n) => {
    const esAutor = n.autor_id === opts.perfilId;
    return {
      id: n.id,
      texto: n.texto,
      autorId: n.autor_id,
      autorNombre: n.autor_nombre ?? "Alguien del equipo",
      prioridad: n.prioridad,
      estado: n.estado,
      paraTodos: n.para_todos,
      createdAt: n.created_at,
      editadaEl: n.editada_el,
      resueltaEl: n.resuelta_el,
      resueltaPorNombre: n.resuelta_por_nombre,
      destinatarios: n.destinatarios ?? [],
      soyDestinatario: n.soy_destinatario,
      leidaPorMi: n.leida_por_mi,
      nComentarios: n.n_comentarios ?? 0,
      enlace: enlaceDeNota(n),
      clienteId: n.cliente_id,
      claseId: n.clase_id,
      eventoId: n.evento_id,
      puedeEditar: esAutor,
      puedeResolver: esAutor || esAdmin || n.soy_destinatario,
      puedeEliminar: esAutor || opts.role === "superadmin",
    };
  });
}

function enlaceDeNota(n: {
  cliente_id: number | null;
  cliente_nombre: string | null;
  clase_id: number | null;
  clase_etiqueta: string | null;
  evento_id: number | null;
  evento_nombre: string | null;
}): NotaEnlace | null {
  if (n.cliente_id) {
    return { label: n.cliente_nombre ?? "Cliente", href: `/clientes/${n.cliente_id}` };
  }
  if (n.clase_id) {
    return { label: `Clase ${n.clase_etiqueta ?? ""}`.trim(), href: `/cierre/${n.clase_id}` };
  }
  if (n.evento_id) {
    return { label: n.evento_nombre ?? "Evento", href: `/eventos/${n.evento_id}` };
  }
  return null;
}

/** Cuántas notas sin leer tiene el usuario (alimenta el contador de la campanita). */
export async function contarNoLeidas(perfilId: string): Promise<number> {
  const supabase = await createClient();
  // head + count: la cuenta la hace Postgres, no viaja ninguna fila.
  const { count } = await supabase
    .from("nota_destinatarios")
    .select("*", { count: "exact", head: true })
    .eq("perfil_id", perfilId)
    .is("leida_el", null);
  return count ?? 0;
}
