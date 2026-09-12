'use client';

export function printHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.style.opacity = '0';
  document.body.appendChild(frame);

  const doc = frame.contentDocument || frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  let didPrint = false;
  const runPrint = () => {
    if (didPrint) return;
    didPrint = true;
    const win = frame.contentWindow;
    if (!win) {
      frame.remove();
      return;
    }
    setTimeout(() => {
      win.focus();
      win.print();
      setTimeout(() => frame.remove(), 1000);
    }, 300);
  };

  frame.onload = runPrint;
  setTimeout(runPrint, 700);
}
