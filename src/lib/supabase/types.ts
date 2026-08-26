/**
 * Hand-written types mirroring supabase/migrations/0001_schema.sql. If you
 * have the Supabase CLI configured, prefer generating this file instead:
 *
 *   npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts
 */

export type EstadoEvento = "abierto" | "cerrado" | "resuelto" | "cancelado";
export type CategoriaEvento =
  | "dota2"
  | "csgo"
  | "lol"
  | "valorant"
  | "otros"
  /** Mesa 1v1 sin reloj (0039). La app no reparte cartas: solo señaliza el turno. */
  | "blackjack";

/** Lo que devuelve `unirse_blackjack` (0041): en qué mesa y lado quedaste,
 * y si hubo que abrir una mesa nueva porque el lado que pediste estaba
 * tomado en todas. */
export type AsientoBlackjack = {
  apuesta_id: string;
  evento_id: string;
  lado: LadoApuesta;
  monto_total: number;
  monto_matcheado: number;
  monto_pendiente: number;
  mesa_nombre: string;
  mesa_nueva: boolean;
};

/** Señal de turno de un lado en una mesa de blackjack (0039). */
export type EstadoTurno = "esperando" | "pidiendo" | "quedado";
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
  /** Plata de mentira (0036): no viene de una recarga, no se puede retirar y
   * no entra en yape_esperado. Va aparte del saldo real a propósito. */
  saldo_fake: number;
  saldo_fake_retenido: number;
  /** Solo usados por el demo 1:1 (registro/login de jugadores); el motor /exchange no los toca. */
  full_name: string | null;
  phone: string | null;
  puntos: number;
  /** Suspensión por incumplimiento — conserva saldo e historial, solo impide apostar. */
  baneado: boolean;
  baneado_motivo: string | null;
  baneado_at: string | null;
  baneado_por: string | null;
  /** IP desde la que se creó la cuenta (0033) — para rastrear/bloquear abusos. */
  ip_registro: string | null;
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
  /** Hora límite para apuestas nuevas — crear_apuesta las rechaza después. */
  cierra_en: string;
  /** Ganador declarado pero todavía sin pagar (ver 0013). Al confirmar
   * el pago se copia a `resultado` y el estado pasa a 'resuelto'. */
  resultado_preliminar: LadoApuesta | null;
  declarado_at: string | null;
  /** Solo se admite una corrección del resultado declarado. */
  correcciones: number;
  /** Por qué se canceló (0029) — null si nunca se canceló. */
  cancelado_motivo: string | null;
  /** Blackjack (0039): mesa madre de la que salió esta sala. Null en la
   * mesa que publicó el staff, que además es la sala número 1. */
  mesa_origen_id: string | null;
  turno_a: EstadoTurno;
  turno_b: EstadoTurno;
  /** Cuántas cartas pidió cada lado en esta mano — la cuenta la lleva el
   * que reparte, la app solo suma los clics. */
  cartas_a: number;
  cartas_b: number;
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
  /** Se pagó con saldo fake (0036). Una apuesta es 100% fake o 100% real. */
  es_fake: boolean;
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
  /** Movió saldo fake, no real (0036) — se excluye de las métricas de plata. */
  es_fake: boolean;
  created_at: string;
};

export type ComisionPlataforma = {
  id: string;
  evento_id: string;
  /** Resultado REAL del evento para la casa (0036). Sin apuestas fake es la
   * comisión de siempre (0.20 por sol emparejado); con fake de por medio
   * puede ser NEGATIVO — un ganador real contra contraparte fake cuesta
   * 0.80 por sol. */
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
  /** IP desde la que se envió la recarga (0033). */
  ip: string | null;
  created_at: string;
};

