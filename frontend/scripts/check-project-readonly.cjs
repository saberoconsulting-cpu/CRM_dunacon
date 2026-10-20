const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/project-readonly.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
class Control {
  constructor(disabled = false) { this.disabled = disabled; }
}
class Button extends Control {
  constructor(label) { super(); this.textContent = label; this.type = 'button'; this.title = ''; }
  getAttribute() { return null; }
}
global.HTMLButtonElement = Button;
let onMutation;
let disconnected = false;
global.MutationObserver = class {
  constructor(callback) { onMutation = callback; }
  observe() {}
  disconnect() { disconnected = true; }
};
const output = {};
new Function('exports', code)(output);
const input = new Control();
const previouslyDisabled = new Control(true);
const edit = new Button('Editar');
const summary = new Button('Resúmenes');
const controls = [input, previouslyDisabled, edit, summary];
const unlock = output.lockProjectControls({ querySelectorAll: () => controls });
assert.equal(input.disabled, true);
assert.equal(edit.disabled, true);
assert.equal(summary.disabled, false);
const newInput = new Control();
controls.push(newInput);
onMutation();
assert.equal(newInput.disabled, true);
unlock();
assert.equal(disconnected, true);
assert.equal(input.disabled, false);
assert.equal(edit.disabled, false);
assert.equal(previouslyDisabled.disabled, true);
assert.equal(newInput.disabled, false);
console.log('PASS: fields and edit actions locked, summary available, new fields locked, original states restored.');
