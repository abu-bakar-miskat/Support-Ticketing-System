import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type LoadingSpinnerProps = {
  className?: string
  label?: string
}

export function LoadingSpinner({ className, label }: LoadingSpinnerProps) {
  return (
    <Loader2
      className={cn("animate-spin", className)}
      aria-hidden={!label}
      aria-label={label}
    />
  )
}