export type CorreccionRecarga = {
  id: string;
  admin_id: string;
  recarga_id: string;
  monto_anterior: number;
  monto_nuevo: number;
  motivo: string;
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
  /** Dinero todavía en saldo de jugadores (disponible + retenido) — no retirado aún. */
  saldos_usuarios_total: number;
  /** Retiros propios del admin o pagos a trabajadores (0022_pagos_manuales.sql), histórico. */
  pagos_manuales_total: number;
  /** Correcciones manuales +/- a yape_esperado (0024_ajustes_saldo_y_yape.sql), histórico. */
  ajustes_yape_total: number;
  /** recargas_aprobadas − retiros_pagados − pagos_manuales + ajustes_yape, calculado directo de esas tablas. */
  yape_esperado: number;
  /** A cuántas personas les yapeaste hoy — acompaña a `retirado_hoy`, que es el monto (0036). */
  retiros_pagados_hoy: number;
  /** Saldo fake dando vueltas (disponible + en juego). No es plata: no entra en yape_esperado (0036). */
  saldo_fake_total: number;
};

/** Una fila del resumen día a día (0034/0035). Fecha en calendario de Perú;
 * montos del día. `ganancia_real` = comisión − pagos a personal que restan;
 * `yape_acumulado` = cuánto deberías tener en el Yape al cierre de ese día. */
export type ResumenDia = {
  fecha: string;
  depositado: number;
  apostado: number;
  pagado: number;
  /** Retiros yapeados ese día (0038) — la plata que de verdad salió del Yape. */
  retirado: number;
  comision: number;
  ganancia_real: number;
  yape_acumulado: number;
};

export type PagoManual = {
  id: string;
  admin_id: string;
  concepto: string;
  monto: number;
  /** Si resta de ganancia_hoy/ganancia_total (0030) — true para pagos
   * nuevos, false para los que ya existían cuando se agregó la columna. */
  afecta_ganancia: boolean;
  created_at: string;
};

export type AjusteSaldo = {
  id: string;
  admin_id: string;
  usuario_id: string;
  saldo_anterior: number;
  saldo_nuevo: number;
  motivo: string;
  /** El ajuste fue sobre el saldo fake, no el real (0036). */
  es_fake: boolean;
  created_at: string;
};

