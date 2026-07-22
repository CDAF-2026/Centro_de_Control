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
  | "profesor";

export type ClienteEstado = "activo" | "retirado";

export type ClienteDocumentoTipo = "consentimiento" | "certificado_medico" | "otro";
export type EmpleadoDocumentoTipo = "contrato" | "hoja_vida" | "otro";

export type Deporte = "tenis" | "padel";
export type ClaseTipo = "academia" | "individual";
export type ClaseEstado = "programada" | "realizada" | "cancelada" | "no_show";
export type PaqueteEstado = "activo" | "agotado" | "vencido";
export type ServicioCategoriaSaldo = "academia" | "paquete" | "particular";
export type PagoEstado = "sin_asignar" | "asignado";
export type CompensacionTipo = "por_clase" | "fijo_comision" | "fisico";
export type AsistenciaEstado = "presente" | "ausente" | "excusa_medica" | "reposicion";
export type ReglaConcepto = "clase_particular" | "paquete" | "academia" | "siigo" | "clase" | "salario";
export type ReglaMetodo =
  | "pct_facturado"
  | "fijo_por_clase"
  | "escalonado_asistentes"
  | "por_alumno"
  | "pct_siigo_servicio"
  | "salario_fijo";
/** Un escalón del método `escalonado_asistentes`: desde `min` asistentes, se cobra `valor`. */
export type ReglaEscalon = { min: number; valor: number };

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
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role?: AppRole;
          nombre?: string | null;
          telefono?: string | null;
          documento?: string | null;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: AppRole;
          nombre?: string | null;
          telefono?: string | null;
          documento?: string | null;
          activo?: boolean;
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
          fecha_nacimiento: string | null;
          es_menor: boolean;
          celular: string | null;
          email: string | null;
          emergencia_nombre: string | null;
          emergencia_celular: string | null;
          emergencia_parentesco: string | null;
          factura_a_nombre: string | null;
          factura_a_nit: string | null;
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
          fecha_nacimiento?: string | null;
          es_menor?: boolean;
          celular?: string | null;
          email?: string | null;
          emergencia_nombre?: string | null;
          emergencia_celular?: string | null;
          emergencia_parentesco?: string | null;
          factura_a_nombre?: string | null;
          factura_a_nit?: string | null;
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
          fecha_nacimiento?: string | null;
          es_menor?: boolean;
          celular?: string | null;
          email?: string | null;
          emergencia_nombre?: string | null;
          emergencia_celular?: string | null;
          emergencia_parentesco?: string | null;
          factura_a_nombre?: string | null;
          factura_a_nit?: string | null;
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
          nivel: string | null;
          profesor_id: string | null;
          cancha: string | null;
          horario: string | null;
          precio: number;
          matricula: number;
          periodo_inicio: string | null;
          periodo_fin: string | null;
          dias_semana: number[];
          hora_inicio: string | null;
          hora_fin: string | null;
          valor_alumno: number;
          activa: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          codigo: string;
          nombre: string;
          deporte: Deporte;
          nivel?: string | null;
          profesor_id?: string | null;
          cancha?: string | null;
          horario?: string | null;
          precio?: number;
          matricula?: number;
          periodo_inicio?: string | null;
          periodo_fin?: string | null;
          dias_semana?: number[];
          hora_inicio?: string | null;
          hora_fin?: string | null;
          valor_alumno?: number;
          activa?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["academias"]["Insert"]>;
        Relationships: [];
      };
      inscripciones: {
        Row: {
          id: number;
          academia_id: number;
          cliente_id: number;
          miembro_id: number | null;
          plan_frecuencia: number;
          descuento_pct: number;
          fecha_inscripcion: string;
          dias: number[];
          activa: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          academia_id: number;
          cliente_id: number;
          miembro_id?: number | null;
          plan_frecuencia: number;
          descuento_pct?: number;
          fecha_inscripcion?: string;
          dias?: number[];
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
          activo?: boolean;
          orden?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["servicios"]["Insert"]>;
        Relationships: [];
      };
      pagos: {
        Row: {
          id: number;
          origen: string;
          external_id: string | null;
          monto: number;
          fecha: string;
          servicio_id: number;
          concepto: string | null;
          estado: PagoEstado;
          created_at: string;
        };
        Insert: {
          id?: number;
          origen?: string;
          external_id?: string | null;
          monto: number;
          fecha?: string;
          servicio_id: number;
          concepto?: string | null;
          estado?: PagoEstado;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pagos"]["Insert"]>;
        Relationships: [];
      };
      asignaciones_pago: {
        Row: {
          id: number;
          pago_id: number;
          cliente_id: number;
          servicio: string;
          servicio_id: number | null;
          periodos: string[];
          created_at: string;
        };
        Insert: {
          id?: number;
          pago_id: number;
          cliente_id: number;
          servicio: string;
          servicio_id?: number | null;
          periodos?: string[];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["asignaciones_pago"]["Insert"]>;
        Relationships: [];
      };
      abonos: {
        Row: {
          id: number;
          cliente_id: number;
          servicio_id: number;
          monto: number;
          nota: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          cliente_id: number;
          servicio_id: number;
          monto: number;
          nota?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["abonos"]["Insert"]>;
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
          pago_id: number | null;
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
          pago_id?: number | null;
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
    };
    Views: Record<string, never>;
    Functions: {
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
      siigo_recaudo: {
        Args: { p_desde: string; p_hasta: string };
        Returns: { facturado: number; cobrado: number; pendiente: number }[];
      };
      siigo_ingreso_diario: {
        Args: { p_desde: string; p_hasta: string };
        Returns: { fecha: string; monto: number; facturas: number }[];
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
export type SiigoFactura = Database["public"]["Tables"]["siigo_facturas"]["Row"];
export type SiigoFacturaLinea = Database["public"]["Tables"]["siigo_factura_lineas"]["Row"];
