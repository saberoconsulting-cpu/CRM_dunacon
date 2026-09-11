'use client';
// Mapa interactivo estilo buscador inmobiliario.
// Panel izquierdo (~360px) con tarjetas ricas + mapa derecha (flex-1, MapLibre + OSM).
import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { Project, formatMoney } from '@/lib/types';

interface Props { projects: Project[]; onOpen: (id: number) => void; }

const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const STYLE: any = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: [OSM], tileSize: 256, attribution: '© OpenStreetMap' } },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#f2efe9' } },
    { id: 'osm', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 19 },
  ],
};

function stageTag(p: Project) {
  if (p.status === 'inactive') return { t: 'Inactivo', c: '#6B7280', b: '#F1F2F4' };
  return { t: 'Preventa', c: '#125A3B', b: '#EAF7EE' };
}

function hasCoords(p: Project): boolean {
  const la = Number(p.latitude), lo = Number(p.longitude);
  return isFinite(la) && isFinite(lo) && la !== 0 && lo !== 0;
}

export default function ProjectsMap({ projects, onOpen }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [fit, setFit] = useState(true);

  // Crear mapa una única vez
  useEffect(() => {
    if (!host.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container: host.current!,
      style: STYLE,
      center: [-77.0369, -12.0464],
      zoom: 5,
      attributionControl: false,
    });
    mapRef.current = m;
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', () => { try { m.resize(); } catch {} redraw(); });
    // Re-dimensionar al abrir el modal (guarda contra contenedor en 0)
    let tries = 0;
    const timer = window.setInterval(() => {
      tries++;
      try { if (mapRef.current) mapRef.current.resize(); } catch {}
      if (host.current && host.current.offsetWidth > 0 && host.current.offsetHeight > 0) {
        if (tries > 1) window.clearInterval(timer);
      }
      if (tries > 25) window.clearInterval(timer);
    }, 120);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const redraw = useCallback(() => {
    const m = mapRef.current;
    if (!m || !host.current || host.current.offsetWidth === 0) return;
    markersRef.current.forEach((x) => { try { x.remove(); } catch {} });
    markersRef.current = [];
    const placed = projects.filter(hasCoords);

    if (fit && placed.length) {
      setFit(false);
      try {
        if (placed.length === 1) {
          const [lo, la] = [Number(placed[0].longitude), Number(placed[0].latitude)];
          m.easeTo({ center: [lo, la], zoom: 13 });
        } else {
          const b = new maplibregl.LngLatBounds();
          placed.forEach((p) => b.extend([Number(p.longitude), Number(p.latitude)]));
          m.fitBounds(b, { padding: 70, maxZoom: 13, duration: 700 });
        }
      } catch {}
    }

    // Pines con popup informativo
    placed.forEach((p) => {
      const st = stageTag(p);
      const el = document.createElement('div');
      const pin = document.createElement('div');
      pin.style.cssText =
        'display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;' +
        'background:#E30620;color:#fff;font-weight:800;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:pointer;transform:translate(-15px,-15px)';
      pin.textContent = (p.name || 'P').charAt(0).toUpperCase();
      el.appendChild(pin);

      const pop = new maplibregl.Popup({ offset: 14, closeButton: true, maxWidth: '300px' }).setHTML(
        `<div style="display:flex;gap:10px;min-width:216px">
          ${p.coverImageUrl
            ? `<img src="${p.coverImageUrl}" style="width:66px;height:66px;object-fit:cover;border-radius:8px;flex:0 0 auto"/>`
            : `<div style="width:66px;height:66px;border-radius:8px;background:#f1f2f4;display:grid;place-items:center;color:#9AA1AB;font-weight:800">${(p.name||'P').charAt(0).toUpperCase()}</div>`}
          <div style="min-width:0">
            <span style="display:inline-block;font-size:10px;color:${st.c};background:${st.b};padding:2px 8px;border-radius:99px;font-weight:800">${st.t}</span>
            <div style="font-weight:800;margin-top:5px;font-size:13px;color:#171717">${p.name}</div>
            <div style="color:#6b7280;font-size:11px">${p.location || 'Ubicación por definir'}</div>
            ${p.referencePrice ? `<div style="color:#0d9e58;font-weight:800;font-size:12px;margin-top:4px">Desde ${formatMoney(p.referencePrice)}</div>` : ''}
          </div></div>
          <button data-goto="${p.id}" style="margin-top:8px;width:100%;background:#E30620;color:#fff;border:0;padding:7px 0;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer">Ver proyecto →</button>`
      );
      pop.on('open', () => {
        const b = pop.getElement().querySelector<HTMLElement>(`[data-goto="${p.id}"]`);
        if (b && !b.dataset.bound) {
          b.dataset.bound = '1';
          b.addEventListener('click', () => { pop.remove(); onOpen(p.id); });
        }
        // no centrar al abrir desde pin (ya está centrado)
      });
      const mk = new maplibregl.Marker({ element: el })
        .setLngLat([Number(p.longitude), Number(p.latitude)])
        .setPopup(pop)
        .addTo(m);
      el.onclick = () => {
        // MapLibre abre el popup automáticamente; solo aseguramos centrar sin cerrar.
        try { m.easeTo({ center: [Number(p.longitude), Number(p.latitude)], zoom: Math.max(12, m.getZoom()) }); } catch {}
      };
      markersRef.current.push(mk);
    });
    if (active != null && !placed.some((p) => p.id === active)) setActive(null);
  }, [projects, active, fit, onOpen]);

  useEffect(() => { redraw(); }, [redraw]);

  function focus(project: Project) {
    const m = mapRef.current;
    setActive(project.id);
    if (hasCoords(project) && m) {
      try { m.flyTo({ center: [Number(project.longitude), Number(project.latitude)], zoom: 13, speed: 1.1, curve: 1.25 }); } catch {}
    } else {
      onOpen(project.id);
    }
  }
  const sorted = [...projects].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const hidden = projects.filter((p) => !hasCoords(p));

  return (
    <div className="flex h-full min-h-[520px] flex-col overflow-hidden md:flex-row">
      <aside
        className="w-full shrink-0 overflow-y-auto border-b bg-white md:w-[300px] md:border-b-0 md:border-r"
        style={{ borderColor: '#E5E7EB', maxHeight: '100%' }}
      >
        <div className="border-b px-4 py-3" style={{ borderColor: '#EEF0F2' }}>
          <p className="text-lg font-extrabold text-[#171717]">Proyectos</p>
          <p className="text-xs text-slate-500">{projects.length} proyectos · desplázate y haz clic</p>
        </div>
        <div className="space-y-3 p-3">
          {sorted.map((p) => {
            const st1 = stageTag(p);
            const isA = active === p.id;
            return (
              <div key={p.id} onClick={() => focus(p)}
                className={`group cursor-pointer overflow-hidden rounded-xl border transition hover:shadow-md ${isA ? 'ring-2' : ''}`}
                style={{ borderColor: isA ? '#E30620' : '#E7E9EC', background: isA ? '#FFF7F7' : '#fff' }}>
                <div className="relative">
                  {p.coverImageUrl ? (
                    <img src={p.coverImageUrl} alt="" className="h-14 w-full object-cover" />
                  ) : (
                    <div className="grid h-14 w-full place-items-center text-xs text-slate-300" style={{ background: '#F3F4F6' }}>Sin imagen</div>
                  )}
                  <span className="absolute left-2 top-2 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase"
                    style={{ color: st1.c, background: st1.b }}>{st1.t}</span>
                </div>
                <div className="p-3">
                  <p className="truncate font-extrabold text-[#171717]">{p.name}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">📍 {p.location || 'Ubicación por definir'}</p>
                  {p.referencePrice ? (
                    <p className="mt-1 text-sm"><span className="text-xs text-slate-400">Desde </span><span className="font-extrabold" style={{ color: '#0f9d58' }}>{formatMoney(p.referencePrice)}</span></p>
                  ) : (
                    <p className="mt-1 text-xs" style={{ color: '#9AA1AB' }}>Precio base no publicado</p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{hasCoords(p) ? 'Con ubicación' : 'Sin geolocalización'}</span>
                    <button onClick={(e) => { e.stopPropagation(); onOpen(p.id); }} className="text-xs font-bold" style={{ color: '#E30620' }}>Ver detalles →</button>
                  </div>
                </div>
              </div>
            );
          })}
          {projects.length === 0 && <p className="pt-6 text-center text-xs text-slate-400">Aún no hay proyectos.</p>}
        </div>
        {hidden.length > 0 && (
          <div className="px-4 pb-4 text-xs text-slate-400">
            Sin coordenadas (no se dibujan): {hidden.map((p) => p.name).join(', ')}. Edita el proyecto para geolocalizarlo.
          </div>
        )}
      </aside>
      {/* B. Mapa principal a la derecha */}
      <div className="relative min-w-0 flex-1">
        <div ref={host} style={{ height: 560, width: '100%' }} className="block" />
        {projects.length === 0 && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-slate-500">
            Aún no hay proyectos. Crea uno y geolocalízalo para verlo aquí.
          </div>
        )}
      </div>
    </div>
  );
}

