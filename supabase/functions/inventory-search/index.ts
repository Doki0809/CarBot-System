// Supabase Edge Function: inventory-search
// Called by Cloy AI bots (server-side only) to read a SINGLE dealer's live,
// available inventory. Custom bearer-token auth (per-subaccount key), not
// Supabase JWT — verify_jwt is disabled for this function on purpose.
//
// Two response shapes, picked with `format`:
//   (default) bot-facing — prices pre-formatted as text ("US$ 1,250,000"),
//             empty fields dropped, photos capped, max 20 rows.
//   "raw"     machine-facing — numbers stay numbers, booleans stay booleans,
//             every key present (null when empty), full photo set, and
//             `offset`/`total` for paginating a whole catalog.
//
// By default only "Disponible" units are returned. Pass `incluir_cotizados: true`
// (or `estado: "todos"`) to also include "Cotizado" units — every row carries
// its own `estado` field ("Disponible" | "Cotizado") so the caller can tell
// them apart.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CURRENCY_SYMBOL: Record<string, string> = { USD: "US$", DOP: "RD$" };
const EMPTY_STRINGS = new Set(["", "n/a", "no disponible", "no disponible.", "null", "undefined"]);

function fmtMoney(value: unknown, currency: string | null): string | undefined {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (n === null || n === undefined || Number.isNaN(n) || n <= 0) return undefined;
  const symbol = CURRENCY_SYMBOL[currency ?? "USD"] ?? `${currency ?? ""} `.trim() + " ";
  return `${symbol} ${new Intl.NumberFormat("en-US").format(n)}`;
}

function fmtMillaje(value: unknown): string | undefined {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (n === null || n === undefined || Number.isNaN(n) || n <= 0) return undefined;
  return `${new Intl.NumberFormat("en-US").format(n)} millas`;
}

