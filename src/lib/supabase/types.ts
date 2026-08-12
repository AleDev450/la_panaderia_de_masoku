/**
 * Hand-written types mirroring supabase/migrations/0001_schema.sql. If you
 * have the Supabase CLI configured, prefer generating this file instead:
 *
 *   npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts
 */

export type EstadoEvento = "abierto" | "cerrado" | "resuelto";
export type CategoriaEvento = "dota2" | "csgo" | "lol" | "valorant" | "otros";
export type LadoApuesta = "a" | "b";
export type EstadoApuesta = "pendiente" | "parcial" | "completa" | "cancelada";
export type TipoMovimientoSaldo =
  | "retencion"
  | "devolucion"
  | "pago_ganancia"
  | "cancelacion"
  | "retiro";
export type EstadoRetiro = "pendiente" | "pagado" | "rechazado";
export type EstadoSolicitud = "pendiente" | "aprobada" | "rechazada";
export type EstadoRecarga = "pendiente" | "aprobada" | "rechazada";

// These use `type` (object literal aliases), not `interface`: TypeScript
// only grants object *literal* types an implicit string index signature,
// which `Record<string, unknown>` structural checks require. An `interface`
// with the exact same members fails `extends Record<string, unknown>`,
// which silently collapses every postgrest-js generic (Database["public"]
// stops extending GenericSchema) down to `never` — see the RPC/`.from()`
// argument types in src/actions/betting.ts if this ever regresses.

export type Perfil = {
  id: string;
  nickname: string;
  rol: "user" | "admin";
  saldo_disponible: number;
  saldo_retenido: number;
  /** Solo usados por el demo 1:1 (registro/login de jugadores); el motor /exchange no los toca. */
  full_name: string | null;
  phone: string | null;
  puntos: number;
  /** Suspensión por incumplimiento — conserva saldo e historial, solo impide apostar. */
  baneado: boolean;
  baneado_motivo: string | null;
  baneado_at: string | null;
  baneado_por: string | null;
  created_at: string;
  updated_at: string;
};

export type Evento = {
  id: string;
  nombre: string;
  lado_a: string;
  lado_b: string;
  estado: EstadoEvento;
  resultado: LadoApuesta | null;
  categoria: CategoriaEvento;
  /** Hora límite para apuestas nuevas — crear_apuesta las rechaza después. La resolución (resolver_evento) sigue siendo manual del admin, no depende de esto. */
  cierra_en: string;
  created_at: string;
  updated_at: string;
};

export type Apuesta = {
  id: string;
  evento_id: string;
  usuario_id: string;
  lado: LadoApuesta;
  monto_total: number;
  monto_matcheado: number;
  monto_pendiente: number;
  estado: EstadoApuesta;
  created_at: string;
  updated_at: string;
};

export type Emparejamiento = {
  id: string;
  evento_id: string;
  apuesta_a_id: string;
  apuesta_b_id: string;
  monto: number;
  created_at: string;
};

export type MovimientoSaldo = {
  id: string;
  usuario_id: string;
  tipo: TipoMovimientoSaldo;
  monto: number;
  apuesta_id: string | null;
  evento_id: string | null;
  created_at: string;
};

export type ComisionPlataforma = {
  id: string;
  evento_id: string;
  monto: number;
  created_at: string;
};

export type Recarga = {
  id: string;
  usuario_id: string;
  /** Lo que declaró el jugador. */
  monto_solicitado: number;
  /** Lo que el admin acreditó de verdad; null mientras no esté aprobada. */
  monto_acreditado: number | null;
  /** Data URL de la imagen del comprobante (ver 0009_recargas.sql). */
  comprobante: string;
  estado: EstadoRecarga;
  revisado_por: string | null;
  revisado_at: string | null;
  created_at: string;
};

/** Fila que devuelve el RPC `admin_metricas` (0010). Postgres entrega los
 * numeric como string por el driver, así que se tipan como number|string
 * y la UI los normaliza con Number(). */
export type AdminMetricas = {
  depositado_hoy: number;
  retirado_hoy: number;
  pagado_hoy: number;
  ganancia_hoy: number;
  ganancia_total: number;
  usuarios_total: number;
  usuarios_baneados: number;
  eventos_abiertos: number;
  retiros_pendientes: number;
};

export type Retiro = {
  id: string;
  usuario_id: string;
  monto: number;
  /** Copia del teléfono al momento de pedir el retiro. */
  telefono_destino: string;
  estado: EstadoRetiro;
  motivo_rechazo: string | null;
  revisado_por: string | null;
  revisado_at: string | null;
  created_at: string;
};

