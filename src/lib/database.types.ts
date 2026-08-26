// Tipos de la base de datos del Centro de Control CDAF.
// NOTA: mantenidos a mano por ahora (gen types vía CLI requiere Docker o un
// SUPABASE_ACCESS_TOKEN del proyecto). Formato compatible con `supabase gen types`.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppRole =
  | "superadmin"
  | "coord_admin"
  | "coord_deportivo"
  | "recepcion"
  | "profesor"
  /** Maneja los torneos y nada más: eventos (control total) + notas. Migración 0068. */
  | "gestion_eventos"
  /** El vigilante: abre y cierra el club. NO ve ningún módulo, solo marca su turno. Migración 0078. */
  | "seguridad"
  /** NO es una persona: es el PC de recepción. Solo pinta la pantalla de marcar turno. Migración 0078. */
  | "quiosco";

export type ClienteEstado = "activo" | "retirado";

/** Tipo del documento de identidad. Desde EasyCancha: NI→CC, PP→PP.
 *  RC = registro civil (< 7 años) · TI = tarjeta de identidad (7–17) ·
 *  CC = cédula (18+) · CE/PP/PPT = extranjeros · NIT = jurídica. */
export type TipoDocumento = "CC" | "TI" | "CE" | "PP" | "NIT" | "PPT" | "RC";

/** Grupo sanguíneo (ABO × Rh). Lista cerrada. */
export type Rh = "O+" | "O-" | "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-";

/** Tipo de quien recibe la factura. */
export type FacturaTipo = "natural" | "juridica";

export type ClienteDocumentoTipo = "consentimiento" | "certificado_medico" | "otro";
export type EmpleadoDocumentoTipo = "contrato" | "hoja_vida" | "otro";

export type Deporte = "tenis" | "padel";
/** Las academias son 4 fijas: categoría × deporte. No es un enum de Postgres, es un CHECK. */
export type AcademiaCategoria = "recreativa" | "competencia";
/** Niveles nuevos de academia (ago-2026). Reemplazan a los de bola y a principiantes/iniciados. */
export type AcademiaNivel = "iniciacion" | "intermedio" | "avanzado";
export type ClaseTipo = "academia" | "individual";
export type ClaseEstado = "programada" | "realizada" | "cancelada" | "no_show";
export type PaqueteEstado = "activo" | "agotado" | "vencido" | "anulado";
export type ServicioCategoriaSaldo = "academia" | "paquete" | "particular";
export type PagoEstado = "sin_asignar" | "asignado";
export type CompensacionTipo = "por_clase" | "fijo_comision" | "fisico";
export type AsistenciaEstado = "presente" | "ausente" | "excusa_medica" | "reposicion";
export type NotaPrioridad = "normal" | "alta";
export type NotaEstado = "pendiente" | "resuelta";
export type ReglaConcepto = "clase_particular" | "paquete" | "academia" | "siigo" | "clase" | "salario";
export type ReglaMetodo =
  | "pct_facturado"
  | "fijo_por_clase"
  | "escalonado_asistentes"
  | "por_alumno"
  | "pct_siigo_servicio"
  | "salario_fijo"
  | "comision_umbral";
/** Un escalón del método `escalonado_asistentes`: desde `min` asistentes, se cobra `valor`. */
export type ReglaEscalon = { min: number; valor: number };

/** De dónde salió el turno. `ajuste` = lo creó o corrigió el superadministrador. */
export type TurnoOrigen = "app" | "quiosco" | "ajuste";

/** Las cuatro marcaciones del día. */
export type TurnoAccion = "entrada" | "salida" | "pausa_inicio" | "pausa_fin";

/**
 * Minutos trabajados de una persona en UN día, ya clasificados según la
 * normativa laboral colombiana (migración 0081).
 *
 * Van en MINUTOS, no en horas: son exactos y la pantalla los formatea. Y van por
 * día —no por semana— para que el reporte pueda sumar cualquier periodo sin
 * recalcular; cada minuto ya se clasificó teniendo en cuenta la semana completa
 * a la que pertenece, que es lo que decide el tope de las 42 h.
 */
export type TurnoHoras = {
  perfil_id: string;
  dia: string;
  /** Lunes de la semana a la que pertenece el día. */
  semana: string;
  diurnas: number;
  /** 7 p.m. a 6 a.m., recargo del 35%. */
  nocturnas: number;
  /** Recargo del 25%. */
  extra_diurnas: number;
  /** Recargo del 75%. */
  extra_nocturnas: number;
  /** Domingo o festivo, recargo del 90%. Los recargos se acumulan si además es de noche. */
  dom_diurnas: number;
  dom_nocturnas: number;
  dom_extra_diurnas: number;
  dom_extra_nocturnas: number;
  total: number;
};

