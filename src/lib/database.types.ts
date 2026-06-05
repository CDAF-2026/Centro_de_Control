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
    };
    CompositeTypes: Record<string, never>;
  };
};
