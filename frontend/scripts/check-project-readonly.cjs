const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
class Button {
  constructor({ managed = false, disabled = false, text = 'Nueva factura' } = {}) { this.managed = managed; this.disabled = disabled; this.textContent = text; this.title = ''; this.type = 'button'; }
  closest(selector) { return selector.includes('data-project-lock-managed') && this.managed ? {} : null; }
  getAttribute() { return null; }
}
class Observer {
  constructor(callback) { this.callback = callback; Observer.latest = this; }
  observe() {}
  disconnect() {}
}
const source = fs.readFileSync(path.join(__dirname, '../src/lib/project-readonly.ts'), 'utf8');
const context = { exports: {}, HTMLButtonElement: Button, MutationObserver: Observer };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { lockProjectControls } = context.exports;
for (const text of ['Nueva factura', 'Nuevo movimiento', 'Importar Excel']) {
  const button = new Button({ managed: true, disabled: true, text });
  const cleanup = lockProjectControls({ querySelectorAll: () => [button] });
  // React updates the controlled button on unlock before passive cleanup runs.
  button.disabled = false;
  cleanup();
  assert.equal(button.disabled, false, `${text} debe permanecer habilitado al desbloquear`);
  const relockCleanup = lockProjectControls({ querySelectorAll: () => [button] });
  button.disabled = true;
  Observer.latest.callback();
  assert.equal(button.disabled, true, `${text} debe permanecer bloqueado al activar el candado`);
  relockCleanup();
}
const legacyButton = new Button();
const legacyCleanup = lockProjectControls({ querySelectorAll: () => [legacyButton] });
assert.equal(legacyButton.disabled, true);
legacyCleanup();
assert.equal(legacyButton.disabled, false);
console.log('Candado: Contabilidad conserva el estado de React al desbloquear y bloquear; protección de módulos existentes verificada.');
