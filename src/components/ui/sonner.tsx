"use client"

import { useTheme } from "@/components/theme/theme-provider"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react"

function ToastIcon({
  children,
  bg,
  color,
}: {
  children: React.ReactNode
  bg: string
  color: string
}) {
  return (
    <span
      className={`flex size-[26px] shrink-0 items-center justify-center rounded-full ${bg} ${color}`}
    >
      {children}
    </span>
  )
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <ToastIcon bg="bg-sts-green-tint" color="text-sts-green">
            <CircleCheckIcon className="size-4" strokeWidth={2.2} />
          </ToastIcon>
        ),
        info: (
          <ToastIcon bg="bg-sts-blue-tint" color="text-sts-blue">
            <InfoIcon className="size-4" strokeWidth={2.2} />
          </ToastIcon>
        ),
        warning: (
          <ToastIcon bg="bg-amber-50 dark:bg-amber-900/30" color="text-amber-600 dark:text-amber-400">
            <TriangleAlertIcon className="size-4" strokeWidth={2.2} />
          </ToastIcon>
        ),
        error: (
          <ToastIcon bg="bg-sts-red-tint" color="text-sts-red">
            <OctagonXIcon className="size-4" strokeWidth={2.2} />
          </ToastIcon>
        ),
        loading: (
          <ToastIcon bg="bg-sts-blue-tint" color="text-sts-blue">
            <Loader2Icon className="size-4 animate-spin" />
          </ToastIcon>
        ),
      }}
      style={
        {
          "--width": "420px",
          "--border-radius": "14px",
          "--normal-bg": "var(--sts-card)",
          "--normal-text": "var(--sts-foreground)",
          "--normal-border": "var(--sts-card-border)",
          "--font-family": "var(--font-sans)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: [
            "font-sans !rounded-xl !border !border-sts-card-border",
            "!bg-sts-card backdrop-blur-[var(--sts-glass-blur)] saturate-[var(--sts-glass-saturate)]",
            "!text-sts-foreground",
            "!px-5 !py-4 !gap-3.5 !items-center",
            "sts-toast-enter",
          ].join(" "),
          title: "!text-[14px] !font-semibold !text-sts-foreground !leading-tight",
          description: "!text-[12.5px] !text-sts-muted !leading-snug",
          icon: "!size-[26px]",
          closeButton: [
            "!border-sts-card-border !bg-sts-surface !text-sts-subtle",
            "hover:!bg-sts-secondary-bg hover:!text-sts-foreground",
          ].join(" "),
          actionButton:
            "!bg-sts-button !text-sts-button-fg !font-sans !text-xs !rounded-md !font-medium",
          cancelButton:
            "!bg-sts-surface !text-sts-muted !font-sans !text-xs !rounded-md",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
