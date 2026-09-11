// ============================================================
// shared/domain/enums.ts
// Enums de dominio compartidos en todo el CRM
// ============================================================

// Roles de usuario
export enum UserRole {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  AGENT = 'agent',
}

// Estado de usuario
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

// Estados comerciales del lote (decisiones cerradas por el negocio)
export enum LotStatus {
  DISPONIBLE = 'disponible',
  RESERVADO = 'reservado',
  ADELANTO = 'adelanto',
  PRIMERA_CUOTA = 'primera_cuota',
  VENDIDO = 'vendido',
}

// Colores por estado para el plano SVG
export const LOT_STATUS_COLOR: Record<LotStatus, string> = {
  [LotStatus.DISPONIBLE]: '#D1D5DB', // Disponible (gris)
  [LotStatus.RESERVADO]: '#F2B94B', // Reservado (amarillo)
  [LotStatus.ADELANTO]: '#4B83C4', // Con adelanto (azul)
  [LotStatus.PRIMERA_CUOTA]: '#8064A2', // Primera cuota (violeta)
  [LotStatus.VENDIDO]: '#1877F2', // Vendido (azul de marca)
};

export const LOT_STATUS_LABEL: Record<LotStatus, string> = {
  [LotStatus.DISPONIBLE]: 'Disponible',
  [LotStatus.RESERVADO]: 'Reservado',
  [LotStatus.ADELANTO]: 'Con adelanto',
  [LotStatus.PRIMERA_CUOTA]: 'Primera cuota',
  [LotStatus.VENDIDO]: 'Vendido',
};

// Tipo de pago
export enum PaymentType {
  RESERVA = 'reserva',
  ADELANTO = 'adelanto',
  PRIMERA_CUOTA = 'primera_cuota',
  CUOTA = 'cuota',
  OTROS = 'otros',
}

export enum PaymentStatus {
  PENDIENTE = 'pendiente',
  PAGADO = 'pagado',
  VENCIDO = 'vencido',
}

// Pipeline de clientes / leads
export enum ClientPipeline {
  NUEVO = 'nuevo',
  CONTACTADO = 'contactado',
  VISITO = 'visito',
  RESERVADO = 'reservado',
  COMPRO = 'compro',
  PERDIDO = 'perdido',
}

// Canales / fuentes de captación
export enum CampaignChannel {
  FACEBOOK = 'facebook',
  TIKTOK = 'tiktok',
  INSTAGRAM = 'instagram',
  WEB = 'web',
  REFERIDOS = 'referidos',
  OTRO = 'otro',
}

// Tipo de transacción financiera
export enum TxnType {
  INGRESO = 'ingreso',
  EGRESO = 'egreso',
}

// Estado del plano
export enum PlanStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}
