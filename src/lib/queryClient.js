import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            2 * 60_000,   // 2 min por defecto (buen balance)
      gcTime:              15 * 60_000,   // 15 min en memoria tras desmontaje
      refetchOnWindowFocus: false,        // useFocusRefresh lo maneja selectivamente
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
})
