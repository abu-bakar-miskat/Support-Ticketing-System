'use client'

import {
  isServer,
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { isPermissionError } from '@/lib/api-error'

function makeQueryClient() {
  return new QueryClient({
    // Safety net: any mutation that fails with an auth/permission error
    // (401/403) surfaces a toast, even if the call site has no onError.
    // Per-call handlers should skip permission errors (see isPermissionError)
    // to avoid double toasts.
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isPermissionError(error)) {
          toast.error(error.message)
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  // Server: always make a new client per request so data never leaks across users.
  // Browser: reuse one client for the tab. Avoid useState here — if a parent
  // suspends with no Suspense boundary between this provider and the suspend
  // point, React discards useState and the QueryClient vanishes mid-render.
  if (isServer) return makeQueryClient()
  if (!browserQueryClient) browserQueryClient = makeQueryClient()
  return browserQueryClient
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const client = getQueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
