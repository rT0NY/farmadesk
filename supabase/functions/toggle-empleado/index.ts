import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verificar que el caller es admin o super_admin activo
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const { data: caller } = await admin
      .from('perfiles')
      .select('rol, empresa_id, activo')
      .eq('id', user.id)
      .single()

    if (!caller || !caller.activo || !['admin', 'super_admin'].includes(caller.rol)) {
      return new Response(JSON.stringify({ error: 'Sin permisos' }), {
        status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const { user_id, activo } = await req.json()

    if (!user_id || activo === undefined) {
      return new Response(JSON.stringify({ error: 'Faltan user_id o activo' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // El empleado objetivo debe existir y pertenecer a la empresa del caller
    // (super_admin puede operar sobre cualquier empresa)
    const { data: objetivo } = await admin
      .from('perfiles')
      .select('empresa_id, rol')
      .eq('id', user_id)
      .single()

    if (!objetivo) {
      return new Response(JSON.stringify({ error: 'Empleado no encontrado' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (caller.rol !== 'super_admin') {
      if (objetivo.empresa_id !== caller.empresa_id || objetivo.rol === 'super_admin') {
        return new Response(JSON.stringify({ error: 'Sin permisos' }), {
          status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
    }

    if (activo) {
      // Reactivar: quitar ban
      const { error } = await admin.auth.admin.updateUserById(user_id, { ban_duration: 'none' })
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
    } else {
      // Eliminar: liberar el email para que pueda reutilizarse
      const placeholder = `eliminado_${user_id}@eliminado.local`
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        email: placeholder,
        ban_duration: '876600h',
      })
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
    }

    const { error: perfilError } = await admin
      .from('perfiles')
      .update({ activo })
      .eq('id', user_id)
    if (perfilError) {
      return new Response(JSON.stringify({ error: perfilError.message }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('toggle-empleado error:', e)
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
