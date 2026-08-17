let _root: HTMLElement | null = null;

/**
 * Returns a <div> appended to <html> (not <body>) so that portalled overlays
 * are outside the CSS zoom applied to body in large-font mode. Floating UI
 * uses viewport-space coords from getBoundingClientRect(), and position:absolute
 * relative to the initial containing block also uses viewport space — so no
 * zoom compensation is needed when the portal lives here.
 */
export function getPortalRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (!_root) {
    _root = document.getElementById("pen-portal-root") as HTMLElement | null;
    if (!_root) {
      _root = document.createElement("div");
      _root.id = "pen-portal-root";
      document.documentElement.appendChild(_root);
    }
  }
  return _root;
}
