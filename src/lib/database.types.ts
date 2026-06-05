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

export type Deporte = "tenis" | "padel";
export type ClaseTipo = "academia" | "individual";
export type ClaseEstado = "programada" | "realizada" | "cancelada" | "no_show";
export type PaqueteEstado = "activo" | "agotado" | "vencido";

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
          contacto_emergencia: string | null;
          acudiente_id: number | null;
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
          contacto_emergencia?: string | null;
          acudiente_id?: number | null;
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
          contacto_emergencia?: string | null;
          acudiente_id?: number | null;
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
          plan_frecuencia: number;
          descuento_pct: number;
          fecha_inscripcion: string;
          activa: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          academia_id: number;
          cliente_id: number;
          plan_frecuencia: number;
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
          activo: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          nombre: string;
          deporte?: Deporte | null;
          num_clases: number;
          precio?: number;
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
          catalogo_id: number | null;
          num_clases: number;
          clases_consumidas: number;
          descuento_pct: number;
          estado: PaqueteEstado;
          vence_el: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          cliente_id: number;
          catalogo_id?: number | null;
          num_clases: number;
          clases_consumidas?: number;
          descuento_pct?: number;
          estado?: PaqueteEstado;
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
          paquete_cliente_id: number | null;
          profesor_id: string | null;
          deporte: Deporte | null;
          nivel: string | null;
          cancha: string | null;
          fecha: string;
          hora_inicio: string | null;
          hora_fin: string | null;
          precio: number | null;
          descuento_pct: number;
          estado: ClaseEstado;
          registrada_por: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          tipo: ClaseTipo;
          academia_id?: number | null;
          cliente_id?: number | null;
          paquete_cliente_id?: number | null;
          profesor_id?: string | null;
          deporte?: Deporte | null;
          nivel?: string | null;
          cancha?: string | null;
          fecha: string;
          hora_inicio?: string | null;
          hora_fin?: string | null;
          precio?: number | null;
          descuento_pct?: number;
          estado?: ClaseEstado;
          registrada_por?: string | null;
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
          presente: boolean;
          registrado_por: string | null;
          registrado_at: string;
        };
        Insert: {
          id?: number;
          clase_id: number;
          cliente_id: number;
          presente?: boolean;
          registrado_por?: string | null;
          registrado_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["asistencias"]["Insert"]>;
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
    Functions: Record<string, never>;
    Enums: {
      app_role: AppRole;
      cliente_estado: ClienteEstado;
      cliente_documento_tipo: ClienteDocumentoTipo;
      deporte: Deporte;
      clase_tipo: ClaseTipo;
      clase_estado: ClaseEstado;
      paquete_estado: PaqueteEstado;
    };
    CompositeTypes: Record<string, never>;
  };
};
