import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeInitScript } from "@/components/theme/theme-init-script";
import { FontSizeInitScript } from "@/components/font-size/font-size-init-script";
import { FontSizeProvider } from "@/components/font-size/font-size-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { UpdateNotifier } from "@/components/update-notifier";
import { Analytics } from "@vercel/analytics/next";
import { Clarity } from "@/components/analytics/clarity";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Support Ticketing System",
  description: "Internal development ticketing for PEN",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PEN",
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <head />
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <ThemeInitScript />
        <FontSizeInitScript />
        <ServiceWorkerRegister />
        <UpdateNotifier />
        <QueryProvider>
          <FontSizeProvider>
            <ThemeProvider>
            {children}
            <Toaster
              position="top-center"
              gap={8}
              offset={16}
              duration={2000}
              containerAriaLabel="Notifications"
              style={{ left: "50%", transform: "translateX(-50%)" }}
            />
            </ThemeProvider>
          </FontSizeProvider>
        </QueryProvider>
        <Analytics />
        <Clarity />
      </body>
    </html>
  );
}
