import { tenantAccentCss } from "@/lib/tenant-accent";

/**
 * Overrides the theme accent tokens with the active tenant's brand color.
 * Rendered by the tenant shells; renders nothing for the product default.
 * Tokens are set on :root so portalled popovers/dialogs pick them up too.
 */
export function TenantAccentStyle({ accentColor }: { accentColor: string | null | undefined }) {
  const css = tenantAccentCss(accentColor);
  if (!css) return null;
  // css is built only from a validated hex (see tenantAccentCss).
  return <style data-tenant-accent dangerouslySetInnerHTML={{ __html: css }} />;
}
