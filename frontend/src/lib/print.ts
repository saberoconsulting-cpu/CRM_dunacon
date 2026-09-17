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
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 1500);
  };

  // Espera a que carguen las imagenes (logos y evidencias remotas) antes de
  // imprimir; si alguna falla o tarda, un temporizador de respaldo imprime de
  // todas formas para que el PDF nunca quede en blanco.
  const waitForImages = () => {
    const images = Array.from(doc.images || []);
    if (!images.length) {
      setTimeout(runPrint, 400);
      return;
    }
    let pending = images.filter((img) => !img.complete).length;
    if (!pending) {
      setTimeout(runPrint, 400);
      return;
    }
    const settle = () => {
      pending -= 1;
      if (pending <= 0) {
        setTimeout(runPrint, 400);
      }
    };
    images.forEach((img) => {
      if (img.complete) return;
      img.addEventListener('load', settle, { once: true });
      img.addEventListener('error', settle, { once: true });
    });
    // Respaldo por si algun evento nunca dispara.
    setTimeout(runPrint, 6000);
  };

  if (doc.readyState === 'complete') {
    waitForImages();
  } else {
    frame.onload = waitForImages;
    setTimeout(waitForImages, 1200);
  }
}
