/**
 * Seed de datos DEMO para el Centro de Control CDAF.
 * Uso: node --env-file=.env scripts/seed-demo.mjs
 *
 * RESETEA los datos de dominio (clientes, academias, clases, pagos, etc.) y el
 * staff demo (correos con "+demo"), y vuelve a sembrar un set completo para
 * probar todos los módulos. NO toca al superadministrador (vena.digital.2207).
 */
import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PW = "CdafDemo.2026";
const hoy = new Date();
const fmt = (d) => d.toISOString().slice(0, 10);
const dShift = (days) => fmt(new Date(hoy.getTime() + days * 86400000));
const ins1 = async (t, row) => {
  const { data, error } = await s.from(t).insert(row).select("id").single();
  if (error) throw new Error(`${t}: ${error.message}`);
  return data.id;
};

async function delAll(t) {
  const { error } = await s.from(t).delete().gte("id", 0);
  if (error) console.error("  del", t, error.message);
}

async function wipe() {
  console.log("• Limpiando datos previos…");
  for (const t of [
    "asignaciones_pago", "abonos", "pagos", "asistencias", "clases",
    "inscripciones", "lista_espera", "paquetes_cliente", "cliente_documentos",
    "clientes", "acudientes", "academias", "paquetes_catalogo", "profesor_valor_clase",
  ]) await delAll(t);
  const { data: users } = await s.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of users.users) if (u.email?.includes("+demo")) await s.auth.admin.deleteUser(u.id);
}

async function crearStaff(tag, nombre, role, documento, telefono) {
  const email = `vena.digital.2207+demo.${tag}@gmail.com`;
  const { data, error } = await s.auth.admin.createUser({ email, password: PW, email_confirm: true, user_metadata: { nombre } });
  if (error) throw new Error(`staff ${tag}: ${error.message}`);
  await s.from("profiles").update({ role, nombre, documento, telefono }).eq("id", data.user.id);
  return data.user.id;
}

