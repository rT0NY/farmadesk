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

    // Verificar que el caller es admin o super_admin
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

    const { data: perfil } = await admin
      .from('perfiles')
      .select('rol, empresa_id, activo')
      .eq('id', user.id)
      .single()

    if (!perfil || !perfil.activo || !['admin', 'super_admin'].includes(perfil.rol)) {
      return new Response(JSON.stringify({ error: 'Sin permisos' }), {
        status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const { email, nombre, rol, empresa_id, sucursal_id, password, telefono } = await req.json()

    if (!email || !nombre || !rol) {
      return new Response(JSON.stringify({ error: 'Faltan datos requeridos' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Un admin solo puede crear roles de su nivel hacia abajo — nunca super_admin
    const rolesPermitidos = perfil.rol === 'super_admin'
      ? ['super_admin', 'admin', 'encargado', 'cajero']
      : ['admin', 'encargado', 'cajero']
    if (!rolesPermitidos.includes(rol)) {
      return new Response(JSON.stringify({ error: 'Rol no permitido' }), {
        status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    let newUserId: string

    if (password) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (createError) throw createError
      newUserId = created.user.id
    } else {
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email)
      if (inviteError) throw inviteError
      newUserId = invited.user.id
    }

    const empresaId = perfil.rol === 'super_admin' ? empresa_id : perfil.empresa_id

    const { error: perfilError } = await admin.from('perfiles').upsert({
      id:          newUserId,
      nombre,
      correo:      email,
      rol,
      empresa_id:  empresaId,
      sucursal_id: sucursal_id || null,
      telefono:    telefono   || null,
      activo:      true,
    }, { onConflict: 'id' })

    if (perfilError) {
      await admin.auth.admin.deleteUser(newUserId)
      throw perfilError
    }

    return new Response(JSON.stringify({ ok: true, userId: newUserId }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
