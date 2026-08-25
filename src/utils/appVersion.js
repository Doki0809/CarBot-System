// Detector de versión nueva.
//
// Los dealers viven con la pestaña abierta durante días (y muchos la usan
// dentro del iframe de GHL, que casi nunca se recarga), así que un deploy
// podía tardar días en llegarles. Esto compara el bundle que está corriendo
// contra el que referencia el index.html actual del servidor: si cambió, hay
// un deploy nuevo.
//
// No recarga solo — avisa. Recargar por sorpresa a alguien que está llenando
// el formulario de un vehículo le borraría lo escrito.

// Vite reescribe import.meta.url al archivo del chunk donde queda este módulo,
// así que esto es el nombre real del bundle en ejecución.
const runningBundle = (() => {
  try {
    return new URL(import.meta.url).pathname.split('/').pop() || '';
  } catch {
    return '';
  }
})();

const bundleFromHtml = (html) => {
  const match = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
  return match ? match[0].split('/').pop() : '';
};

export const checkForNewVersion = async () => {
  if (!runningBundle) return false;
  try {
    // cache:'no-store' evita que el propio navegador conteste con la copia
    // vieja, que es justo el problema que estamos detectando.
    const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const deployed = bundleFromHtml(await res.text());
    if (!deployed) return false;
    return deployed !== runningBundle;
  } catch {
    // Sin internet o servidor caído: no es una versión nueva, es ruido.
    return false;
  }
};

// Revisa al volver a la pestaña y cada `intervalMs`. Devuelve la función para
// desmontar el watcher.
export const startVersionWatcher = (onNewVersion, intervalMs = 10 * 60 * 1000) => {
  let stopped = false;

  const run = async () => {
    if (stopped || document.visibilityState !== 'visible') return;
    if (await checkForNewVersion()) {
      if (!stopped) onNewVersion();
    }
  };

  const onVisible = () => { if (document.visibilityState === 'visible') run(); };

  const timer = setInterval(run, intervalMs);
  document.addEventListener('visibilitychange', onVisible);
  // Primera revisión con retraso: al abrir la app se acaba de bajar el bundle,
  // no tiene sentido preguntar por uno nuevo en ese instante.
  const firstCheck = setTimeout(run, 60 * 1000);

  return () => {
    stopped = true;
    clearInterval(timer);
    clearTimeout(firstCheck);
    document.removeEventListener('visibilitychange', onVisible);
  };
};

export const __testing = { bundleFromHtml, runningBundle };