async function main() {
  await wipe();
  const { data: sa } = await s.from("profiles").select("id").eq("role", "superadmin").limit(1).single();
  const saId = sa?.id ?? null;

  console.log("• Staff…");
  const profe1 = await crearStaff("profe1", "Juan Téllez", "profesor", "79000111", "3001110001");
  const profe2 = await crearStaff("profe2", "Andrés Mora", "profesor", "79000222", "3001110002");
  const profe3 = await crearStaff("profe3", "Camila Ruiz", "profesor", "79000333", "3001110003");
  await crearStaff("coorddep", "Mariana López", "coord_deportivo", "52000444", "3001110004");
  await crearStaff("coordadm", "Felipe Castro", "coord_admin", "79000555", "3001110005");
  await crearStaff("recep", "Sara Gil", "recepcion", "52000666", "3001110006");
  for (const [pid, valor] of [[profe1, 80000], [profe2, 90000], [profe3, 75000]])
    await s.from("profesor_valor_clase").insert({ profesor_id: pid, valor, created_by: saId });

  console.log("• Clientes…");
  const A = (n, a, doc, fn, cel, em, en, ec, ep, estado = "activo") => ({ n, a, doc, fn, cel, em, en, ec, ep, estado });
  const M = (n, a, doc, fn, cel, em, acuN, acuTel, acuPar) => ({ n, a, doc, fn, cel, em, en: acuN, ec: acuTel, ep: acuPar, acu: { nombre: acuN, doc: "5" + doc, tel: acuTel, par: acuPar } });
  const clientesData = [
    A("Carlos", "Gómez", "1098765432", "1990-04-15", "3001112233", "carlos@correo.com", "Ana Gómez", "3004445566", "Esposa"),
    A("Daniela", "Parra", "1037602611", "1990-02-22", "3206358295", "daniela@correo.com", "Luis Parra", "3043787768", "Esposo"),
    A("Marcela", "Salazar", "1016296576", "1987-02-22", "3009165765", "marcela@correo.com", "Diego Benítez", "3043567856", "Hermano"),
    A("Martina", "Dunoyer", "1016754234", "1993-05-02", "3207865437", "martina@correo.com", "Esteban Román", "3118765437", "Novio"),
    A("Andrés", "Beltrán", "1020304050", "1985-11-10", "3015556677", "andres@correo.com", "Paula Beltrán", "3016667788", "Esposa"),
    A("Laura", "Vélez", "1030405060", "1996-07-21", "3025557788", "laura@correo.com", "Mario Vélez", "3026668899", "Padre"),
    A("Juan", "Restrepo", "1040506070", "1991-03-03", "3035558899", "juan@correo.com", "Sofía Restrepo", "3036669900", "Esposa"),
    A("Paula", "Ríos", "1050607080", "1989-09-09", "3045559900", "paula@correo.com", "Iván Ríos", "3046660011", "Esposo"),
    A("Felipe", "Cano", "1060708090", "1994-12-12", "3055550011", "felipe@correo.com", "Nora Cano", "3056661122", "Madre"),
    A("Valentina", "Soto", "1070809010", "1998-01-30", "3065551122", "valentina@correo.com", "Hugo Soto", "3066662233", "Padre"),
    A("Mateo", "Lara", "1080901020", "1986-06-18", "3075552233", "mateo@correo.com", "Lina Lara", "3076663344", "Esposa"),
    A("Camila", "Ortiz", "1090102030", "1992-08-25", "3085553344", "camila@correo.com", "Raúl Ortiz", "3086664455", "Padre"),
    A("Sebastián", "Niño", "1100203040", "1983-10-05", "3095554455", "sebastian@correo.com", "Eva Niño", "3096665566", "Esposa"),
    A("Carolina", "Páez", "1110304050", "1995-02-14", "3105555566", "carolina@correo.com", "Tom Páez", "3106666677", "Hermano", "retirado"),
    A("Tomás", "Arango", "1120405060", "1988-04-04", "3115556677", "tomas@correo.com", "Ema Arango", "3116667788", "Esposa", "retirado"),
    M("Sofía", "Ramírez", "1012345678", "2012-09-30", "3203308976", "sofia@correo.com", "Laura Ramírez", "3007778899", "Madre"),
    M("Emiliano", "Torres", "1014567890", "2014-03-12", "3204445566", "emiliano@correo.com", "Pedro Torres", "3008889900", "Padre"),
    M("Isabella", "Mejía", "1016789012", "2010-07-08", "3205556677", "isabella@correo.com", "Clara Mejía", "3009990011", "Madre"),
    M("Samuel", "Ardila", "1018901234", "2015-11-20", "3206667788", "samuel@correo.com", "Jorge Ardila", "3001112200", "Padre"),
    M("Luciana", "Gil", "1011223344", "2013-05-25", "3207778899", "luciana@correo.com", "Sara Gil", "3002223300", "Madre"),
  ];
  const cli = [];
  for (const c of clientesData) {
    let acuId = null;
    if (c.acu) acuId = await ins1("acudientes", { nombre: c.acu.nombre, documento: c.acu.doc, telefono: c.acu.tel, parentesco: c.acu.par });
    const id = await ins1("clientes", {
      nombres: c.n, apellidos: c.a, documento: c.doc, fecha_nacimiento: c.fn, es_menor: !!c.acu,
      celular: c.cel, email: c.em, emergencia_nombre: c.en, emergencia_celular: c.ec, emergencia_parentesco: c.ep,
      acudiente_id: acuId, estado: c.estado ?? "activo",
    });
    cli.push(id);
  }

  console.log("• Academias + programación…");
  async function crearAcademia(codigo, nombre, deporte, profesorId, dias, hi, hf, precio, matricula) {
    const ini = dShift(-14), fin = dShift(28);
    const id = await ins1("academias", {
      codigo, nombre, deporte, profesor_id: profesorId, cancha: "Cancha 1", nivel: "Intermedio",
      dias_semana: dias, hora_inicio: hi, hora_fin: hf, precio, matricula, periodo_inicio: ini, periodo_fin: fin,
    });
    const rows = [];
    for (let t = hoy.getTime() - 14 * 86400000; t <= hoy.getTime() + 28 * 86400000; t += 86400000) {
      const d = new Date(t);
      if (dias.includes(d.getDay())) {
        const past = d < hoy;
        rows.push({ tipo: "academia", academia_id: id, profesor_id: profesorId, deporte, cancha: "Cancha 1", fecha: fmt(d), hora_inicio: hi, hora_fin: hf, estado: past ? "realizada" : "programada", registrada_por: past ? profesorId : null });
      }
    }
    if (rows.length) await s.from("clases").insert(rows);
    return id;
  }
  const acaJuv = await crearAcademia("ACA-2026-TEN-0001", "Tenis Juvenil", "tenis", profe1, [1, 3], "16:00", "17:00", 350000, 50000);
  const acaAdu = await crearAcademia("ACA-2026-TEN-0002", "Tenis Adultos", "tenis", profe2, [2, 4], "18:00", "19:00", 380000, 50000);
  const acaPad = await crearAcademia("ACA-2026-PAD-0001", "Pádel Iniciación", "padel", profe3, [6], "09:00", "11:00", 300000, 40000);

  console.log("• Inscripciones + lista de espera…");
  const inscrip = [];
  // juvenil: los 5 menores (índices 15-19) + 2 adultos
  for (const [idx, plan, desc] of [[15, 2, 0], [16, 2, 10], [17, 3, 0], [18, 1, 0], [19, 2, 15], [5, 2, 0], [9, 1, 0]]) inscrip.push({ academia_id: acaJuv, cliente_id: cli[idx], plan_frecuencia: plan, descuento_pct: desc });
  for (const [idx, plan, desc] of [[0, 2, 0], [1, 3, 10], [4, 2, 0], [6, 1, 0]]) inscrip.push({ academia_id: acaAdu, cliente_id: cli[idx], plan_frecuencia: plan, descuento_pct: desc });
  for (const [idx, plan, desc] of [[2, 1, 0], [7, 2, 5], [10, 1, 0]]) inscrip.push({ academia_id: acaPad, cliente_id: cli[idx], plan_frecuencia: plan, descuento_pct: desc });
  await s.from("inscripciones").insert(inscrip);
  await s.from("lista_espera").insert([
    { academia_id: acaJuv, nombre: "Pedro Niño", contacto: "3120001111", deporte: "tenis", nivel: "Principiante", edad: 9, disponibilidad: "Tardes" },
    { academia_id: acaPad, nombre: "Lucía Mora", contacto: "3120002222", deporte: "padel", nivel: "Intermedio", edad: 30, disponibilidad: "Sábados" },
    { academia_id: acaAdu, nombre: "Diego Sáenz", contacto: "3120003333", deporte: "tenis", nivel: "Avanzado", edad: 41, disponibilidad: "Noches" },
  ]);

  console.log("• Paquetes…");
  const bono4 = await ins1("paquetes_catalogo", { nombre: "Bono 4 clases", deporte: null, num_clases: 4, precio: 320000 });
  const bono8 = await ins1("paquetes_catalogo", { nombre: "Bono 8 clases", deporte: null, num_clases: 8, precio: 560000 });
  const bono12 = await ins1("paquetes_catalogo", { nombre: "Bono 12 clases", deporte: null, num_clases: 12, precio: 780000 });
  await s.from("paquetes_cliente").insert([
    { cliente_id: cli[0], catalogo_id: bono8, num_clases: 8, clases_consumidas: 3, descuento_pct: 0, estado: "activo" },
    { cliente_id: cli[3], catalogo_id: bono4, num_clases: 4, clases_consumidas: 4, descuento_pct: 0, estado: "agotado" },
    { cliente_id: cli[7], catalogo_id: bono12, num_clases: 12, clases_consumidas: 1, descuento_pct: 10, estado: "activo" },
    { cliente_id: cli[10], catalogo_id: bono8, num_clases: 8, clases_consumidas: 7, descuento_pct: 0, estado: "activo" },
    { cliente_id: cli[12], catalogo_id: bono4, num_clases: 4, clases_consumidas: 0, descuento_pct: 5, estado: "activo" },
  ]);

  console.log("• Clases individuales (realizadas / pendientes / futuras)…");
  const clasesInd = [];
  // realizadas (para liquidación y reportes)
  for (const [cIdx, pid, dep, off] of [[0, profe1, "tenis", -10], [1, profe2, "tenis", -8], [3, profe1, "tenis", -6], [7, profe3, "padel", -5], [10, profe2, "tenis", -4], [0, profe1, "tenis", -3]])
    clasesInd.push({ tipo: "individual", cliente_id: cli[cIdx], profesor_id: pid, deporte: dep, cancha: "Cancha 2", fecha: dShift(off), hora_inicio: "10:00", hora_fin: "11:00", precio: 120000, estado: "realizada", registrada_por: pid });
  // pendientes de cierre (past programada; las más viejas dispararán alerta +24h)
  for (const [cIdx, pid, dep, off] of [[2, profe3, "padel", -3], [4, profe2, "tenis", -2], [5, profe1, "tenis", -2], [6, profe2, "tenis", -1]])
    clasesInd.push({ tipo: "individual", cliente_id: cli[cIdx], profesor_id: pid, deporte: dep, cancha: "Cancha 2", fecha: dShift(off), hora_inicio: "10:00", hora_fin: "11:00", precio: 120000, estado: "programada" });
  // futuras
  for (const [cIdx, pid, dep, off] of [[8, profe1, "tenis", 1], [9, profe3, "padel", 2], [11, profe2, "tenis", 3], [12, profe1, "tenis", 5]])
    clasesInd.push({ tipo: "individual", cliente_id: cli[cIdx], profesor_id: pid, deporte: dep, cancha: "Cancha 2", fecha: dShift(off), hora_inicio: "10:00", hora_fin: "11:00", precio: 120000, estado: "programada" });
  await s.from("clases").insert(clasesInd);

  console.log("• Pagos + abonos…");
  const pagosAsignar = [
    { cli: 0, monto: 350000, centro: "academia_tenis", concepto: "Academia Tenis Juvenil", servicio: "Tenis Juvenil", periodos: ["enero", "febrero", "marzo"] },
    { cli: 15, monto: 350000, centro: "academia_tenis", concepto: "Academia Tenis Juvenil", servicio: "Tenis Juvenil", periodos: ["enero", "febrero"] },
    { cli: 2, monto: 300000, centro: "academia_padel", concepto: "Academia Pádel", servicio: "Pádel Iniciación", periodos: ["febrero"] },
    { cli: 0, monto: 560000, centro: "clase_particular", concepto: "Bono 8 clases", servicio: "Bono 8 clases", periodos: [] },
    { cli: 7, monto: 780000, centro: "clase_particular", concepto: "Bono 12 clases", servicio: "Bono 12 clases", periodos: [] },
  ];
  for (const p of pagosAsignar) {
    const pid = await ins1("pagos", { origen: "siigo", external_id: "SG-" + Math.floor(Math.random() * 9000 + 1000), monto: p.monto, fecha: dShift(-Math.floor(Math.random() * 10)), centro_costos: p.centro, concepto: p.concepto, estado: "asignado" });
    await s.from("asignaciones_pago").insert({ pago_id: pid, cliente_id: cli[p.cli], servicio: p.servicio, periodos: p.periodos });
  }
  // sin asignar (bolsa)
  await s.from("pagos").insert([
    { origen: "siigo", external_id: "SG-7001", monto: 380000, fecha: dShift(-2), centro_costos: "academia_tenis", concepto: "Academia Tenis Adultos", estado: "sin_asignar" },
    { origen: "siigo", external_id: "SG-7002", monto: 45000, fecha: dShift(-1), centro_costos: "cafeteria", concepto: "Cafetería", estado: "sin_asignar" },
    { origen: "siigo", external_id: "SG-7003", monto: 120000, fecha: dShift(-1), centro_costos: "clase_particular", concepto: "Clase suelta", estado: "sin_asignar" },
    { origen: "siigo", external_id: "SG-7004", monto: 300000, fecha: dShift(0), centro_costos: "academia_padel", concepto: "Academia Pádel", estado: "sin_asignar" },
    { origen: "siigo", external_id: "SG-7005", monto: 60000, fecha: dShift(0), centro_costos: "cafeteria", concepto: "Cafetería", estado: "sin_asignar" },
  ]);
  await s.from("abonos").insert([
    { cliente_id: cli[1], centro_costos: "cafeteria", monto: 25000, nota: "Abono cafetería" },
    { cliente_id: cli[5], centro_costos: "cafeteria", monto: 30000, nota: "Abono parcial" },
  ]);

  // Resumen
  const cnt = async (t) => (await s.from(t).select("*", { count: "exact", head: true })).count;
  console.log("\n✅ Demo sembrado:");
  console.log("   clientes:", await cnt("clientes"), "· academias:", await cnt("academias"), "· clases:", await cnt("clases"));
  console.log("   inscripciones:", await cnt("inscripciones"), "· paquetes_cliente:", await cnt("paquetes_cliente"), "· pagos:", await cnt("pagos"));
  console.log("   staff demo (password " + PW + "): profe1/profe2/profe3, coorddep, coordadm, recep (correos vena.digital.2207+demo.<tag>@gmail.com)");
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
