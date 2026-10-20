/** Locks form controls, including controls rendered after a tab or modal opens. */
export function lockProjectControls(root: HTMLElement) {
  const originals = new Map<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement, boolean>();
  const writeAction = /\b(editar|agregar|añadir|anadir|nuevo|nueva|crear|guardar|eliminar|borrar|importar|subir|cargar archivo|registrar|aprobar|rechazar|restaurar|duplicar|confirmar|pagar|reservar|separar|vender|liberar|aplicar cambios)\b/i;
  const apply = () => {
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>('input, textarea, select, button').forEach(control => {
      if (control instanceof HTMLButtonElement) {
        const label = [control.textContent, control.title, control.getAttribute('aria-label')].join(' ');
        if (control.type !== 'submit' && !writeAction.test(label)) return;
        // A plain button inside a form defaults to submit; navigation controls elsewhere remain available.
        if (control.type === 'submit' && !control.closest('form') && !writeAction.test(label)) return;
      }
      if (!originals.has(control)) originals.set(control, control.disabled);
      if (!control.disabled) control.disabled = true;
    });
  };
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'title', 'aria-label'] });
  return () => {
    observer.disconnect();
    originals.forEach((disabled, control) => { control.disabled = disabled; });
    originals.clear();
  };
}