function clean(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string" && EMPTY_STRINGS.has(v.trim().toLowerCase())) return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

/** First meaningful string from a list of candidates (flat column first, then
 * jsonb detalles aliases). Numbers/booleans are coerced to string. */
function firstVal(...cands: unknown[]): string | undefined {
  for (const c of cands) {
    if (c === null || c === undefined) continue;
    if (typeof c === "number" && !Number.isNaN(c)) return String(c);
    if (typeof c === "boolean") return c ? "Sí" : "No";
    if (typeof c === "string") {
      const t = c.trim();
      if (t && !EMPTY_STRINGS.has(t.toLowerCase())) return t;
    }
  }
  return undefined;
}

/** Normalize a yes/no-ish value (boolean, "Sí"/"No", "true"/"false") to
 * "Sí"/"No". Returns undefined only when no candidate carries information. */
function yesNo(...cands: unknown[]): string | undefined {
  for (const c of cands) {
    if (c === null || c === undefined) continue;
    if (typeof c === "boolean") return c ? "Sí" : "No";
    if (typeof c === "number") return c > 0 ? "Sí" : "No";
    if (typeof c === "string") {
      const t = c.trim().toLowerCase();
      if (!t || EMPTY_STRINGS.has(t)) continue;
      if (["sí", "si", "true", "1", "yes"].includes(t)) return "Sí";
      if (["no", "false", "0"].includes(t)) return "No";
      // Any other non-empty descriptive string (e.g. "Reversa") counts as present.
      return c.trim();
    }
  }
  return undefined;
}

/** First candidate that carries a real number. Strings are stripped of
 * formatting ("1,250,000" / "96,493 millas") before parsing. */
function numOrNull(...cands: unknown[]): number | null {
  for (const c of cands) {
    if (c === null || c === undefined) continue;
    if (typeof c === "number") {
      if (Number.isFinite(c)) return c;
      continue;
    }
    if (typeof c === "string") {
      const t = c.trim();
      if (!t || EMPTY_STRINGS.has(t.toLowerCase())) continue;
      const n = Number(t.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/** Like `yesNo`, but returns a real boolean for consumers that render UI
 * instead of prose. A descriptive value ("Reversa") counts as present. */
function boolOrNull(...cands: unknown[]): boolean | null {
  for (const c of cands) {
    if (c === null || c === undefined) continue;
    if (typeof c === "boolean") return c;
    if (typeof c === "number") return c > 0;
    if (typeof c === "string") {
      const t = c.trim().toLowerCase();
      if (!t || EMPTY_STRINGS.has(t)) continue;
      if (["sí", "si", "true", "1", "yes"].includes(t)) return true;
      if (["no", "false", "0"].includes(t)) return false;
      return true;
    }
  }
  return null;
}

function textOrNull(...cands: unknown[]): string | null {
  return firstVal(...cands) ?? null;
}

/**
 * Machine-readable shape for consumers that render their own UI (a dealer's
 * public website), as opposed to the default shape, which is written to be
 * read aloud by a bot.
 *
 * Differences that matter: prices and mileage stay NUMBERS with the currency
 * in its own field, feature flags stay BOOLEANS, keys are never dropped when
 * empty (a typed consumer wants `null`, not a missing property), and the full
 * photo set is returned.
 *
 * The field list is an explicit allowlist, not a spread of the row: the view
 * carries a `detalles` blob that includes the VIN/chasis, which has no place
 * in a public website payload.
 */
function toRawVehicle(v: Record<string, unknown>): Record<string, unknown> {
  const d = (v.detalles && typeof v.detalles === "object" ? v.detalles : {}) as Record<string, unknown>;
  const fotos: string[] = Array.isArray(v.fotos) ? v.fotos.filter((f: unknown) => typeof f === "string") : [];

  return {
    id: v.id,
    dealer_id: v.dealer_id,
    estado: textOrNull(v.estado),
    titulo: textOrNull(v.titulo, d.titulo_vehiculo),
    marca: textOrNull(v.marca, d.marca, d.make),
    modelo: textOrNull(v.modelo, d.modelo, d.model),
    edicion: textOrNull(v.edicion, d.edicion, d.edition),
    anio: numOrNull(v.anio, d.anio, d.year),
    precio: numOrNull(v.precio, d.precio, d.price),
    moneda_precio: textOrNull(v.moneda_precio, d.moneda_precio, d.currency),
    inicial: numOrNull(v.inicial, d.inicial, d.initial_payment),
    moneda_inicial: textOrNull(v.moneda_inicial, d.moneda_inicial, d.downPaymentCurrency),
    millas: numOrNull(v.millas, d.millas, d.mileage),
    color: textOrNull(v.color, d.color, d.exteriorColor),
    transmision: textOrNull(v.transmision, d.transmision, d.transmission),
    traccion: textOrNull(v.traccion, d.traccion, d.traction, d.drivetrain),
    combustible: textOrNull(v.combustible, d.combustible, d.fuel, d.fuelType),
    motor: textOrNull(v.motor, d.engine_type, d.engine, d.motor),
    cilindros: numOrNull(d.engine_cyl, d.cilindros),
    cc: numOrNull(d.engine_cc, d.cc),
    tipo_vehiculo: textOrNull(v.tipo_vehiculo, d.tipo_vehiculo, d.type),
    cantidad_asientos: numOrNull(v.cantidad_asientos, d.cantidad_asientos, d.seats, d.asientos),
    llave: textOrNull(v.llave, d.key_type, d.llave, d.keyType),
    camara: textOrNull(v.camara, d.camara, d.camera),
    techo: textOrNull(v.techo, d.techo, d.roof_type, d.roof),
    material_asientos: textOrNull(v.material_asientos, d.material_asientos, d.seat_material, d.interiorMaterial),
    condicion: textOrNull(v.condicion, d.condicion, d.condition),
    condicion_carfax: textOrNull(v.condicion_carfax, d.clean_carfax, d.condicion_carfax),
    carplay: boolOrNull(v.carplay, d.carplay, d.appleCarplay),
    sensores: boolOrNull(v.sensores, d.sensores, d.sensors),
    vidrios_electricos: boolOrNull(v.vidrios_electricos, d.vidrios_electricos, d.electric_windows, d.powerWindows),
    baul_electrico: boolOrNull(v.baul_electrico, d.baul_electrico, d.powerTrunk),
    fotos,
    link_externo: textOrNull(v.link_externo),
    catalogo_url: textOrNull(v.dealer_catalogo_url),
    created_at: v.created_at ?? null,
    updated_at: v.updated_at ?? null,
  };
}


// ── Financiamiento ────────────────────────────────────────────────────
// Los bots tienen que poder responder "¿y a 36 meses?" sin volver a llamar,
// así que cada vehículo viaja con la cuota calculada para TODOS los plazos que
// cada banco del dealer ofrece, no solo el que el dealer dejó elegido.
//
// Misma fórmula de amortización que usa la calculadora pública del vehículo
// (functions/index.js) y el simulador del panel, para que el número que dice
// el bot sea idéntico al que ve el cliente en la web y el dealer en su ficha.
const FINANCING_TERMS = [6, 12, 24, 36, 48, 60, 72];

type Bank = {
  id: string;
  banco: string;
  tasa_anual: number;
  max_financiamiento_pct: number;
  plazo_maximo_meses: number;
};

function monthlyPayment(principal: number, annualRate: number, months: number): number {
  if (!(principal > 0) || !(months > 0)) return 0;
  const r = (annualRate / 100) / 12;
  return r > 0
    ? (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1)
    : principal / months;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Bloque de financiamiento de un vehículo: monto a financiar, la opción que
 * el dealer dejó marcada y la tabla completa banco × plazo. */
function buildFinancing(
  v: Record<string, unknown>,
  banks: Bank[],
  formatted: boolean,
): Record<string, unknown> | undefined {
  if (banks.length === 0) return undefined;

  const precio = numOrNull(v.precio);
  const inicial = numOrNull(v.inicial) ?? 0;
  if (precio === null || precio <= 0) return undefined;

  // El inicial puede estar guardado en otra moneda que el precio. Sin tasa de
  // cambio aquí no se puede convertir con fidelidad, así que solo se descuenta
  // cuando ambas monedas coinciden; si no, se informa el precio completo y se
  // deja constancia en `nota` en vez de restar un número incorrecto.
  const monedaPrecio = textOrNull(v.moneda_precio) ?? "USD";
  const monedaInicial = textOrNull(v.moneda_inicial) ?? monedaPrecio;
  const mismaMoneda = monedaPrecio === monedaInicial;
  const inicialAplicado = mismaMoneda ? inicial : 0;
  const financiado = Math.max(precio - inicialAplicado, 0);
  if (financiado <= 0) return undefined;

  // En el modo bot se redondea antes de formatear: una cuota es un número
  // fraccionado y sin esto salía "RD$ 19,588.952" en un texto que se lee en voz
  // alta. El modo raw conserva 2 decimales para quien haga sus propios cálculos.
  const money = (n: number) => (formatted ? (fmtMoney(Math.round(n), monedaPrecio) ?? String(Math.round(n))) : round2(n));

  const chosenBankId = textOrNull(v.financiamiento_banco_id);
  const chosenTerm = numOrNull(v.financiamiento_plazo_meses);
  const manualRate = numOrNull(v.financiamiento_tasa_manual);

  const opciones = banks.map((b) => {
    const rate = (chosenBankId === b.id && manualRate !== null) ? manualRate : Number(b.tasa_anual);
    // Solo los plazos que ese banco realmente ofrece: si el bot cotiza 72
    // meses en un banco que llega a 48, promete algo que no existe.
    const terms = FINANCING_TERMS.filter((t) => t <= Number(b.plazo_maximo_meses));
    if (!terms.includes(Number(b.plazo_maximo_meses))) terms.push(Number(b.plazo_maximo_meses));
    return {
      banco: b.banco,
      tasa_anual: rate,
      tasa_manual: (chosenBankId === b.id && manualRate !== null) || undefined,
      max_financiamiento_pct: Number(b.max_financiamiento_pct),
      plazo_maximo_meses: Number(b.plazo_maximo_meses),
      cuotas: terms.sort((a, z) => a - z).map((t) => ({
        plazo_meses: t,
        cuota_mensual: money(monthlyPayment(financiado, rate, t)),
      })),
    };
  });

  // Opción 1: la que el dealer dejó elegida en la ficha. Sin elección guardada,
  // el primer banco activo — igual que hace el simulador al abrirse.
  const primaryBank = banks.find((b) => b.id === chosenBankId) ?? banks[0];
  const primaryRate = manualRate !== null && (chosenBankId === null || chosenBankId === primaryBank.id)
    ? manualRate
    : Number(primaryBank.tasa_anual);
  const primaryTerm = chosenTerm ?? Number(primaryBank.plazo_maximo_meses) ?? 48;

  const financiadoPct = (financiado / precio) * 100;

  return {
    monto_a_financiar: money(financiado),
    moneda: monedaPrecio,
    inicial_aplicado: money(inicialAplicado),
    porcentaje_financiado: round2(financiadoPct),
    ...(mismaMoneda ? {} : { nota: `El inicial está en ${monedaInicial} y el precio en ${monedaPrecio}; el cálculo no lo descuenta. Confirmar con el asesor.` }),
    opcion_recomendada: {
      banco: primaryBank.banco,
      tasa_anual: primaryRate,
      plazo_meses: primaryTerm,
      cuota_mensual: money(monthlyPayment(financiado, primaryRate, primaryTerm)),
      excede_max_financiamiento: financiadoPct > Number(primaryBank.max_financiamiento_pct) + 0.01 || undefined,
    },
    opciones,
  };
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const log: Record<string, unknown> = {
    status_code: 500, query: null, filters: null, result_count: null,
    error_message: null, api_client_id: null, dealer_id: null,
    cloy_bot_id: null, cloy_subaccount_id: null,
  };
  const flush = () => admin.from("inventory_api_logs").insert(log).then(() => {});

  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) { log.status_code = 401; log.error_message = "missing_bearer_token"; await flush(); return json({ error: "Unauthorized" }, 401); }

    const keyHash = await sha256Hex(token);
    const { data: client } = await admin
      .from("api_clients")
      .select("id, cloy_subaccount_id, cloy_bot_id, active")
      .eq("api_key_hash", keyHash)
      .maybeSingle();
    if (!client || !client.active) { log.status_code = 401; log.error_message = "invalid_or_inactive_api_key"; await flush(); return json({ error: "Unauthorized" }, 401); }
    log.api_client_id = client.id; log.cloy_subaccount_id = client.cloy_subaccount_id; log.cloy_bot_id = client.cloy_bot_id;

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { log.status_code = 400; log.error_message = "invalid_json_body"; await flush(); return json({ error: "Bad Request" }, 400); }

    const dealerId = typeof body.dealer_id === "string" ? body.dealer_id : "";
    log.dealer_id = dealerId || null; log.query = typeof body.q === "string" ? body.q : null; log.filters = body;
    if (!dealerId) { log.status_code = 400; log.error_message = "missing_dealer_id"; await flush(); return json({ error: "Bad Request", message: "dealer_id is required." }, 400); }

    const { data: access } = await admin
      .from("api_client_dealer_access")
      .select("id").eq("api_client_id", client.id).eq("dealer_id", dealerId).eq("active", true).maybeSingle();
    if (!access) { log.status_code = 403; log.error_message = "dealer_not_authorized_for_client"; await flush(); return json({ error: "Forbidden", message: "This client does not have access to this dealer inventory." }, 403); }

    // `count: exact` on every call so the caller can paginate. The view is
    // per-dealer and holds tens of rows, so the extra count costs nothing.
    let q = admin
      .from("public_inventory_view")
      .select("*", { count: "exact" })
      .eq("dealer_id", dealerId);

    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
    const bool = (v: unknown) => (typeof v === "boolean" ? v : null);

    const marca = str(body.marca), modelo = str(body.modelo), tipo = str(body.tipo);
    const combustible = str(body.combustible), transmision = str(body.transmision), traccion = str(body.traccion), color = str(body.color);
    const precioMax = num(body.precio_max), inicialMax = num(body.inicial_max), anioMin = num(body.ano_min), anioMax = num(body.ano_max);
    const search = str(body.q), vehicleId = str(body.vehicle_id);
    const asientosMin = num(body.asientos_min);
    const carplay = bool(body.carplay), sensores = bool(body.sensores), vidriosElectricos = bool(body.vidrios_electricos), baulElectrico = bool(body.baul_electrico);
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // By default only "Disponible" units are returned — a bot reading this
    // aloud, or a website's "for sale" grid, shouldn't surface units someone
    // already has a deal on. `incluir_cotizados` (or `estado: "todos"`) opts
    // in to also seeing "Cotizado" units, each tagged with its own `estado`
    // field so the caller can tell them apart.
    const incluirCotizados = body.incluir_cotizados === true || str(body.estado)?.toLowerCase() === 'todos';

    // `updated_since` (ISO 8601) lets a caller poll for just what changed
    // instead of re-pulling the whole catalog every time — pass back the
    // newest `updated_at` you saw and only rows touched after it come back.
    const updatedSince = str(body.updated_since);
    const updatedSinceValid = updatedSince && !Number.isNaN(Date.parse(updatedSince)) ? updatedSince : null;
    if (updatedSince && !updatedSinceValid) {
      log.status_code = 400; log.error_message = "invalid_updated_since"; await flush();
      return json({ error: "Bad Request", message: `updated_since inválido: "${updatedSince}" no es una fecha ISO 8601.` }, 400);
    }

    if (vehicleId && !UUID_RE.test(vehicleId)) { log.status_code = 400; log.error_message = "invalid_vehicle_id_format"; await flush(); return json({ error: "Bad Request", message: `vehicle_id inválido: "${vehicleId}" no es un UUID.` }, 400); }

    // `format: "raw"` serves consumers that render their own UI (a dealer's
    // public website). Anything else keeps the bot-facing shape byte for byte
    // — the assistants already in production depend on it.
    const rawMode = str(body.format) === "raw";
    const fullPhotos = rawMode || body.full_photos === true || Boolean(vehicleId);

    if (!incluirCotizados) q = q.eq("estado", "Disponible");
    if (updatedSinceValid) q = q.gt("updated_at", updatedSinceValid);
    if (vehicleId) q = q.eq("id", vehicleId);
    if (marca) q = q.ilike("marca", `%${marca}%`);
    if (modelo) q = q.ilike("modelo", `%${modelo}%`);
    if (tipo) q = q.ilike("tipo_vehiculo", `%${tipo}%`);
    if (combustible) q = q.ilike("combustible", `%${combustible}%`);
    if (transmision) q = q.ilike("transmision", `%${transmision}%`);
    if (traccion) q = q.ilike("traccion", `%${traccion}%`);
    if (color) q = q.ilike("color", `%${color}%`);
    if (precioMax !== null && precioMax > 0) q = q.lte("precio", precioMax);
    if (inicialMax !== null && inicialMax > 0) q = q.lte("inicial", inicialMax);
    if (anioMin !== null && anioMin > 0) q = q.gte("anio", anioMin);
    if (anioMax !== null && anioMax > 0) q = q.lte("anio", anioMax);
    if (asientosMin !== null && asientosMin > 0) q = q.gte("cantidad_asientos", asientosMin);
    if (carplay !== null) q = q.eq("carplay", carplay);
    if (sensores !== null) q = q.eq("sensores", sensores);
    if (vidriosElectricos !== null) q = q.eq("vidrios_electricos", vidriosElectricos);
    if (baulElectrico !== null) q = q.eq("baul_electrico", baulElectrico);
    if (search) {
      const s = search.replace(/[%,]/g, "");
      q = q.or(`marca.ilike.%${s}%,modelo.ilike.%${s}%,edicion.ilike.%${s}%,titulo.ilike.%${s}%,tipo_vehiculo.ilike.%${s}%,color.ilike.%${s}%,combustible.ilike.%${s}%,transmision.ilike.%${s}%,llave.ilike.%${s}%,camara.ilike.%${s}%,techo.ilike.%${s}%,material_asientos.ilike.%${s}%,condicion.ilike.%${s}%`);
    }

    // A bot reads results aloud, so 20 is a deliberate ceiling there. A website
    // paints a grid and needs the whole inventory, hence the higher cap and the
    // `offset` — without it a catalog could never show its 21st vehicle.
    const maxLimit = rawMode ? 100 : 20;
    const limit = Math.min(Math.max(num(body.limit) ?? (rawMode ? 100 : 10), 1), maxLimit);
    const offset = Math.max(num(body.offset) ?? 0, 0);

    const { data: rows, error, count } = await q
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) { log.status_code = 500; log.error_message = error.message; await flush(); return json({ error: "Internal Server Error", message: "No se pudo consultar el inventario." }, 500); }

    // Una sola consulta de bancos por request (no por vehículo): la lista es
    // del dealer, no de la unidad.
    const { data: bankRows } = await admin
      .from("dealer_financing_banks")
      .select("id, banco, tasa_anual, max_financiamiento_pct, plazo_maximo_meses")
      .eq("dealer_id", dealerId)
      .eq("activo", true)
      .order("orden", { ascending: true });
    const banks: Bank[] = (bankRows ?? []).map((b: Record<string, unknown>) => ({
      id: String(b.id),
      banco: String(b.banco),
      tasa_anual: Number(b.tasa_anual),
      max_financiamiento_pct: Number(b.max_financiamiento_pct),
      plazo_maximo_meses: Number(b.plazo_maximo_meses),
    }));

    if (rawMode) {
      const vehiculos = (rows ?? []).map((v) => {
        const row = v as Record<string, unknown>;
        const fin = buildFinancing(row, banks, false);
        return { ...toRawVehicle(row), financiamiento: fin ?? null };
      });
      log.status_code = 200; log.result_count = vehiculos.length; await flush();
      await admin.from("api_clients").update({ last_used_at: new Date().toISOString() }).eq("id", client.id);
      // `total` is the dealer's matching inventory size; `count` is this page.
      return json({ dealer_id: dealerId, total: count ?? vehiculos.length, count: vehiculos.length, offset, limit, vehiculos }, 200);
    }

    const vehiculos = (rows ?? []).map((v) => {
      const fotos: string[] = Array.isArray(v.fotos) ? v.fotos.filter((f: unknown) => typeof f === "string") : [];
      // The comfort/mechanical fields are inconsistently stored: sometimes in a
      // flat column, sometimes only inside the `detalles` jsonb (with varied
      // key aliases). Coalesce across BOTH so no populated field is ever
      // dropped just because it lives in the other place.
      const d = (v.detalles && typeof v.detalles === "object" ? v.detalles : {}) as Record<string, unknown>;
      const out: Record<string, unknown> = {
        id: v.id,
        dealer_id: v.dealer_id,
        estado: firstVal(v.estado),
        titulo: firstVal(v.titulo, d.titulo_vehiculo),
        marca: firstVal(v.marca, d.marca, d.make),
        modelo: firstVal(v.modelo, d.modelo, d.model),
        anio: firstVal(v.anio, d.anio, d.year),
        edicion: firstVal(v.edicion, d.edicion, d.edition),
        precio: fmtMoney(v.precio, v.moneda_precio),
        inicial: fmtMoney(v.inicial, v.moneda_inicial),
        color: firstVal(v.color, d.color, d.exteriorColor),
        transmision: firstVal(v.transmision, d.transmision, d.transmission),
        traccion: firstVal(v.traccion, d.traccion, d.traction, d.drivetrain),
        combustible: firstVal(v.combustible, d.combustible, d.fuel, d.fuelType),
        motor: firstVal(v.motor, d.engine_type, d.engine, d.motor),
        cilindros: firstVal(d.engine_cyl, d.cilindros),
        cc: firstVal(d.engine_cc, d.cc),
        millaje: fmtMillaje(v.millas ?? d.millas ?? d.mileage),
        tipo: firstVal(v.tipo_vehiculo, d.tipo_vehiculo, d.type),
        asientos: firstVal(v.cantidad_asientos, d.cantidad_asientos, d.seats, d.asientos),
        arranque: firstVal(v.llave, d.key_type, d.llave, d.keyType),
        camara: yesNo(v.camara, d.camara, d.camera),
        carplay: yesNo(v.carplay, d.carplay, d.appleCarplay),
        sensores: yesNo(v.sensores, d.sensores, d.sensors),
        vidrios_electricos: yesNo(v.vidrios_electricos, d.vidrios_electricos, d.electric_windows, d.powerWindows),
        baul_electrico: yesNo(v.baul_electrico, d.baul_electrico, d.powerTrunk),
        techo: firstVal(v.techo, d.techo, d.roof_type, d.roof),
        material_asientos: firstVal(v.material_asientos, d.material_asientos, d.seat_material, d.interiorMaterial),
        condicion: firstVal(v.condicion, d.condicion, d.condition),
        condicion_carfax: firstVal(v.condicion_carfax, d.clean_carfax, d.condicion_carfax),
        foto_principal: fotos[0],
        fotos: fullPhotos ? fotos.slice(1) : fotos.slice(1, 5),
        link_detalles: v.link_externo || v.dealer_catalogo_url,
      };
      for (const k of Object.keys(out)) if (!clean(out[k])) delete out[k];
      // Después del barrido de vacíos: `financiamiento` es un objeto anidado y
      // `clean` lo dejaría fuera aunque venga completo.
      const fin = buildFinancing(v as Record<string, unknown>, banks, true);
      if (fin) out.financiamiento = fin;
      return out;
    });

    log.status_code = 200; log.result_count = vehiculos.length; await flush();
    await admin.from("api_clients").update({ last_used_at: new Date().toISOString() }).eq("id", client.id);
    return json({ dealer_id: dealerId, total: vehiculos.length, vehiculos }, 200);
  } catch (err) {
    log.status_code = 500; log.error_message = err instanceof Error ? err.message : "unknown_error"; await flush();
    return json({ error: "Internal Server Error", message: "No se pudo consultar el inventario." }, 500);
  }
});
