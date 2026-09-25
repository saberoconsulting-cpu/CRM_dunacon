import type { CSSProperties, ReactNode } from 'react';

export const KPI_GRID_6 = 'kpi-grid-6';
export const KPI_GRID_8 = 'kpi-grid-8';
export const KPI_GRID_3 = 'kpi-grid-3';

export type KpiCardSize = 'compact' | 'expanded';

const LABEL_CLASS = 'min-w-0 text-[10px] font-semibold uppercase leading-tight tracking-wide sm:text-[11px]';
const VALUE_CLASS = 'w-full max-w-full whitespace-nowrap font-extrabold tabular-nums leading-none';
const HELPER_CLASS = 'mt-1 truncate text-[10px] font-normal leading-tight sm:text-[11px]';

function valueFitStyle(value: ReactNode, tone: string, size: KpiCardSize) {
  const style: CSSProperties = { color: tone };
  if (typeof value !== 'string' && typeof value !== 'number') return style;

  const chars = String(value).replace(/\s/g, '').length;
  if (chars <= 7) return style;

  const expanded = size === 'expanded';
  if (chars <= 10) style.fontSize = expanded ? 'clamp(1.15rem, 1.5vw, 1.5rem)' : 'clamp(1.05rem, 1.35vw, 1.3rem)';
  else if (chars <= 13) style.fontSize = expanded ? 'clamp(1rem, 1.3vw, 1.3rem)' : 'clamp(0.92rem, 1.15vw, 1.1rem)';
  else if (chars <= 16) style.fontSize = expanded ? 'clamp(0.86rem, 1.1vw, 1.1rem)' : 'clamp(0.8rem, 0.95vw, 0.95rem)';
  else if (chars <= 20) style.fontSize = expanded ? 'clamp(0.72rem, 0.9vw, 0.92rem)' : 'clamp(0.68rem, 0.8vw, 0.82rem)';
  else style.fontSize = expanded ? 'clamp(0.64rem, 0.78vw, 0.82rem)' : 'clamp(0.6rem, 0.7vw, 0.72rem)';
  style.letterSpacing = '0';
  return style;
}

function sizeClasses(size: KpiCardSize) {
  if (size === 'expanded') {
    return {
      box: 'min-h-[104px] px-3.5 py-3.5 sm:min-h-[114px] sm:px-4 sm:py-4',
      icon: 'h-8 w-8 text-sm',
      value: 'mt-1.5 text-base sm:text-lg',
      blob: 'h-12 w-12 sm:h-16 sm:w-16',
    };
  }
  return {
    box: 'min-h-[96px] px-3 py-3 sm:min-h-[106px] sm:px-4 sm:py-4',
    icon: 'h-8 w-8 text-sm',
    value: 'mt-1.5 text-base sm:text-[17px]',
    blob: 'h-12 w-12 sm:h-16 sm:w-16',
  };
}

