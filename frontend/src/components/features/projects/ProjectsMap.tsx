'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { FiExternalLink, FiMapPin } from 'react-icons/fi';
import { BRAND, Project, formatMoney } from '@/lib/types';

interface Props {
  projects: Project[];
  onOpen: (id: number) => void;
  focusProjectId?: number | null;
}

const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const MARKER_ICON = '/logo/map.png';
const STYLE: any = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [OSM],
      tileSize: 256,
      attribution: 'OpenStreetMap',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': BRAND.canvas } },
    { id: 'osm', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 19 },
  ],
};

function stageTag(project: Project) {
  if (project.status === 'inactive') return { label: 'Inactivo', color: BRAND.muted, bg: BRAND.mutedLight };
  return { label: 'Activo', color: BRAND.blueDark, bg: '#EAF2FF' };
}

function hasCoords(project: Project): boolean {
  const lat = Number(project.latitude);
  const lng = Number(project.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
}

function coords(project: Project): [number, number] {
  return [Number(project.longitude), Number(project.latitude)];
}

export default function ProjectsMap({ projects, onOpen, focusProjectId = null }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [active, setActive] = useState<number | null>(focusProjectId);
  const [fit, setFit] = useState(!focusProjectId);

  useEffect(() => {
    if (!host.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: host.current,
      style: STYLE,
      center: [-77.0369, -12.0464],
      zoom: 5,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      try {
        map.resize();
      } catch {}
      redraw();
    });

    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      try {
        mapRef.current?.resize();
      } catch {}
      if (host.current?.offsetWidth && host.current?.offsetHeight && tries > 1) window.clearInterval(timer);
      if (tries > 25) window.clearInterval(timer);
    }, 120);

    return () => {
      window.clearInterval(timer);
      try {
        map.remove();
      } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const redraw = useCallback(() => {
    const map = mapRef.current;
    if (!map || !host.current || host.current.offsetWidth === 0) return;

    markersRef.current.forEach((marker) => {
      try {
        marker.remove();
      } catch {}
    });
    markersRef.current = [];

    const placed = projects.filter(hasCoords);
    const focused = focusProjectId ? placed.find((project) => project.id === focusProjectId) : null;

    if (focused) {
      setFit(false);
      setActive(focused.id);
      try {
        map.easeTo({ center: coords(focused), zoom: 14, duration: 700 });
      } catch {}
    } else if (fit && placed.length) {
      setFit(false);
      try {
        if (placed.length === 1) {
          map.easeTo({ center: coords(placed[0]), zoom: 13, duration: 600 });
        } else {
          const bounds = new maplibregl.LngLatBounds();
          placed.forEach((project) => bounds.extend(coords(project)));
          map.fitBounds(bounds, { padding: 76, maxZoom: 13, duration: 700 });
        }
      } catch {}
    }

    placed.forEach((project) => {
      const tag = stageTag(project);
      const isActive = active === project.id;
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.title = `Abrir ${project.name}`;
      marker.setAttribute('aria-label', `Abrir ${project.name}`);
      marker.style.cssText = [
        'width:46px',
        'height:46px',
        'border:0',
        'padding:0',
        'background:transparent',
        'cursor:pointer',
        'transform:translate(-23px,-42px)',
        'filter:drop-shadow(0 8px 14px rgba(16,24,40,.24))',
      ].join(';');

      const icon = document.createElement('img');
      icon.src = MARKER_ICON;
      icon.alt = '';
      icon.style.cssText = [
        'display:block',
        'width:46px',
        'height:46px',
        'object-fit:contain',
        `outline:${isActive ? `3px solid ${BRAND.blue}` : '0 solid transparent'}`,
        'outline-offset:2px',
        'border-radius:50%',
        'transition:transform .16s ease, outline .16s ease',
      ].join(';');
      marker.appendChild(icon);

      marker.addEventListener('mouseenter', () => {
        icon.style.transform = 'translateY(-2px) scale(1.05)';
      });
      marker.addEventListener('mouseleave', () => {
        icon.style.transform = 'translateY(0) scale(1)';
      });
      marker.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setActive(project.id);
        onOpen(project.id);
      });

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 18,
        maxWidth: '280px',
      }).setHTML(
        `<div style="min-width:210px;font-family:Inter,system-ui,sans-serif">
          <div style="display:flex;gap:10px;align-items:center">
            ${
              project.coverImageUrl
                ? `<img src="${project.coverImageUrl}" style="width:54px;height:54px;object-fit:cover;border-radius:4px;flex:0 0 auto;border:1px solid ${BRAND.border}"/>`
                : `<div style="width:54px;height:54px;border-radius:4px;background:${BRAND.mutedLight};display:grid;place-items:center;color:${BRAND.blue};font-weight:700;border:1px solid ${BRAND.border}">${(project.name || 'P').charAt(0).toUpperCase()}</div>`
            }
            <div style="min-width:0">
              <span style="display:inline-flex;align-items:center;height:20px;color:${tag.color};background:${tag.bg};padding:0 8px;border-radius:999px;font-size:11px;font-weight:700">${tag.label}</span>
              <div style="margin-top:5px;font-size:13px;font-weight:700;color:${BRAND.ink};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${project.name}</div>
              <div style="margin-top:2px;color:${BRAND.muted};font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${project.location || 'Ubicacion por definir'}</div>
            </div>
          </div>
          ${project.referencePrice ? `<div style="margin-top:8px;color:${BRAND.blueDark};font-size:12px;font-weight:700">Desde ${formatMoney(project.referencePrice)}</div>` : ''}
          <div style="margin-top:8px;color:${BRAND.muted};font-size:11px">Clic en el icono para abrir el proyecto</div>
        </div>`
      );

      marker.addEventListener('mouseenter', () => popup.setLngLat(coords(project)).addTo(map));
      marker.addEventListener('mouseleave', () => popup.remove());

      const mapMarker = new maplibregl.Marker({ element: marker, anchor: 'bottom' })
        .setLngLat(coords(project))
        .addTo(map);

      markersRef.current.push(mapMarker);
    });

    if (active != null && !placed.some((project) => project.id === active)) setActive(null);
  }, [projects, active, fit, focusProjectId, onOpen]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  function focus(project: Project) {
    const map = mapRef.current;
    setActive(project.id);
    if (!hasCoords(project) || !map) return;

    try {
      map.flyTo({ center: coords(project), zoom: 13, speed: 1.1, curve: 1.25 });
    } catch {}
  }

  const sorted = [...projects].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const hidden = projects.filter((project) => !hasCoords(project));

  return (
    <div className="flex h-full min-h-[520px] flex-col overflow-hidden border bg-white md:flex-row" style={{ borderColor: BRAND.border }}>
      <aside className="w-full shrink-0 overflow-y-auto border-b bg-white md:w-[312px] md:border-b-0 md:border-r" style={{ borderColor: BRAND.border }}>
        <div className="border-b px-4 py-3" style={{ borderColor: BRAND.border }}>
          <p className="text-base font-semibold" style={{ color: BRAND.ink }}>Proyectos</p>
          <p className="text-xs" style={{ color: BRAND.muted }}>{projects.length} proyectos ubicados en el CRM</p>
        </div>

        <div className="space-y-2 p-3">
          {sorted.map((project) => {
            const tag = stageTag(project);
            const selected = active === project.id;
            const located = hasCoords(project);

            return (
              <article
                key={project.id}
                className="group overflow-hidden rounded-md border bg-white transition-colors"
                style={{ borderColor: selected ? BRAND.blue : BRAND.border, boxShadow: selected ? '0 0 0 2px rgba(24,119,242,.12)' : undefined }}
              >
                <button type="button" onClick={() => focus(project)} className="flex w-full gap-3 p-3 text-left transition-colors hover:bg-[#F8FAFC]">
                  {project.coverImageUrl ? (
                    <img src={project.coverImageUrl} alt="" className="h-16 w-20 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="grid h-16 w-20 shrink-0 place-items-center rounded bg-softblue text-sm font-bold" style={{ color: BRAND.blue }}>
                      {project.name?.trim().charAt(0).toUpperCase() || 'P'}
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 truncate text-sm font-semibold" style={{ color: BRAND.ink }}>{project.name}</span>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: tag.color, background: tag.bg }}>
                        {tag.label}
                      </span>
                    </span>
                    <span className="mt-1 flex min-w-0 items-center gap-1 text-xs" style={{ color: BRAND.muted }}>
                      <FiMapPin className="shrink-0" />
                      <span className="truncate">{project.location || 'Ubicacion por definir'}</span>
                    </span>
                    <span className="mt-2 flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium" style={{ color: located ? BRAND.blueDark : BRAND.muted }}>
                        {located ? 'Con coordenadas' : 'Sin geolocalizacion'}
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen(project.id);
                        }}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md border bg-white transition-colors hover:bg-softblue"
                        style={{ borderColor: BRAND.border, color: BRAND.blue }}
                        title="Abrir proyecto"
                        aria-label={`Abrir ${project.name}`}
                      >
                        <FiExternalLink />
                      </button>
                    </span>
                    {project.referencePrice ? <span className="mt-1 block text-xs font-semibold" style={{ color: BRAND.blueDark }}>Desde {formatMoney(project.referencePrice)}</span> : null}
                  </span>
                </button>
              </article>
            );
          })}

          {projects.length === 0 && <p className="py-8 text-center text-xs" style={{ color: BRAND.muted }}>Aun no hay proyectos.</p>}
        </div>

        {hidden.length > 0 && (
          <div className="border-t px-4 py-3 text-xs" style={{ borderColor: BRAND.border, color: BRAND.muted }}>
            Sin coordenadas: {hidden.map((project) => project.name).join(', ')}. Edita el proyecto para verlo en el mapa.
          </div>
        )}
      </aside>

      <div className="relative min-w-0 flex-1 bg-[#EEF1F5]">
        <div ref={host} className="h-full min-h-[560px] w-full" />
        {projects.length === 0 && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm" style={{ color: BRAND.muted }}>
            Aun no hay proyectos. Crea uno y geolocalizalo para verlo aqui.
          </div>
        )}
      </div>
    </div>
  );
}
