import { createClient } from '@supabase/supabase-js'
import { registrarExito, registrarFallo } from '@/lib/latencia'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan variables de entorno VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY')
}

// Cada petición se cronometra para alimentar el indicador de conexión. Así no
// hace falta lanzar una consulta extra solo para medir.
const fetchMedido = async (input, init) => {
  const t0 = performance.now()
  try {
    const res = await fetch(input, init)
    registrarExito(Math.round(performance.now() - t0))
    return res
  } catch (e) {
    registrarFallo()
    throw e
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: { fetch: fetchMedido },
})
