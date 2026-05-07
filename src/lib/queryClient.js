import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,        // 30 segundos antes de considerar datos "viejos"
      gcTime: 5 * 60 * 1000,       // 5 min en caché antes de limpiar
      refetchOnWindowFocus: false, // no re-fetchear al volver a la pestaña
      retry: 1,                    // reintentar una vez si falla
    },
    mutations: {
      retry: 0,
    },
  },
})