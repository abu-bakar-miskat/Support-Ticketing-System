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
          <ToastIcon bg="bg-pen-green-tint" color="text-pen-green">
            <CircleCheckIcon className="size-4" strokeWidth={2.2} />
          </ToastIcon>
        ),
        info: (
          <ToastIcon bg="bg-pen-blue-tint" color="text-pen-blue">
            <InfoIcon className="size-4" strokeWidth={2.2} />
          </ToastIcon>
        ),
        warning: (
          <ToastIcon bg="bg-amber-50 dark:bg-amber-900/30" color="text-amber-600 dark:text-amber-400">
            <TriangleAlertIcon className="size-4" strokeWidth={2.2} />
          </ToastIcon>
        ),
        error: (
          <ToastIcon bg="bg-pen-red-tint" color="text-pen-red">
            <OctagonXIcon className="size-4" strokeWidth={2.2} />
          </ToastIcon>
        ),
        loading: (
          <ToastIcon bg="bg-pen-blue-tint" color="text-pen-blue">
            <Loader2Icon className="size-4 animate-spin" />
          </ToastIcon>
        ),
      }}
      style={
        {
          "--width": "420px",
          "--border-radius": "14px",
          "--normal-bg": "var(--pen-card)",
          "--normal-text": "var(--pen-foreground)",
          "--normal-border": "var(--pen-card-border)",
          "--font-family": "var(--font-sans)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: [
            "font-sans !rounded-xl !border !border-pen-card-border",
            "!bg-pen-card backdrop-blur-[var(--pen-glass-blur)] saturate-[var(--pen-glass-saturate)]",
            "!text-pen-foreground",
            "!px-5 !py-4 !gap-3.5 !items-center",
            "pen-toast-enter",
          ].join(" "),
          title: "!text-[14px] !font-semibold !text-pen-foreground !leading-tight",
          description: "!text-[12.5px] !text-pen-muted !leading-snug",
          icon: "!size-[26px]",
          closeButton: [
            "!border-pen-card-border !bg-pen-surface !text-pen-subtle",
            "hover:!bg-pen-secondary-bg hover:!text-pen-foreground",
          ].join(" "),
          actionButton:
            "!bg-pen-button !text-pen-button-fg !font-sans !text-xs !rounded-md !font-medium",
          cancelButton:
            "!bg-pen-surface !text-pen-muted !font-sans !text-xs !rounded-md",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
