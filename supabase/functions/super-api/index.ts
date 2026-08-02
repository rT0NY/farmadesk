import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const body = await req.json()
    const { accion } = body

    // ══════════════════════════════════════════════════════════════
    // Verificación de sesión para acciones autenticadas
    // ══════════════════════════════════════════════════════════════
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "No autorizado" }, 401)

    const token = authHeader.replace("Bearer ", "")
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser()
    if (userErr || !user) return json({ error: "Token inválido" }, 401)

    const { data: perfil } = await supabaseAdmin
      .from("perfiles").select("rol, empresa_id, activo").eq("id", user.id).maybeSingle()

    if (!perfil || !perfil.activo) return json({ error: "Usuario inactivo o sin perfil" }, 403)

    const esSuperAdmin = perfil.rol === "super_admin"
    const esAdmin = perfil.rol === "admin"

    // ══════════════════════════════════════════════════════════════
    // ACCIONES DE SUPER_ADMIN (tu panel /super)
    // ══════════════════════════════════════════════════════════════

    // Crear empresa + admin dueño + primera sucursal (todo en un paso)
    if (accion === "crear_empresa_con_admin") {
      if (!esSuperAdmin) return json({ error: "Solo super_admin" }, 403)

      const {
        nombre_empresa,
        correo_admin,
        password_admin,
        nombre_admin,
        sucursal_inicial,
        notas_internas
      } = body

      if (!nombre_empresa?.trim()) return json({ error: "Nombre de empresa requerido" }, 400)
      if (!correo_admin?.trim()) return json({ error: "Correo del admin requerido" }, 400)
      if (!password_admin || password_admin.length < 6) return json({ error: "Contraseña mínimo 6 caracteres" }, 400)
      if (!nombre_admin?.trim()) return json({ error: "Nombre del admin requerido" }, 400)

      // 1. Crear usuario en auth
      const { data: nuevoAuth, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: correo_admin.trim().toLowerCase(),
        password: password_admin,
        email_confirm: true,
      })
      if (authErr) return json({ error: `Crear usuario: ${authErr.message}` }, 400)

      const nuevoUserId = nuevoAuth.user.id

      // 2. Crear empresa
      const { data: empresa, error: empErr } = await supabaseAdmin
        .from("empresas")
        .insert([{
          nombre: nombre_empresa.trim(),
          propietario: nuevoUserId,
          notas_internas: notas_internas?.trim() || null,
        }])
        .select().single()
      if (empErr) {
        await supabaseAdmin.auth.admin.deleteUser(nuevoUserId)
        return json({ error: `Crear empresa: ${empErr.message}` }, 400)
      }

      // 3. Crear perfil admin
      const { error: perfErr } = await supabaseAdmin.from("perfiles").insert([{
        id: nuevoUserId,
        empresa_id: empresa.id,
        nombre: nombre_admin.trim(),
        correo: correo_admin.trim().toLowerCase(),
        rol: "admin",
        activo: true,
      }])
      if (perfErr) {
        await supabaseAdmin.from("empresas").delete().eq("id", empresa.id)
        await supabaseAdmin.auth.admin.deleteUser(nuevoUserId)
        return json({ error: `Crear perfil: ${perfErr.message}` }, 400)
      }

      // 4. Crear sucursal inicial si viene.
      // El formulario manda la dirección DESGLOSADA (calle/colonia/ciudad/estado/CP),
      // no un campo `direccion`. Antes solo se guardaba el nombre y por eso la
      // primera sucursal de cada empresa quedaba siempre sin dirección — las
      // demás sí, porque el cliente las inserta aparte con todos los campos.
      if (sucursal_inicial?.nombre?.trim()) {
        const limpiar = (v: unknown) =>
          typeof v === "string" && v.trim() ? v.trim() : null

        await supabaseAdmin.from("sucursales").insert([{
          empresa_id:    empresa.id,
          nombre:        sucursal_inicial.nombre.trim(),
          direccion:     limpiar(sucursal_inicial.direccion),
          calle:         limpiar(sucursal_inicial.calle),
          colonia:       limpiar(sucursal_inicial.colonia),
          ciudad:        limpiar(sucursal_inicial.ciudad),
          estado:        limpiar(sucursal_inicial.estado),
          codigo_postal: limpiar(sucursal_inicial.codigo_postal),
        }])
      }

      return json({ ok: true, empresa, usuario_id: nuevoUserId }, 200)
    }

    // Cambiar contraseña de un admin de empresa (solo super_admin)
    if (accion === "resetear_password_admin") {
      if (!esSuperAdmin) return json({ error: "Solo super_admin" }, 403)
      const { uid, nuevo_password } = body
      if (!uid || !nuevo_password || nuevo_password.length < 6) {
        return json({ error: "UID y contraseña mínimo 6 caracteres" }, 400)
      }
      const { error } = await supabaseAdmin.auth.admin.updateUserById(uid, { password: nuevo_password })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true }, 200)
    }

    // Crear nuevo super_admin (solo super_admin puede crear otro super_admin)
    if (accion === "crear_super_admin") {
      if (!esSuperAdmin) return json({ error: "Solo super_admin" }, 403)
      const { correo, password, nombre } = body
      if (!correo?.trim() || !password || password.length < 6 || !nombre?.trim()) {
        return json({ error: "Datos incompletos" }, 400)
      }

      const { data: nuevoAuth, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: correo.trim().toLowerCase(),
        password,
        email_confirm: true,
      })
      if (authErr) return json({ error: authErr.message }, 400)

      const { error: perfErr } = await supabaseAdmin.from("perfiles").insert([{
        id: nuevoAuth.user.id,
        empresa_id: null,
        nombre: nombre.trim(),
        correo: correo.trim().toLowerCase(),
        rol: "super_admin",
        activo: true,
      }])
      if (perfErr) {
        await supabaseAdmin.auth.admin.deleteUser(nuevoAuth.user.id)
        return json({ error: perfErr.message }, 400)
      }

      return json({ ok: true, uid: nuevoAuth.user.id }, 200)
    }

    // ══════════════════════════════════════════════════════════════
    // ACCIONES DE ADMIN DE EMPRESA (panel de cada dueño)
    // ══════════════════════════════════════════════════════════════

    // Crear usuario (encargado/cajero) dentro de una empresa
    if (accion === "crear") {
      if (!esAdmin && !esSuperAdmin) return json({ error: "Solo administradores" }, 403)

      const { email, password, nombre, rol, empresa_id } = body

      if (!["encargado", "cajero"].includes(rol)) {
        return json({ error: "Rol inválido (solo encargado o cajero)" }, 400)
      }

      // Si es admin normal, solo puede crear usuarios de SU empresa
      const empresaObjetivo = esSuperAdmin ? empresa_id : perfil.empresa_id
      if (!empresaObjetivo) return json({ error: "empresa_id requerido" }, 400)
      if (esAdmin && empresa_id !== perfil.empresa_id) {
        return json({ error: "No puedes crear usuarios fuera de tu empresa" }, 403)
      }

      const { data: nuevoAuth, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
      })
      if (authErr) return json({ error: authErr.message }, 400)

      const { error: perfErr } = await supabaseAdmin.from("perfiles").insert([{
        id: nuevoAuth.user.id,
        empresa_id: empresaObjetivo,
        nombre, correo: email, rol, activo: true,
      }])
      if (perfErr) {
        await supabaseAdmin.auth.admin.deleteUser(nuevoAuth.user.id)
        return json({ error: perfErr.message }, 400)
      }

      return json({ ok: true, uid: nuevoAuth.user.id }, 200)
    }

    // Actualizar usuario existente
    if (accion === "actualizar") {
      if (!esAdmin && !esSuperAdmin) return json({ error: "Solo administradores" }, 403)

      const { uid, password, nombre, rol } = body

      // Verificar que el usuario a modificar sea de la misma empresa (si es admin)
      if (esAdmin) {
        const { data: objetivo } = await supabaseAdmin
          .from("perfiles").select("empresa_id, rol").eq("id", uid).maybeSingle()
        if (!objetivo || objetivo.empresa_id !== perfil.empresa_id) {
          return json({ error: "No puedes modificar este usuario" }, 403)
        }
        if (objetivo.rol === "super_admin" || objetivo.rol === "admin") {
          return json({ error: "No puedes modificar otros admins" }, 403)
        }
      }

      if (password) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(uid, { password })
        if (error) return json({ error: error.message }, 400)
      }

      const cambios: Record<string, unknown> = {}
      if (nombre) cambios.nombre = nombre
      if (rol && ["encargado", "cajero"].includes(rol)) cambios.rol = rol

      if (Object.keys(cambios).length > 0) {
        const { error: perfErr } = await supabaseAdmin.from("perfiles")
          .update(cambios).eq("id", uid)
        if (perfErr) return json({ error: perfErr.message }, 400)
      }

      return json({ ok: true }, 200)
    }

    return json({ error: "Acción no válida" }, 400)

  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