/** Un turno con sus minutos ya descontado el almuerzo. */
export type TurnoListado = {
  id: number;
  perfil_id: string;
  dia: string;
  inicio_el: string;
  fin_el: string | null;
  /** null = turno todavía abierto. */
  minutos: number | null;
  minutos_pausa: number;
  n_pausas: number;
  pausa_abierta: boolean;
  foto_inicio_path: string | null;
  foto_fin_path: string | null;
  origen: TurnoOrigen;
  ajustado_por: string | null;
  ajuste_motivo: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: AppRole;
          nombre: string | null;
          telefono: string | null;
          documento: string | null;
          avatar_path: string | null;
          activo: boolean;
          /** Registra entrada y salida por horas. Solo lo mueve el superadministrador. */
          marca_turno: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role?: AppRole;
          nombre?: string | null;
          telefono?: string | null;
          documento?: string | null;
          avatar_path?: string | null;
          activo?: boolean;
          marca_turno?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: AppRole;
          nombre?: string | null;
          telefono?: string | null;
          documento?: string | null;
          avatar_path?: string | null;
          activo?: boolean;
          marca_turno?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profesor_valor_clase: {
        Row: {
          id: number;
          profesor_id: string;
          valor: number;
          vigente_desde: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          profesor_id: string;
          valor: number;
          vigente_desde?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          profesor_id?: string;
          valor?: number;
          vigente_desde?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      profesor_compensacion: {
        Row: {
          profesor_id: string;
          tipo: CompensacionTipo;
          pct_clase: number;
          salario_fijo: number;
          pago_asistencia: number;
          comision_quincenal: number;
          valor_alumno_academia: number;
          updated_at: string;
        };
        Insert: {
          profesor_id: string;
          tipo?: CompensacionTipo;
          pct_clase?: number;
          salario_fijo?: number;
          pago_asistencia?: number;
          comision_quincenal?: number;
          valor_alumno_academia?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profesor_compensacion"]["Insert"]>;
        Relationships: [];
      };
      profesor_regla: {
        Row: {
          id: number;
          profesor_id: string;
          nombre: string;
          concepto: ReglaConcepto;
          metodo: ReglaMetodo;
          pct: number;
          valor: number;
          servicio_id: number | null;
          escalones: ReglaEscalon[] | null;
          dias: number[] | null;
          hora_desde: string | null;
          hora_hasta: string | null;
          umbral: number | null;
          orden: number;
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          profesor_id: string;
          nombre: string;
          concepto: ReglaConcepto;
          metodo: ReglaMetodo;
          pct?: number;
          valor?: number;
          servicio_id?: number | null;
          escalones?: ReglaEscalon[] | null;
          dias?: number[] | null;
          hora_desde?: string | null;
          hora_hasta?: string | null;
          umbral?: number | null;
          orden?: number;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profesor_regla"]["Insert"]>;
        Relationships: [];
      };
      easycancha_profesor_alias: {
        Row: {
          clave: string;
          profesor_id: string;
          created_at: string;
        };
        Insert: {
          clave: string;
          profesor_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["easycancha_profesor_alias"]["Insert"]>;
        Relationships: [];
      };
      acudientes: {
        Row: {
          id: number;
          nombre: string;
          documento: string | null;
          telefono: string | null;
          email: string | null;
          parentesco: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          nombre: string;
          documento?: string | null;
          telefono?: string | null;
          email?: string | null;
          parentesco?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          nombre?: string;
          documento?: string | null;
          telefono?: string | null;
          email?: string | null;
          parentesco?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      cliente_miembros: {
        Row: {
          id: number;
          cliente_id: number;
          nombres: string;
          apellidos: string;
          fecha_nacimiento: string | null;
          documento: string | null;
          tipo_documento: TipoDocumento | null;
          eps: string | null;
          rh: Rh | null;
          deportes: Deporte[];
          es_titular: boolean;
          activo: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          cliente_id: number;
          nombres: string;
          apellidos: string;
          fecha_nacimiento?: string | null;
          documento?: string | null;
          tipo_documento?: TipoDocumento | null;
          eps?: string | null;
          rh?: Rh | null;
          deportes?: Deporte[];
          es_titular?: boolean;
          activo?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cliente_miembros"]["Insert"]>;
        Relationships: [];
      };
      clientes: {
        Row: {
          id: number;
          nombres: string;
          apellidos: string;
          documento: string | null;
          tipo_documento: TipoDocumento | null;
          eps: string | null;
          rh: Rh | null;
          fecha_nacimiento: string | null;
          es_menor: boolean;
          celular: string | null;
          email: string | null;
          emergencia_nombre: string | null;
          emergencia_celular: string | null;
          emergencia_parentesco: string | null;
          factura_a_nombre: string | null;
          factura_a_nit: string | null;
          factura_tipo: FacturaTipo | null;
          factura_email: string | null;
          acudiente_id: number | null;
          deportes: Deporte[];
          estado: ClienteEstado;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          nombres: string;
          apellidos: string;
          documento?: string | null;
          tipo_documento?: TipoDocumento | null;
          eps?: string | null;
          rh?: Rh | null;
          fecha_nacimiento?: string | null;
          es_menor?: boolean;
          celular?: string | null;
          email?: string | null;
          emergencia_nombre?: string | null;
          emergencia_celular?: string | null;
          emergencia_parentesco?: string | null;
          factura_a_nombre?: string | null;
          factura_a_nit?: string | null;
          factura_tipo?: FacturaTipo | null;
          factura_email?: string | null;
          acudiente_id?: number | null;
          deportes?: Deporte[];
          estado?: ClienteEstado;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          nombres?: string;
          apellidos?: string;
          documento?: string | null;
          tipo_documento?: TipoDocumento | null;
          eps?: string | null;
          rh?: Rh | null;
          fecha_nacimiento?: string | null;
          es_menor?: boolean;
          celular?: string | null;
          email?: string | null;
          emergencia_nombre?: string | null;
          emergencia_celular?: string | null;
          emergencia_parentesco?: string | null;
          factura_a_nombre?: string | null;
          factura_a_nit?: string | null;
          factura_tipo?: FacturaTipo | null;
          factura_email?: string | null;
          acudiente_id?: number | null;
          deportes?: Deporte[];
          estado?: ClienteEstado;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clientes_acudiente_id_fkey";
            columns: ["acudiente_id"];
            referencedRelation: "acudientes";
            referencedColumns: ["id"];
          },
        ];
      };
      empleado_documentos: {
        Row: {
          id: number;
          empleado_id: string;
          tipo: EmpleadoDocumentoTipo;
          nombre_archivo: string;
          storage_path: string;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          empleado_id: string;
          tipo?: EmpleadoDocumentoTipo;
          nombre_archivo: string;
          storage_path: string;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          empleado_id?: string;
          tipo?: EmpleadoDocumentoTipo;
          nombre_archivo?: string;
          storage_path?: string;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      cliente_documentos: {
        Row: {
          id: number;
          cliente_id: number;
          tipo: ClienteDocumentoTipo;
          nombre_archivo: string;
          storage_path: string;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          cliente_id: number;
          tipo?: ClienteDocumentoTipo;
          nombre_archivo: string;
          storage_path: string;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          cliente_id?: number;
          tipo?: ClienteDocumentoTipo;
          nombre_archivo?: string;
          storage_path?: string;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      academias: {
        Row: {
          id: number;
          codigo: string;
          nombre: string;
          deporte: Deporte;
          /** recreativa | competencia — las 4 academias fijas son categoría × deporte. */
          categoria: AcademiaCategoria | null;
          /** Servicio de Siigo con el que se factura. El ingreso sale de ahí, NO de `precio`. */
          servicio_id: number | null;
          /** Solo referencia para quien contesta el teléfono. NO se usa para calcular. */
          precio: number;
          matricula: number;
          activa: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          codigo: string;
          nombre: string;
          deporte: Deporte;
          categoria?: AcademiaCategoria | null;
          servicio_id?: number | null;
          precio?: number;
          matricula?: number;
          activa?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["academias"]["Insert"]>;
        Relationships: [];
      };
      academia_grupo: {
        Row: {
          id: number;
          academia_id: number;
          /** Editable por el club: Disney en recreativa, tenistas en competencia. */
          nombre: string;
          nivel: AcademiaNivel;
          edad_min: number;
          edad_max: number;
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          academia_id: number;
          nombre: string;
          nivel: AcademiaNivel;
          edad_min: number;
          edad_max: number;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["academia_grupo"]["Insert"]>;
        Relationships: [];
      };
      grupo_franja: {
        Row: {
          id: number;
          grupo_id: number;
          dia_semana: number;
          hora_inicio: string;
          hora_fin: string;
          profesor_id: string | null;
          cancha: string | null;
          /** null = el tope del nivel (Iniciación 6 · Intermedio 5 · Avanzado 4). NO bloquea: avisa. */
          cupo: number | null;
          activo: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          grupo_id: number;
          dia_semana: number;
          hora_inicio: string;
          hora_fin: string;
          profesor_id?: string | null;
          cancha?: string | null;
          cupo?: number | null;
          activo?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["grupo_franja"]["Insert"]>;
        Relationships: [];
      };
      inscripcion_franja: {
        Row: { id: number; inscripcion_id: number; franja_id: number; created_at: string };
        Insert: { id?: number; inscripcion_id: number; franja_id: number; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["inscripcion_franja"]["Insert"]>;
        Relationships: [];
      };
      inscripciones: {
        Row: {
          id: number;
          academia_id: number;
          cliente_id: number;
          miembro_id: number | null;
          /** Grupo al que pertenece. De él salen su horario, su cupo y el roster del cierre. */
          grupo_id: number;
          descuento_pct: number;
          fecha_inscripcion: string;
          activa: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          academia_id: number;
          cliente_id: number;
          miembro_id?: number | null;
          grupo_id: number;
          descuento_pct?: number;
          fecha_inscripcion?: string;
          activa?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["inscripciones"]["Insert"]>;
        Relationships: [];
      };
      lista_espera: {
        Row: {
          id: number;
          academia_id: number | null;
          cliente_id: number | null;
          miembro_id: number | null;
          nombre: string;
          contacto: string | null;
          deporte: Deporte | null;
          nivel: string | null;
          edad: number | null;
          disponibilidad: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          academia_id?: number | null;
          cliente_id?: number | null;
          miembro_id?: number | null;
          nombre: string;
          contacto?: string | null;
          deporte?: Deporte | null;
          nivel?: string | null;
          edad?: number | null;
          disponibilidad?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lista_espera"]["Insert"]>;
        Relationships: [];
      };
      paquetes_catalogo: {
        Row: {
          id: number;
          nombre: string;
          deporte: Deporte | null;
          num_clases: number;
          precio: number;
          descuento_pct: number;
          activo: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          nombre: string;
          deporte?: Deporte | null;
          num_clases: number;
          precio?: number;
          descuento_pct?: number;
          activo?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["paquetes_catalogo"]["Insert"]>;
        Relationships: [];
      };
      paquetes_cliente: {
        Row: {
          id: number;
          cliente_id: number;
          miembro_id: number | null;
          catalogo_id: number | null;
          num_clases: number;
          clases_consumidas: number;
          descuento_pct: number;
          estado: PaqueteEstado;
          inicia_el: string;
          vence_el: string | null;
          anulado_el: string | null;
          anulado_por: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          cliente_id: number;
          miembro_id?: number | null;
          catalogo_id?: number | null;
          num_clases: number;
          clases_consumidas?: number;
          descuento_pct?: number;
          estado?: PaqueteEstado;
          inicia_el?: string;
          vence_el?: string | null;
          anulado_el?: string | null;
          anulado_por?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["paquetes_cliente"]["Insert"]>;
        Relationships: [];
      };
      clases: {
        Row: {
          id: number;
          tipo: ClaseTipo;
          academia_id: number | null;
          /** Grupo de academia. Null en particulares y paquetes. */
          grupo_id: number | null;
          cliente_id: number | null;
          miembro_id: number | null;
          paquete_cliente_id: number | null;
          profesor_id: string | null;
          deporte: Deporte | null;
          nivel: string | null;
          cancha: string | null;
          fecha: string;
          hora_inicio: string | null;
          hora_fin: string | null;
          precio: number | null;
          valor_facturado: number | null;
          descuento_pct: number;
          estado: ClaseEstado;
          registrada_por: string | null;
          asistentes_no_registrados: string | null;
          num_asistentes: number | null;
          easycancha_booking_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          tipo: ClaseTipo;
          academia_id?: number | null;
          grupo_id?: number | null;
          cliente_id?: number | null;
          miembro_id?: number | null;
          paquete_cliente_id?: number | null;
          profesor_id?: string | null;
          deporte?: Deporte | null;
          nivel?: string | null;
          cancha?: string | null;
          fecha: string;
          hora_inicio?: string | null;
          hora_fin?: string | null;
          precio?: number | null;
          valor_facturado?: number | null;
          descuento_pct?: number;
          estado?: ClaseEstado;
          registrada_por?: string | null;
          asistentes_no_registrados?: string | null;
          num_asistentes?: number | null;
          easycancha_booking_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clases"]["Insert"]>;
        Relationships: [];
      };
      asistencias: {
        Row: {
          id: number;
          clase_id: number;
          cliente_id: number;
          miembro_id: number | null;
          presente: boolean;
          estado: AsistenciaEstado;
          registrado_por: string | null;
          registrado_at: string;
        };
        Insert: {
          id?: number;
          clase_id: number;
          cliente_id: number;
          miembro_id?: number | null;
          presente?: boolean;
          estado?: AsistenciaEstado;
          registrado_por?: string | null;
          registrado_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["asistencias"]["Insert"]>;
        Relationships: [];
      };
      servicios: {
        Row: {
          id: number;
          clave: string;
          nombre: string;
          color: string | null;
          categoria_saldo: ServicioCategoriaSaldo | null;
          siigo_grupo: string | null;
          /** Códigos de producto de Siigo que este servicio reclama por encima del grupo (migración 0072). */
          siigo_codigos: string[] | null;
          activo: boolean;
          orden: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          clave: string;
          nombre: string;
          color?: string | null;
          categoria_saldo?: ServicioCategoriaSaldo | null;
          siigo_grupo?: string | null;
          siigo_codigos?: string[] | null;
          activo?: boolean;
          orden?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["servicios"]["Insert"]>;
        Relationships: [];
      };
      eventos: {
        Row: {
          id: number;
          nombre: string;
          tipo: string;
          deporte: Deporte | null;
          servicio_id: number | null;
          fecha_inicio: string;
          fecha_fin: string | null;
          hora_inicio: string | null;
          lugar: string | null;
          cupo: number | null;
          precio_inscripcion: number;
          estado: string;
          notas: string | null;
          created_at: string;
          /** Cierre financiero: hasta que no esté, el evento no aporta nada al dashboard. */
          cerrado_el: string | null;
          cerrado_por: string | null;
          /** Snapshot congelado al cerrar (para que el histórico no se mueva). */
          cierre_ingreso: number | null;
          cierre_costo: number | null;
          cierre_utilidad: number | null;
        };
        Insert: {
          id?: number;
          nombre: string;
          tipo?: string;
          deporte?: Deporte | null;
          servicio_id?: number | null;
          fecha_inicio: string;
          fecha_fin?: string | null;
          hora_inicio?: string | null;
          lugar?: string | null;
          cupo?: number | null;
          precio_inscripcion?: number;
          estado?: string;
          notas?: string | null;
          created_at?: string;
          cerrado_el?: string | null;
          cerrado_por?: string | null;
          cierre_ingreso?: number | null;
          cierre_costo?: number | null;
          cierre_utilidad?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["eventos"]["Insert"]>;
        Relationships: [];
      };
      evento_participantes: {
        Row: {
          id: number;
          evento_id: number;
          cliente_id: number | null;
          miembro_id: number | null;
          nombre_externo: string | null;
          telefono_externo: string | null;
          email_externo: string | null;
          monto: number;
          estado: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          evento_id: number;
          cliente_id?: number | null;
          miembro_id?: number | null;
          nombre_externo?: string | null;
          telefono_externo?: string | null;
          email_externo?: string | null;
          monto?: number;
          estado?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["evento_participantes"]["Insert"]>;
        Relationships: [];
      };
      evento_profesores: {
        Row: {
          id: number;
          evento_id: number;
          profesor_id: string;
          rol: string | null;
          pago: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          evento_id: number;
          profesor_id: string;
          rol?: string | null;
          pago?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["evento_profesores"]["Insert"]>;
        Relationships: [];
      };
      evento_gastos: {
        Row: {
          id: number;
          evento_id: number;
          concepto: string;
          /** refrigerios | premios | logistica | publicidad | arbitraje | staff_externo | otro */
          categoria: string;
          monto: number;
          proveedor: string | null;
          fecha: string;
          /** Soporte en el bucket `evento-docs` (factura del proveedor, foto del recibo). */
          soporte_path: string | null;
          registrado_por: string | null;
          notas: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          evento_id: number;
          concepto: string;
          categoria?: string;
          monto?: number;
          proveedor?: string | null;
          fecha?: string;
          soporte_path?: string | null;
          registrado_por?: string | null;
          notas?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["evento_gastos"]["Insert"]>;
        Relationships: [];
      };
      siigo_facturas: {
        Row: {
          id: number;
          siigo_id: string;
          numero: string | null;
          fecha: string;
          cliente_identificacion: string | null;
          cliente_nombre_siigo: string | null;
          cliente_id: number | null;
          evento_id: number | null;
          total: number;
          saldo: number;
          estado_conciliacion: string;
          nota_credito: number;
          nc_numero: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          siigo_id: string;
          numero?: string | null;
          fecha: string;
          cliente_identificacion?: string | null;
          cliente_nombre_siigo?: string | null;
          cliente_id?: number | null;
          evento_id?: number | null;
          total?: number;
          saldo?: number;
          estado_conciliacion?: string;
          nota_credito?: number;
          nc_numero?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["siigo_facturas"]["Insert"]>;
        Relationships: [];
      };
      siigo_factura_lineas: {
        Row: {
          id: number;
          factura_id: number;
          codigo: string | null;
          descripcion: string | null;
          servicio_id: number | null;
          monto: number;
          cantidad: number;
        };
        Insert: {
          id?: number;
          factura_id: number;
          codigo?: string | null;
          descripcion?: string | null;
          servicio_id?: number | null;
          monto?: number;
          cantidad?: number;
        };
        Update: Partial<Database["public"]["Tables"]["siigo_factura_lineas"]["Insert"]>;
        Relationships: [];
      };
      siigo_productos: {
        Row: {
          codigo: string;
          nombre: string | null;
          account_group: string | null;
          servicio_id: number | null;
          updated_at: string;
        };
        Insert: {
          codigo: string;
          nombre?: string | null;
          account_group?: string | null;
          servicio_id?: number | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["siigo_productos"]["Insert"]>;
        Relationships: [];
      };
      siigo_sync: {
        Row: { id: number; last_cursor: string | null; updated_at: string };
        Insert: { id?: number; last_cursor?: string | null; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["siigo_sync"]["Insert"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          actor_id: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          before: Json | null;
          after: Json | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          actor_id?: string | null;
          action: string;
          entity: string;
          entity_id?: string | null;
          before?: Json | null;
          after?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          actor_id?: string | null;
          action?: string;
          entity?: string;
          entity_id?: string | null;
          before?: Json | null;
          after?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      notas: {
        Row: {
          id: number;
          texto: string;
          autor_id: string;
          prioridad: NotaPrioridad;
          estado: NotaEstado;
          para_todos: boolean;
          cliente_id: number | null;
          clase_id: number | null;
          evento_id: number | null;
          resuelta_por: string | null;
          resuelta_el: string | null;
          editada_el: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          texto: string;
          autor_id: string;
          prioridad?: NotaPrioridad;
          estado?: NotaEstado;
          para_todos?: boolean;
          cliente_id?: number | null;
          clase_id?: number | null;
          evento_id?: number | null;
          resuelta_por?: string | null;
          resuelta_el?: string | null;
          editada_el?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          texto?: string;
          autor_id?: string;
          prioridad?: NotaPrioridad;
          estado?: NotaEstado;
          para_todos?: boolean;
          cliente_id?: number | null;
          clase_id?: number | null;
          evento_id?: number | null;
          resuelta_por?: string | null;
          resuelta_el?: string | null;
          editada_el?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      nota_comentarios: {
        Row: {
          id: number;
          nota_id: number;
          autor_id: string;
          texto: string;
          editado_el: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          nota_id: number;
          autor_id: string;
          texto: string;
          editado_el?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          nota_id?: number;
          autor_id?: string;
          texto?: string;
          editado_el?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      nota_destinatarios: {
        Row: {
          id: number;
          nota_id: number;
          perfil_id: string;
          leida_el: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          nota_id: number;
          perfil_id: string;
          leida_el?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          nota_id?: number;
          perfil_id?: string;
          leida_el?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      /**
       * Turno de un empleado (migración 0080).
       *
       * ⚠️ Solo se puede LEER desde el cliente. Insert y Update están declarados
       * porque el tipo lo exige, pero la tabla no tiene permiso de escritura
       * para nadie: se escribe únicamente por las funciones `turno_marcar`,
       * `quiosco_marcar` y las correcciones del superadministrador, que son las
       * que estampan la hora del servidor.
       */
      turno: {
        Row: {
          id: number;
          perfil_id: string;
          inicio_el: string;
          /** null = turno abierto. Aporta CERO horas al reporte: no se inventa la salida. */
          fin_el: string | null;
          foto_inicio_path: string | null;
          foto_fin_path: string | null;
          origen: TurnoOrigen;
          ajustado_por: string | null;
          ajuste_motivo: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      /** Almuerzo o descanso: NO es tiempo trabajado y se descuenta del turno. */
      turno_pausa: {
        Row: {
          id: number;
          turno_id: number;
          inicio_el: string;
          fin_el: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      /** Festivos de Colombia; se pagan como dominicales. Solo lectura (van por migración). */
      festivo: {
        Row: { fecha: string; nombre: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // `turno_pin` existe en la base pero NO se declara aquí a propósito: no
      // tiene permiso de lectura para nadie, ni para el superadministrador.
      // Declararla invitaría a consultarla y siempre devolvería un error.
    };
    Views: Record<string, never>;
    Functions: {
      /** Marca desde el celular, con la sesión propia. Devuelve el id del turno. */
      turno_marcar: {
        Args: { p_accion: TurnoAccion; p_foto_path?: string | null };
        Returns: number;
      };
      /**
       * Marca desde el PC de recepción por cuenta de otro, validando su PIN.
       * ⚠️ Devuelve un ESTADO en vez de reventar cuando el PIN está mal: una
       * excepción revertiría la transacción y con ella el contador de intentos
       * fallidos, así que el bloqueo nunca llegaría a activarse.
       */
      quiosco_marcar: {
        Args: {
          p_perfil: string;
          p_pin: string;
          p_accion: TurnoAccion;
          p_foto_path?: string | null;
        };
        Returns: { ok: boolean; mensaje: string | null; turno_id: number | null }[];
      };
      /** Lista para la pantalla del quiósco: quién marca turno y cómo va. */
      quiosco_estado: {
        Args: Record<string, never>;
        Returns: {
          perfil_id: string;
          nombre: string;
          turno_id: number | null;
          inicio_el: string | null;
          pausa_abierta: boolean;
          tiene_pin: boolean;
        }[];
      };
      /** Minutos por persona y día, ya clasificados según la normativa. */
      turnos_horas: {
        Args: { p_desde: string; p_hasta: string; p_perfil?: string | null };
        Returns: TurnoHoras[];
      };
      /** Detalle turno por turno. `minutos` null = todavía abierto. */
      turnos_listar: {
        Args: { p_desde: string; p_hasta: string; p_perfil?: string | null };
        Returns: TurnoListado[];
      };
      // Correcciones — todas solo del superadministrador y con rastro en audit_log.
      turno_ajustar: {
        Args: { p_turno: number; p_inicio: string; p_fin: string | null; p_motivo: string };
        Returns: void;
      };
      turno_crear_manual: {
        Args: { p_perfil: string; p_inicio: string; p_fin: string; p_motivo: string };
        Returns: number;
      };
      turno_eliminar: {
        Args: { p_turno: number; p_motivo: string };
        Returns: void;
      };
      turno_pausa_fijar: {
        Args: { p_turno: number; p_inicio: string; p_fin: string; p_motivo: string };
        Returns: number;
      };
      turno_pausa_eliminar: {
        Args: { p_pausa: number; p_motivo: string };
        Returns: void;
      };
      turno_pin_asignar: {
        Args: { p_perfil: string; p_pin: string };
        Returns: void;
      };
      /** ¿Tiene PIN? Nunca devuelve el hash: la tabla no la lee nadie. */
      turno_pin_estado: {
        Args: { p_perfil: string };
        Returns: boolean;
      };
      turno_pin_borrar: {
        Args: { p_perfil: string };
        Returns: void;
      };
      staff_directorio: {
        Args: { p_solo_activos?: boolean; p_role?: AppRole | null };
        Returns: { id: string; nombre: string | null; role: AppRole; activo: boolean }[];
      };
      /** Quién puede dictar clases: rol profesor O con compensación configurada
       *  (Willington es coord. deportivo y da las clases de 7 a.m.). Migración 0061. */
      /** Cartera pendiente por tramos de antigüedad. `desde`/`hasta` son los
       *  límites de fecha que usó cada tramo, para que el listado filtre con los
       *  mismos valores y no se desfase un día. Migración cartera_antiguedad. */
      siigo_cartera_antiguedad: {
        Args: { p_servicio?: number | null };
        Returns: { tramo: string; n: number; total: number; desde: string | null; hasta: string | null }[];
      };
      staff_docentes: {
        Args: { p_solo_activos?: boolean };
        Returns: { id: string; nombre: string | null; role: AppRole; activo: boolean }[];
      };
      /** Rendimiento por franja de una academia. La franja en null = clases dictadas
       *  a una hora que nadie tiene inscrita. Migración 0057. */
      /** Una fila por grupo: franjas, inscritos, cupo y cuántas franjas van sobre el tope. */
      academia_grupos_resumen: {
        Args: { p_academia?: number | null };
        Returns: {
          grupo_id: number;
          academia_id: number;
          nombre: string;
          nivel: AcademiaNivel;
          edad_min: number;
          edad_max: number;
          activo: boolean;
          franjas: number;
          ninos: number;
          cupo_total: number;
          ocupados: number;
          franjas_sobre_cupo: number;
          dias: number[];
        }[];
      };
      grupo_franjas: {
        Args: { p_grupo: number };
        Returns: {
          franja_id: number;
          dia_semana: number;
          hora_inicio: string;
          hora_fin: string;
          profesor_id: string | null;
          cancha: string | null;
          cupo: number;
          inscritos: number;
        }[];
      };
      /** Una fila por (franja, niño) con su asistencia EN ESA franja. franja_id null = sin franja. */
      grupo_inscritos_por_franja: {
        Args: { p_grupo: number; p_desde?: string | null; p_hasta?: string | null };
        Returns: {
          franja_id: number | null;
          inscripcion_id: number;
          miembro_id: number;
          cliente_id: number;
          nombre: string;
          edad: number;
          fuera_de_rango: boolean;
          esperadas: number;
          presentes: number;
          ausentes: number;
          excusas: number;
        }[];
      };
      /** Ocupación y asistencia por franja en un periodo. franja_id null = "Otras horas". 0075. */
      academia_ocupacion_franja: {
        Args: { p_academia?: number | null; p_desde?: string | null; p_hasta?: string | null };
        Returns: {
          academia_id: number;
          grupo_id: number | null;
          grupo_nombre: string;
          nivel: string;
          franja_id: number | null;
          dia_semana: number | null;
          hora_inicio: string | null;
          hora_fin: string | null;
          profesor_id: string | null;
          cancha: string | null;
          cupo: number | null;
          inscritos: number;
          clases: number;
          clases_sin_cerrar: number;
          clases_por_venir: number;
          presentes: number;
          ausentes: number;
          excusas: number;
          reposiciones: number;
          /** Desde cuándo se le puede exigir clase a esta franja. null = la academia nunca registró ninguna. */
          desde_efectivo: string | null;
        }[];
      };
      notas_listar: {
        Args: { p_filtro?: string; p_cliente?: number | null; p_limite?: number };
        Returns: {
          id: number;
          texto: string;
          autor_id: string;
          autor_nombre: string | null;
          prioridad: NotaPrioridad;
          estado: NotaEstado;
          para_todos: boolean;
          cliente_id: number | null;
          cliente_nombre: string | null;
          clase_id: number | null;
          clase_etiqueta: string | null;
          evento_id: number | null;
          evento_nombre: string | null;
          resuelta_por_nombre: string | null;
          resuelta_el: string | null;
          editada_el: string | null;
          created_at: string;
          destinatarios: { id: string; nombre: string | null; leida: boolean }[];
          soy_destinatario: boolean;
          leida_por_mi: boolean;
          n_comentarios: number;
        }[];
      };
      nota_comentar: {
        Args: { p_nota_id: number; p_texto: string; p_destinatarios?: string[] };
        Returns: number;
      };
      nota_comentarios_listar: {
        Args: { p_nota_id: number };
        Returns: {
          id: number;
          autor_id: string;
          autor_nombre: string | null;
          texto: string;
          editado_el: string | null;
          created_at: string;
        }[];
      };
      /** P&G del evento (sin `p_evento` = todos). Ingreso = facturas de Siigo con ese evento_id. */
      eventos_pyg: {
        Args: { p_evento?: number | null };
        Returns: {
          evento_id: number;
          ingreso_facturado: number;
          ingreso_cobrado: number;
          pendiente_cobro: number;
          gastos: number;
          pago_profesores: number;
          costo_total: number;
          utilidad: number;
          facturas: number;
        }[];
      };
      /**
       * Facturas que podrían ser del evento (±15 días) y aún no están atadas.
       * NO filtra por estado_conciliacion a propósito: las `auto` y `mostrador` nunca pasan
       * por la cola de /pagos, así que este es el único sitio donde se pueden atar.
       * `p_solo_servicio` en false trae todo lo facturado en la ventana (consumo de asistentes).
       */
      evento_facturas_candidatas: {
        Args: { p_evento: number; p_solo_servicio?: boolean; p_dias_antes?: number; p_dias_despues?: number };
        Returns: {
          id: number;
          numero: string | null;
          fecha: string;
          cliente_nombre_siigo: string | null;
          cliente_identificacion: string | null;
          cliente_id: number | null;
          total: number;
          saldo: number;
          estado_conciliacion: string;
          detalle: string | null;
          /** Parte de la factura que es del servicio del evento. Informativo: se ata completa. */
          monto_evento: number;
          /** Totales de TODO el conjunto candidato, no solo de las filas devueltas. */
          n_candidatas: number;
          monto_candidatas: number;
        }[];
      };
      /**
       * Ata facturas a un evento abierto y devuelve cuántas quedaron atadas.
       * SECURITY DEFINER a propósito: quien gestiona eventos NO tiene escritura sobre
       * `siigo_facturas` (una política de UPDATE no puede limitarse a una columna).
       */
      evento_atar_facturas: {
        Args: { p_evento: number; p_facturas: number[] };
        Returns: number;
      };
      /** Quita la factura de su evento. Falla si el evento ya está cerrado. */
      evento_soltar_factura: {
        Args: { p_factura: number };
        Returns: number;
      };
      /** Utilidad congelada de los eventos CERRADOS imputados al periodo (lo que suma el dashboard). */
      eventos_resultado_periodo: {
        Args: { p_desde: string; p_hasta: string };
        Returns: {
          evento_id: number;
          nombre: string;
          servicio_id: number | null;
          /** Fecha de imputación: coalesce(fecha_fin, fecha_inicio). */
          fecha: string;
          utilidad: number;
        }[];
      };
      /** Facturado de eventos ABIERTOS que cae en el periodo: lo que el dashboard aún no muestra. */
      eventos_retenido: {
        Args: { p_desde: string; p_hasta: string };
        Returns: { eventos: number; facturado: number }[];
      };
      siigo_ingreso_servicio: {
        Args: { p_desde: string; p_hasta: string };
        Returns: { servicio_id: number; monto: number }[];
      };
      siigo_cartera: {
        Args: Record<string, never>;
        Returns: { cliente_id: number; saldo: number }[];
      };
      siigo_resumen_cliente: {
        Args: { p_cliente: number };
        Returns: { servicio_id: number; facturado: number; pagado: number }[];
      };
      /**
       * `p_excluir_eventos` (solo lo usa el dashboard) deja fuera las facturas atadas a un
       * evento: su aporte entra como utilidad neta vía `eventos_resultado_periodo`, no como
       * bruto. Con el default (false) las cifras son las de siempre y cuadran con Siigo.
       */
      siigo_recaudo: {
        Args: { p_desde: string; p_hasta: string; p_excluir_eventos?: boolean };
        Returns: { facturado: number; cobrado: number; pendiente: number }[];
      };
      siigo_ingreso_diario: {
        Args: { p_desde: string; p_hasta: string; p_excluir_eventos?: boolean };
        Returns: { fecha: string; monto: number; facturas: number }[];
      };
      /** Facturado por día (total - nota_credito). OJO: `siigo_ingreso_diario` es lo COBRADO. */
      siigo_facturado_diario: {
        Args: { p_desde: string; p_hasta: string; p_excluir_eventos?: boolean };
        Returns: { fecha: string; monto: number; facturas: number }[];
      };
      /** Facturado por servicio. OJO: `siigo_ingreso_servicio` es lo COBRADO. */
      siigo_facturado_servicio: {
        Args: { p_desde: string; p_hasta: string; p_excluir_eventos?: boolean };
        Returns: { servicio_id: number; monto: number }[];
      };
      siigo_ingreso_dia_servicio: {
        Args: { p_desde: string; p_hasta: string };
        Returns: { fecha: string; servicio_id: number; monto: number }[];
      };
      siigo_clientes_facturacion: {
        Args: Record<string, never>;
        Returns: { nit: string; nombre: string }[];
      };
      siigo_set_notas_credito: {
        Args: { p: { siigo_id: string; monto: number; numeros: string }[] };
        Returns: number;
      };
      siigo_facturas_cliente_servicio: {
        Args: { p_cliente: number };
        Returns: {
          servicio_id: number | null;
          numero: string;
          fecha: string;
          facturado: number;
          pagado: number;
          pendiente: number;
          nota_credito: number;
          nc_numero: string | null;
        }[];
      };
      siigo_top_clientes: {
        Args: { p_desde: string; p_hasta: string; p_limite?: number };
        Returns: { cliente_id: number | null; nombre: string | null; pagado: number }[];
      };
    };
    Enums: {
      app_role: AppRole;
      cliente_estado: ClienteEstado;
      cliente_documento_tipo: ClienteDocumentoTipo;
      deporte: Deporte;
      clase_tipo: ClaseTipo;
      clase_estado: ClaseEstado;
      paquete_estado: PaqueteEstado;
      pago_estado: PagoEstado;
      compensacion_tipo: CompensacionTipo;
      asistencia_estado: AsistenciaEstado;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Servicio = Database["public"]["Tables"]["servicios"]["Row"];
export type Evento = Database["public"]["Tables"]["eventos"]["Row"];
export type EventoParticipante = Database["public"]["Tables"]["evento_participantes"]["Row"];
export type EventoProfesor = Database["public"]["Tables"]["evento_profesores"]["Row"];
export type EventoGasto = Database["public"]["Tables"]["evento_gastos"]["Row"];
export type EventoPyg = Database["public"]["Functions"]["eventos_pyg"]["Returns"][number];
export type SiigoFactura = Database["public"]["Tables"]["siigo_facturas"]["Row"];
export type SiigoFacturaLinea = Database["public"]["Tables"]["siigo_factura_lineas"]["Row"];
export type Turno = Database["public"]["Tables"]["turno"]["Row"];
export type TurnoPausa = Database["public"]["Tables"]["turno_pausa"]["Row"];
export type Festivo = Database["public"]["Tables"]["festivo"]["Row"];
export type QuioscoEstado = Database["public"]["Functions"]["quiosco_estado"]["Returns"][number];
export type Nota = Database["public"]["Tables"]["notas"]["Row"];
export type NotaDestinatario = Database["public"]["Tables"]["nota_destinatarios"]["Row"];
export type NotaComentario = Database["public"]["Tables"]["nota_comentarios"]["Row"];
/** Miembro del staff visible para todo el equipo — nunca documento ni teléfono. */
export type StaffMiembro = {
  id: string;
  nombre: string | null;
  role: AppRole;
  activo: boolean;
};
