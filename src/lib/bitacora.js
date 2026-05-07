import { supabase } from '@/lib/supabase'

export async function log({ empresa_id, tipo, descripcion, usuario_id, sucursal_id, referencia_id, metadatos }) {
  try {
    await supabase.from('bitacora').insert({
      empresa_id, tipo, descripcion,
      usuario_id:    usuario_id    ?? null,
      sucursal_id:   sucursal_id   ?? null,
      referencia_id: referencia_id ?? null,
      metadatos:     metadatos     ?? null,
    })
  } catch (_) {
    // logging never rompe el flujo principal
  }
}
