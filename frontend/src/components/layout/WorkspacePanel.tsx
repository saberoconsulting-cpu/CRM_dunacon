'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Expand within the work area, preserving the actual menu/header dimensions,
// including the collapsed sidebar and mobile navigation.
export default function WorkspacePanel({ children, label, onClose }: { children: ReactNode; label: string; onClose: () => void }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [bounds, setBounds] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    const main = anchor.current?.closest('main');
    if (!main) return;
    const measure = () => {
      const rect = main.getBoundingClientRect();
      setBounds({ top: Math.max(0, rect.top), left: Math.max(0, rect.left) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('[role="dialog"]')) onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return <><span ref={anchor} hidden />{bounds && createPortal(
    <section className="fixed bottom-0 right-0 z-20 flex min-h-0 min-w-0 flex-col bg-white" style={bounds} role="region" aria-label={label}>
      {children}
    </section>, document.body,
  )}</>;
}