export function KpiCardIcon({ tone, ring, children, size = 'compact' }: { tone: string; ring: string; children: ReactNode; size?: KpiCardSize }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-md ${sizeClasses(size).icon}`} style={{ background: ring, color: tone }}>
      {children}
    </span>
  );
}

/** Etiqueta en mayusculas con icono a la izquierda. */
export function KpiCardLabel({ children, icon, tone, ring, truncate = false, size = 'compact' }: {
  children: ReactNode; icon?: ReactNode; tone: string; ring: string; truncate?: boolean; size?: KpiCardSize;
}) {
  const label = (
    <span className={`kpi-label-text ${LABEL_CLASS} ${truncate ? 'truncate' : ''}`} style={{ color: '#6B7280' }} title={typeof children === 'string' ? children : undefined}>
      {children}
    </span>
  );
  if (!icon) return <div className="kpi-label relative">{label}</div>;
  return (
    <div className="kpi-label relative flex items-center gap-2">
      <KpiCardIcon tone={tone} ring={ring} size={size}>{icon}</KpiCardIcon>
      {label}
    </div>
  );
}

export function KpiCardValue({ children, tone, size = 'compact', align = 'left' }: { children: ReactNode; tone: string; size?: KpiCardSize; align?: 'left' | 'center' }) {
  const isText = typeof children === 'string' || typeof children === 'number';
  return (
    <div className={`kpi-value relative ${VALUE_CLASS} ${sizeClasses(size).value} ${align === 'center' ? 'text-center' : ''}`} style={valueFitStyle(children, tone, size)} title={isText ? String(children) : undefined}>
      {children}
    </div>
  );
}

/** Texto de apoyo bajo el valor. */
export function KpiCardHelper({ children }: { children: ReactNode }) {
  return <p className={`kpi-helper ${HELPER_CLASS}`} style={{ color: '#6B7280' }}>{children}</p>;
}

export function KpiCardShell({
  tone,
  ring,
  children,
  size = 'compact',
  className = '',
  onClick,
  title,
  ariaLabel,
}: {
  tone: string;
  ring: string;
  children: ReactNode;
  size?: KpiCardSize;
  className?: string;
  onClick?: () => void;
  title?: string;
  ariaLabel?: string;
}) {
  const s = sizeClasses(size);
  const base = [
    'card-card-kpi relative min-w-0 overflow-hidden transition-all',
    s.box,
    onClick ? 'cursor-pointer text-left hover:-translate-y-0.5 hover:shadow-lg' : '',
    className,
  ].filter(Boolean).join(' ');
  const style = { borderTop: `3px solid ${tone}` };

  const inner = (
    <>
      <div className={`kpi-blob pointer-events-none absolute -right-3 -top-3 rounded-full opacity-20 sm:-right-4 sm:-top-4 ${s.blob}`} style={{ background: ring }} />
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        {children}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={base} style={style} onClick={onClick} title={title} aria-label={ariaLabel || title}>
        {inner}
      </button>
    );
  }
  return (
    <div className={base} style={style} title={title}>
      {inner}
    </div>
  );
}

/**
 * Tarjeta KPI con etiqueta + valor + texto de apoyo.
 */
export function KpiCard({
  label,
  value,
  helper,
  icon,
  tone = '#1259C4',
  size = 'compact',
  truncateLabel = false,
  onClick,
  ariaLabel,
}: {
  label: string;
  value: ReactNode;
  helper?: string;
  icon?: ReactNode;
  tone?: string;
  size?: KpiCardSize;
  /** etiquetas largas se recortan con "...". */
  truncateLabel?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const ring = `${tone}1F`;
  return (
    <KpiCardShell tone={tone} ring={ring} size={size} className="flex flex-col" onClick={onClick} title={label} ariaLabel={ariaLabel}>
      <KpiCardLabel icon={icon} tone={tone} ring={ring} truncate={truncateLabel} size={size}>{label}</KpiCardLabel>
      <KpiCardValue tone={tone} size={size}>{value}</KpiCardValue>
      {helper && <KpiCardHelper>{helper}</KpiCardHelper>}
    </KpiCardShell>
  );
}

/**
 * Tile con el valor a la izquierda y el icono a la derecha.
 */
export function MetricTile({
  label,
  value,
  icon,
  helper,
  tone = '#1877F2',
  size = 'compact',
  truncateLabel = false,
  onClick,
  ariaLabel,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  helper?: string;
  tone?: string;
  size?: KpiCardSize;
  truncateLabel?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const ring = `${tone}1F`;
  return (
    <KpiCardShell tone={tone} ring={ring} size={size} className="flex flex-col" onClick={onClick} title={label} ariaLabel={ariaLabel}>
      <div className="kpi-tile-top relative flex items-start justify-between gap-3">
        <div className={`kpi-label min-w-0 flex-1 ${LABEL_CLASS} ${truncateLabel ? 'truncate' : ''}`} style={{ color: '#6B7280' }} title={label}>{label}</div>
        <KpiCardIcon tone={tone} ring={ring} size={size}>{icon}</KpiCardIcon>
      </div>
      <div className="min-w-0 max-w-full">
        <KpiCardValue tone={tone} size={size} align="center">{value}</KpiCardValue>
      </div>
      {helper && <KpiCardHelper>{helper}</KpiCardHelper>}
    </KpiCardShell>
  );
}

