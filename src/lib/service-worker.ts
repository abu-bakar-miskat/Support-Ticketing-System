let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  // Avoid stale Turbopack chunks during local development
  if (process.env.NODE_ENV === "development") return Promise.resolve(null);

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => null);
  }

  return registrationPromise;
}

export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  const registration = await registerServiceWorker();
  if (!registration) return null;

  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}
