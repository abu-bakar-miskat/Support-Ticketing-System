import { cn } from "@/lib/utils";

/**
 * Tenant logo that follows the theme. With a dark-theme variant both images are
 * rendered and the `dark:` variant picks one in CSS — no hydration flash on
 * toggle. Without one, the light logo is shown as-is in both themes.
 */
export function TenantLogo({
  src,
  darkSrc,
  alt = "",
  width,
  height,
  className,
}: {
  src: string;
  darkSrc?: string | null;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!darkSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} width={width} height={height} className={className} />
    );
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={width} height={height} className={cn(className, "dark:hidden")} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={darkSrc} alt={alt} width={width} height={height} className={cn(className, "hidden dark:block")} />
    </>
  );
}