export type AjusteYape = {
  id: string;
  admin_id: string;
  /** Puede ser negativo — corrige yape_esperado hacia abajo. */
  monto: number;
  motivo: string;
  created_at: string;
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

export type RequisitoRetiro = {
  recargas_aprobadas: number;
  monto_apostado: number;
  monto_requerido: number;
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

/** Una convocatoria abierta a sorteo (0037) — ej. los cofres Carmesí. */
export type Sorteo = {
  id: string;
  admin_id: string;
  nombre: string;
  premio: string;
  /** Los pasos de "cómo participar", tal cual se muestran en la página. */
  instrucciones: string | null;
  fecha_sorteo: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type InscripcionSorteo = {
  id: string;
  sorteo_id: string;
  usuario_id: string;
  discord: string;
  steam_url: string;
  /** Chances en el sorteo (0038). Lo escribe el admin según el tier que compró. */
  tickets: number;
  ganador: boolean;
  created_at: string;
  updated_at: string;
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
      correcciones_recarga: {
        Row: CorreccionRecarga;
        Insert: Partial<CorreccionRecarga>;
        Update: Partial<CorreccionRecarga>;
      } & NoRelationships;
      retiros: {
        Row: Retiro;
        Insert: Partial<Retiro>;
        Update: Partial<Retiro>;
      } & NoRelationships;
      pagos_manuales: {
        Row: PagoManual;
        Insert: Partial<PagoManual>;
        Update: Partial<PagoManual>;
      } & NoRelationships;
      ajustes_saldo: {
        Row: AjusteSaldo;
        Insert: Partial<AjusteSaldo>;
        Update: Partial<AjusteSaldo>;
      } & NoRelationships;
      ajustes_yape: {
        Row: AjusteYape;
        Insert: Partial<AjusteYape>;
        Update: Partial<AjusteYape>;
      } & NoRelationships;
      sorteos: {
        Row: Sorteo;
        Insert: Partial<Sorteo>;
        Update: Partial<Sorteo>;
      } & NoRelationships;
      inscripciones_sorteo: {
        Row: InscripcionSorteo;
        Insert: Partial<InscripcionSorteo>;
        Update: Partial<InscripcionSorteo>;
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
      admin_declarar_resultado: {
        Args: { p_admin_id: string; p_evento_id: string; p_resultado: LadoApuesta };
        Returns: Evento;
      };
      admin_corregir_resultado: {
        Args: { p_admin_id: string; p_evento_id: string; p_resultado: LadoApuesta };
        Returns: Evento;
      };
      admin_confirmar_pago: {
        Args: { p_admin_id: string; p_evento_id: string };
        Returns: Evento;
      };
      liquidar_eventos_vencidos: {
        Args: Record<string, never>;
        Returns: number;
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
      admin_borrar_recargas: {
        Args: { p_admin_id: string };
        Returns: number;
      };
      admin_eliminar_usuario: {
        Args: { p_admin_id: string; p_usuario_id: string };
        Returns: void;
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
      admin_corregir_monto_recarga: {
        Args: {
          p_admin_id: string;
          p_recarga_id: string;
          p_monto_nuevo: number;
          p_motivo: string;
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
      admin_cancelar_evento: {
        Args: { p_admin_id: string; p_evento_id: string; p_motivo?: string | null };
        Returns: Evento;
      };
      admin_metricas: {
        Args: { p_admin_id: string };
        Returns: AdminMetricas[];
      };
      admin_resumen_diario: {
        Args: { p_admin_id: string; p_desde: string; p_hasta: string };
        Returns: ResumenDia[];
      };
      rate_limit_check: {
        Args: { p_clave: string; p_max: number; p_ventana_segundos: number };
        Returns: boolean;
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
      admin_revertir_retiro: {
        Args: { p_admin_id: string; p_retiro_id: string; p_motivo: string };
        Returns: Retiro;
      };
      admin_eliminar_evento_prueba: {
        Args: { p_admin_id: string; p_evento_id: string };
        Returns: void;
      };
      requisito_retiro: {
        Args: { p_usuario_id: string };
        Returns: RequisitoRetiro[];
      };
      admin_resetear_plataforma: {
        Args: { p_admin_id: string };
        Returns: string[];
      };
      admin_registrar_pago_manual: {
        Args: { p_admin_id: string; p_concepto: string; p_monto: number };
        Returns: PagoManual;
      };
      admin_ajustar_saldo: {
        Args: {
          p_admin_id: string;
          p_usuario_id: string;
          p_nuevo_saldo: number;
          p_motivo: string;
        };
        Returns: Perfil;
      };
      admin_registrar_ajuste_yape: {
        Args: { p_admin_id: string; p_monto: number; p_motivo: string };
        Returns: AjusteYape;
      };
      admin_dar_saldo_fake: {
        Args: {
          p_admin_id: string;
          p_usuario_id: string;
          p_monto: number;
          p_motivo: string;
        };
        Returns: Perfil;
      };
      inscribirse_sorteo: {
        Args: {
          p_usuario_id: string;
          p_sorteo_id: string;
          p_discord: string;
          p_steam_url: string;
        };
        Returns: InscripcionSorteo;
      };
      admin_guardar_sorteo: {
        Args: {
          p_admin_id: string;
          p_sorteo_id: string | null;
          p_nombre: string;
          p_premio: string;
          p_instrucciones: string | null;
          p_fecha_sorteo: string | null;
          p_activo: boolean;
        };
        Returns: Sorteo;
      };
      admin_marcar_ganador: {
        Args: { p_admin_id: string; p_inscripcion_id: string; p_ganador: boolean };
        Returns: InscripcionSorteo;
      };
      unirse_blackjack: {
        Args: { p_usuario_id: string; p_lado: LadoApuesta; p_monto: number };
        Returns: AsientoBlackjack[];
      };
      marcar_turno: {
        Args: { p_usuario_id: string; p_evento_id: string; p_accion: string };
        Returns: Evento;
      };
      admin_servir_carta: {
        Args: { p_admin_id: string; p_evento_id: string; p_lado: LadoApuesta };
        Returns: Evento;
      };
      admin_reiniciar_turnos: {
        Args: { p_admin_id: string; p_evento_id: string };
        Returns: Evento;
      };
      admin_asignar_tickets: {
        Args: { p_admin_id: string; p_inscripcion_id: string; p_tickets: number };
        Returns: InscripcionSorteo;
      };
      admin_sortear_ganador: {
        Args: { p_admin_id: string; p_sorteo_id: string };
        Returns: InscripcionSorteo;
      };
    };
  };
}