export type SolicitudTelefono = {
  id: string;
  usuario_id: string;
  telefono_actual: string | null;
  telefono_nuevo: string;
  motivo: string | null;
  estado: EstadoSolicitud;
  revisado_por: string | null;
  revisado_at: string | null;
  created_at: string;
};

// Shape required by @supabase/postgrest-js's `GenericSchema` — every
// table needs `Relationships` even if empty, and `Views` must exist even
// unused, or the RPC/`.from()` generics silently collapse to `never`.
type NoRelationships = { Relationships: [] };

export interface Database {
  public: {
    Tables: {
      perfiles: {
        Row: Perfil;
        Insert: Partial<Perfil>;
        Update: Partial<Perfil>;
      } & NoRelationships;
      eventos: {
        Row: Evento;
        Insert: Partial<Evento>;
        Update: Partial<Evento>;
      } & NoRelationships;
      apuestas: {
        Row: Apuesta;
        Insert: Partial<Apuesta>;
        Update: Partial<Apuesta>;
      } & NoRelationships;
      emparejamientos: {
        Row: Emparejamiento;
        Insert: Partial<Emparejamiento>;
        Update: Partial<Emparejamiento>;
      } & NoRelationships;
      movimientos_saldo: {
        Row: MovimientoSaldo;
        Insert: Partial<MovimientoSaldo>;
        Update: Partial<MovimientoSaldo>;
      } & NoRelationships;
      comisiones_plataforma: {
        Row: ComisionPlataforma;
        Insert: Partial<ComisionPlataforma>;
        Update: Partial<ComisionPlataforma>;
      } & NoRelationships;
      solicitudes_telefono: {
        Row: SolicitudTelefono;
        Insert: Partial<SolicitudTelefono>;
        Update: Partial<SolicitudTelefono>;
      } & NoRelationships;
      recargas: {
        Row: Recarga;
        Insert: Partial<Recarga>;
        Update: Partial<Recarga>;
      } & NoRelationships;
      retiros: {
        Row: Retiro;
        Insert: Partial<Retiro>;
        Update: Partial<Retiro>;
      } & NoRelationships;
    };
    Views: Record<string, never>;
    Functions: {
      crear_apuesta: {
        Args: {
          p_usuario_id: string;
          p_evento_id: string;
          p_lado: LadoApuesta;
          p_monto: number;
        };
        Returns: Apuesta;
      };
      cancelar_apuesta: {
        Args: { p_apuesta_id: string; p_usuario_id: string };
        Returns: Apuesta;
      };
      resolver_evento: {
        Args: {
          p_evento_id: string;
          p_resultado: LadoApuesta;
          p_admin_id: string;
        };
        Returns: undefined;
      };
      admin_creditar_saldo: {
        Args: { p_admin_id: string; p_usuario_id: string; p_monto: number };
        Returns: Perfil;
      };
      admin_otorgar_puntos: {
        Args: { p_admin_id: string; p_usuario_id: string; p_puntos: number };
        Returns: Perfil;
      };
      admin_resolver_solicitud_telefono: {
        Args: { p_admin_id: string; p_solicitud_id: string; p_aprobar: boolean };
        Returns: SolicitudTelefono;
      };
      actualizar_nickname: {
        Args: { p_usuario_id: string; p_nickname: string };
        Returns: Perfil;
      };
      admin_resolver_recarga: {
        Args: {
          p_admin_id: string;
          p_recarga_id: string;
          p_aprobar: boolean;
          p_monto_acreditado?: number | null;
        };
        Returns: Recarga;
      };
      admin_banear_usuario: {
        Args: {
          p_admin_id: string;
          p_usuario_id: string;
          p_banear: boolean;
          p_motivo?: string | null;
        };
        Returns: Perfil;
      };
      admin_cambiar_estado_evento: {
        Args: {
          p_admin_id: string;
          p_evento_id: string;
          p_abrir: boolean;
          p_minutos?: number;
        };
        Returns: Evento;
      };
      admin_metricas: {
        Args: { p_admin_id: string };
        Returns: AdminMetricas[];
      };
      solicitar_retiro: {
        Args: { p_usuario_id: string; p_monto: number };
        Returns: Retiro;
      };
      admin_resolver_retiro: {
        Args: {
          p_admin_id: string;
          p_retiro_id: string;
          p_pagar: boolean;
          p_motivo?: string | null;
        };
        Returns: Retiro;
      };
    };
  };
}
