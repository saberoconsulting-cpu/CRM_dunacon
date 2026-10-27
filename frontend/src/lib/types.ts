import { moneyGlobal } from './currency';
// src/lib/types.ts
// Tipos compartidos del frontend alineados con el backend

export type UserRole = 'superadmin' | 'admin' | 'agent';

export type LotStatus =
  | 'disponible'
  | 'reservado'
  | 'adelanto'
  | 'primera_cuota'
  | 'vendido'
  | 'alquilado'
  | 'promocion'
  | 'segunda_etapa';

export const LOT_STATUS_SELECT_OPTIONS: Array<{ value: LotStatus; label: string }> = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'reservado', label: 'Separado' },
  { value: 'vendido', label: 'Vendido' },
  { value: 'promocion', label: 'En Promocion' },
  { value: 'segunda_etapa', label: '2da. Etapa' },
];

export const LOT_STATUS_EDIT_OPTIONS: Array<{ value: LotStatus; label: string }> = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'segunda_etapa', label: '2da. Etapa' },
  { value: 'reservado', label: 'Separado' },
  { value: 'promocion', label: 'En Promocion' },
];

// Color por estado de lote â€” paleta para plano, tabla y leyenda
export const LOT_STATUS_COLOR: Record<LotStatus, string> = {
  disponible: '#D1D5DB', // Gris
  reservado: '#F2B94B', // Amarillo sobrio
  adelanto: '#F2B94B', // Legacy: se muestra como Reservado
  primera_cuota: '#DC2626', // Legacy: se muestra como Vendido
  vendido: '#DC2626', // Rojo comercial para distinguir vendidos en el plano
  alquilado: '#DC2626', // Legacy: se muestra como Vendido
  promocion: '#F59E0B',
  segunda_etapa: '#0EA5E9',
};

// Identidad de marca (usada en planos/gráficos)
export const BRAND = {
  blue: '#1877F2',
  blueHover: '#166FE0',
  blueDark: '#1259C4',
  ink: '#171717',
  muted: '#6B7280',
  mutedLight: '#F3F4F6',
  border: '#E5E7EB',
  canvas: '#F6F7F9',
};

export const LOT_STATUS_LABEL: Record<LotStatus, string> = {
  disponible: 'Disponible',
  reservado: 'Separado',
  adelanto: 'Separado',
  primera_cuota: 'Vendido',
  vendido: 'Vendido',
  alquilado: 'Vendido',
  promocion: 'En Promocion',
  segunda_etapa: '2da Etapa',
};

export interface User {
  id: number;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  status: 'active' | 'inactive';
  photoUrl?: string | null;
  commissionRate?: string | number;
  monthlyGoalLots?: number;
  monthlyGoalAmount?: string | number;
  lastLoginAt?: string | null;
}

export interface AuthSession {
  token: string;
  user: {
    id: number;
    email: string;
    name: string;
    phone?: string;
    role: UserRole;
    photoUrl?: string | null;
    commissionRate?: number;
    monthlyGoalLots?: number;
    monthlyGoalAmount?: number;
  };
}

export interface Point {
  x: number;
  y: number;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  location?: string;
  lotDeliveryDate?: string | null;
  condominiumDeliveryDate?: string | null;
  latitude?: number;
  longitude?: number;
  coverImageUrl?: string;
  logoImageUrl?: string;
  status: 'active' | 'inactive';
  referencePrice?: number;
  deletedAt?: string | null;
  stats?: { total: number; disponibles: number; reservados: number; adelantos: number; primeras: number; vendidos: number };
}

export interface PlanData {
  id: number;
  projectId: number;
  imageUrl?: string;
  imageWidth: number;
  imageHeight: number;
  status: 'draft' | 'published';
  viewBox?: string;
}

export interface Block {
  id: number;
  projectId: number;
  planId: number;
  name: string;
  points: Point[];
  color?: string;
  address?: string;
}

export type Street = Block;

export interface Lot {
  id: number;
  projectId: number;
  planId: number;
  blockId: number | null;
  streetId?: number | null;
  code: string;
  address?: string | null;
  points: Point[];
  areaM2: number;
  price: number;
  status: LotStatus;
  sellingStage?: 'disponible' | 'separado' | 'aprobado' | 'vendido' | 'cancelado';
  clientId?: number | null;
  agentId?: number | null;
  agentName?: string | null;
  clientName?: string | null;
  type?: string | null;
  salePrice?: number | null;
  finalPrice?: number | null;
  planVoucherUrl?: string | null;
  blockName?: string | null;
  blockAddress?: string | null;
  streetName?: string | null;
  streetAddress?: string | null;
}

export interface Sale {
  id: number;
  projectId: number;
  lotId: number;
  clientId?: number | null;
  agentId: number | null;
  salePrice: number;
  saleDate: string;
  commission: number;
  conditions?: string;
  status: string;
  createdAt: string;
  agentName?: string;
  lotCode?: string;
}

export interface PaymentItem {
  id: number;
  projectId: number;
  lotId: number;
  clientId?: number;
  agentId?: number;
  type: string;
  amount: number;
  dueDate?: string | null;
  paidAt?: string | null;
  status: 'pendiente' | 'pagado' | 'vencido';
  note?: string;
}

// Los montos del CRM se muestran en dolares.
export function formatMoney(n: number | string | undefined | null): string {
  return moneyGlobal(n);
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '-';
  // A database DATE is a calendar day, not an instant at UTC midnight.
  // Keep that day intact; only timestamps are converted to Peru time.
  const calendarDate = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(calendarDate ? `${iso}T00:00:00Z` : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-PE', { timeZone: calendarDate ? 'UTC' : 'America/Lima', day: '2-digit', month: 'short', year: 'numeric' });
}

// Convierte puntos a string de atributo SVG `points`
export function pointsToString(pts: Point[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}
