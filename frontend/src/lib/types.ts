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

// Color por estado de lote — paleta para plano, tabla y leyenda
export const LOT_STATUS_COLOR: Record<LotStatus, string> = {
  disponible: '#D1D5DB', // Gris
  reservado: '#F2B94B', // Amarillo sobrio
  adelanto: '#4B83C4', // Azul sobrio
  primera_cuota: '#8064A2', // Violeta sobrio
  vendido: '#DC2626', // Rojo comercial para distinguir vendidos en el plano
  alquilado: '#16A36A',
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
  reservado: 'Reservado',
  adelanto: 'Con adelanto',
  primera_cuota: 'Primera cuota',
  vendido: 'Vendido',
  alquilado: 'Alquilado',
  promocion: 'En Promoción',
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
  latitude?: number;
  longitude?: number;
  coverImageUrl?: string;
  logoImageUrl?: string;
  status: 'active' | 'inactive';
  referencePrice?: number;
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

export interface Lot {
  id: number;
  projectId: number;
  planId: number;
  blockId: number | null;
  code: string;
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

// Utility para formatear moneda en Soles (Perú)
export function formatMoney(n: number | string | undefined | null): string {
  const v = Number(n || 0);
  return 'S/ ' + v.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Convierte puntos a string de atributo SVG `points`
export function pointsToString(pts: Point[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}
