import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { user_id, activo } = await req.json()

    if (!user_id || activo === undefined) {
      return new Response(JSON.stringify({ error: 'Faltan user_id o activo' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error: authError } = await admin.auth.admin.updateUserById(user_id, {
      ban_duration: activo ? 'none' : '876600h',
    })
    if (authError) throw authError

    const { error: perfilError } = await admin
      .from('perfiles')
      .update({ activo })
      .eq('id', user_id)
    if (perfilError) throw perfilError

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
