const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const functions = require("firebase-functions");
const { onDocumentWritten, onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { createClient } = require('@supabase/supabase-js');

admin.initializeApp();

const db = admin.firestore();

// Supabase Configuration
const SUPABASE_URL = 'https://lpiwkennlavpzisdvnnh.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaXdrZW5ubGF2cHppc2R2bm5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE4MTEsImV4cCI6MjA4NzM1NzgxMX0.HMVGq8E2Lf5utJGxWsO8FEnJXCBzwSHVNEzeuoSm4y8';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// GHL Secrets for Gen 2
const ghlClientSecret = defineSecret("GHL_CLIENT_SECRET");
const ghlClientId = defineSecret("GHL_CLIENT_ID");
const supabaseServiceKey = defineSecret("SUPABASE_SERVICE_ROLE_KEY");

// ──────────────────────────────────────────────────────────────────
// 🔥 Configuración de IDs de Custom Fields de GoHighLevel
// Pega aquí los IDs alfanuméricos que te da GHL para cada campo.

const GHL_CUSTOM_FIELD_IDS = {
  // 🚘 1. Vehículo (Básico)
  marca: "",
  modelo: "",
  ao: "{{ contact.ao }}",                 // Para {{ contact.ao }}
  color: "",
  edicin: "",             // Para {{ contact.edicin }}
  chasis: "",             // Para {{ contact.chasis }}
  millaje: "",            // Para {{ contact.millaje }}
  tipo_de_vehculo: "",    // Para {{ contact.tipo_de_vehculo }}

  // ⚙️ 2. Mecánica
  transmisin: "",         // Para {{ contact.transmisin }}
  traccin: "",            // Para {{ contact.traccin }}
  tipo_de_combustible: "",// Para {{ contact.tipo_de_combustible }}
  motor: "",              // Para {{ contact.motor }}

  // 🛋️ 3. Equipamiento y Extras
  interior: "",           // Para {{ contact.interior }}
  techo: "",              // Para {{ contact.techo }}
  carplay: "",            // Para {{ contact.carplay }}
  camaa: "",              // Para {{ contact.camaa }}
  sensores: "",           // Para {{ contact.sensores }}
  baul_electrico: "",     // Para {{ contact.baul_electrico }}
  cristales_electrico: "",// Para {{ contact.cristales_electrico }}
  llave: "",              // Para {{ contact.llave }}
  filas_de_asientos: "",  // Para {{ contact.filas_de_asientos }}

  // 💰 4. Financiero
  precio_rd: "",            // Para {{ contact.precio_rd }}
  monto_a_financiar_rd: "", // Para {{ contact.monto_a_financiar_rd }}

  // 👤 5. Extras del Cliente
  cdula: "",                     // Para {{ contact.cdula }}
  a_que_quien_va_dirigida: ""    // Para {{ contact.a_que_quien_va_dirigida }}
};

// Función auxiliar para normalizar texto (quitar acentos y pasar a minúsculas)
// Función auxiliar para normalizar texto (quitar acentos, puntuación y normalizar espacios)
const normalize = (text) => {
  if (!text) return "";
  return text
    .toLowerCase()                // Convertir a minúsculas para consistencia
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar tildes (Á -> A)
    .replace(/\./g, "")             // Quitar puntos (S.R.L. -> SRL)
    .replace(/[.\-_]/g, " ")        // Tratar guiones y guiones bajos como espacios
    .replace(/\s+/g, " ")           // Colapsar múltiples espacios
    .trim();
};

// Función para crear un "Slug" limpio y estandarizado
const normalizeText = (text) => text ? text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

function toUuid(uid) {
  if (!uid) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) return uid;
  let hex = '';
  for (let i = 0; i < uid.length; i++) {
    hex += uid.charCodeAt(i).toString(16).padStart(2, '0');
  }
  hex = hex.padEnd(32, '0').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const slugify = (text) => {
  if (!text) return "";
  const normalized = text.toUpperCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (normalized.includes('DURAN') && normalized.includes('FERNANDEZ')) {
    return 'duran-fernandez-auto-srl';
  }

  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar tildes
    .replace(/\./g, "")             // Quitar puntos
    .replace(/[^a-z0-9]+/g, "-")    // Solo letras, números y guiones
    .replace(/^-+|-+$/g, "");
};

// Helper: generate a URL slug for a vehicle (e.g. "bmw-530e-blanco-2018")
const vehicleSlugify = (marca, modelo, color, anio) => {
  return [marca, modelo, color, anio].filter(Boolean).join(' ').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
};

const capitalize = (val) => {
  if (!val || typeof val !== 'string') return val || "-";
  return val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
};

const CURRENCY_SYMBOLS = { DOP: 'RD$', USD: 'US$', EUR: '€', COP: 'COP$' };

// Construye el link de WhatsApp del dealer. Si el dealer configuró un link
// completo (wa.me/api.whatsapp.com), se reescribe con el mensaje del vehículo;
// si es otro tipo de link (ej. invitación de grupo), se usa tal cual.
const buildWaLink = (dealerPhoneDigits, dealerLinkOverride, message) => {
  const encoded = encodeURIComponent(message);
  if (dealerLinkOverride) {
    const waMeMatch = dealerLinkOverride.match(/(?:wa\.me\/|whatsapp\.com\/send\?phone=)(\d+)/i);
    if (waMeMatch) return `https://wa.me/${waMeMatch[1]}?text=${encoded}`;
    return dealerLinkOverride;
  }
  if (dealerPhoneDigits) return `https://wa.me/${dealerPhoneDigits}?text=${encoded}`;
  return null;
};

// Etiquetas de clasificación para "Link Carbot Simple" — generadas a partir de datos reales
// del vehículo (tipo_vehiculo, tracción, combustible, motor, asientos, marca), sin inventar valores.
const PREMIUM_BRANDS = new Set(['BMW', 'MERCEDES-BENZ', 'MERCEDES BENZ', 'MERCEDES', 'AUDI', 'LEXUS', 'PORSCHE', 'LAND ROVER', 'RANGE ROVER', 'JAGUAR', 'VOLVO', 'CADILLAC', 'INFINITI', 'GENESIS', 'MASERATI', 'BENTLEY', 'TESLA']);
const ECONOMIC_HINT = /corolla|civic|sentra|elantra|versa|accent|rio|yaris|mirage|spark|picanto/;

function inferEtiquetas(v) {
  const tags = new Set();
  const tipo = normalizeText(v.tipo_vehiculo || '').trim();
  const hint = normalizeText(`${v.modelo || ''} ${v.edicion || ''}`);

  if (tipo.includes('jeepeta') || tipo.includes('suv')) {
    tags.add('suv'); tags.add('jeepeta');
  } else if (tipo.includes('camioneta') || tipo === 'pickup') {
    tags.add('pickup'); tags.add('camioneta');
  } else if (tipo.includes('automovil') || tipo.includes('sedan')) {
    tags.add('sedán');
  } else if (tipo.includes('camion') || tipo.includes('truck')) {
    tags.add('truck'); tags.add('trabajo');
  } else if (tipo.includes('bus') || tipo.includes('van')) {
    tags.add('van'); tags.add('comercial');
  } else if (/suv|jeepeta|rogue|tucson|cr-v|crv|rav4|equinox|trax|cx-5|cx5|santa fe|pilot|highlander|pathfinder|explorer|sorento|telluride|palisade/.test(hint)) {
    tags.add('suv'); tags.add('jeepeta');
  } else if (/silverado|f-150|f150|tacoma|tundra|ranger|frontier/.test(hint)) {
    tags.add('pickup'); tags.add('camioneta');
  } else if (/civic|corolla|sentra|accord|camry|altima|elantra|sonata|serie 3|serie 5|530e/.test(hint)) {
    tags.add('sedán');
  } else if (/hatchback/.test(hint)) {
    tags.add('hatchback');
  } else if (/coupe|coupé|convertible/.test(hint)) {
    tags.add('deportivo');
  }

  const traccion = normalizeText(v.traccion || '');
  if (traccion.includes('4x4') || traccion.includes('4wd')) tags.add('4x4');
  else if (traccion.includes('awd')) tags.add('awd');
  else if (traccion.includes('fwd')) tags.add('fwd');
  else if (traccion.includes('rwd')) tags.add('rwd');

  const combustible = normalizeText(v.combustible || '');
  if (combustible.includes('hibrido')) tags.add('híbrido');
  else if (combustible.includes('electrico')) tags.add('eléctrico');
  else if (combustible.includes('diesel')) tags.add('diésel');
  else if (combustible.includes('gasolina')) tags.add('gasolina');
  if (normalizeText(v.motor || '').includes('turbo')) tags.add('turbo');

  const seats = parseInt(v.asientos_num) || 0;
  const isCommercial = tags.has('comercial') || tags.has('trabajo');
  if (!isCommercial && (seats >= 3 || tags.has('suv'))) tags.add('familiar');
  if (seats >= 3) tags.add('3 filas');

  const isLujo = PREMIUM_BRANDS.has((v.marca || '').toString().trim().toUpperCase());
  if (isLujo) tags.add('lujo');

  if (!isLujo && tags.has('sedán') && (tags.has('híbrido') || ECONOMIC_HINT.test(hint))) {
    tags.add('económico'); tags.add('bajo consumo');
  }

  return Array.from(tags);
}

// 1. Función para Inteligencia Artificial (Inventario Dinámico)
exports.inventarioIA = onRequest({ cors: true }, async (req, res) => {
  try {
    // ── Friendly URL support ──
    // /inventario/:slug          → HTML document (all vehicles)
    // /inventario/:slug/bot      → JSON for GHL bot
    // /inventario/:slug/catalogo → Visual catalog (all vehicles)
    // /inventario/:slug/catalogo/:vehicleSlug → Vehicle detail page
    let dealerParam = req.query.dealerID || req.query.dealer || req.query.location_name;
    let autoJsonFormat = req.query.format === 'json';
    let autoSimpleFormat = req.query.format === 'simple';
    let autoCatalogMode = false;
    let vehicleSlugFromPath = null;
    let vehicleIdFromPath = null; // /inventario/:slug/vehiculo/:id

    const pathParts = (req.path || '').split('/').filter(Boolean);
    if (pathParts.length >= 2 && pathParts[0] === 'inventario') {
      const slug = pathParts[1];
      if (slug && slug !== 'bot' && slug !== 'catalogo') {
        dealerParam = dealerParam || slug;
      }

      // /inventario/:slug/bot → JSON (especificaciones completas)
      if (pathParts.includes('bot')) {
        autoJsonFormat = true;
      }
      // /inventario/:slug/carbot-simple → JSON liviano (piloto Duran Fernandez Auto)
      if (pathParts.includes('carbot-simple')) {
        autoSimpleFormat = true;
      }
      // /inventario/:slug/catalogo → Catalog view
      // /inventario/:slug/catalogo/:vehicleSlug → Vehicle detail (legacy slug)
      if (pathParts.includes('catalogo')) {
        autoCatalogMode = true;
        const catIdx = pathParts.indexOf('catalogo');
        if (catIdx + 1 < pathParts.length) {
          vehicleSlugFromPath = pathParts[catIdx + 1]; // e.g. "bmw-530e-blanco-2018"
        }
      }
      // /inventario/:slug/vehiculo/:id → Vehicle detail (new canonical URL)
      if (pathParts.includes('vehiculo')) {
        autoCatalogMode = true;
        const vIdx = pathParts.indexOf('vehiculo');
        vehicleIdFromPath = pathParts[vIdx + 1] || null;
      }
    }

    // Override query params for downstream use
    if (autoSimpleFormat) req.query.format = 'simple';
    else if (autoJsonFormat) req.query.format = 'json';
    if (autoCatalogMode) req.query.view = 'catalog';

    if (!dealerParam) {
      return res.status(400).json({ error: "Falta el parámetro 'dealer' o el slug en la URL" });
    }

    // Alias map: slug variations → canonical dealer ID
    const DEALER_SLUG_ALIASES = {
      'duran-fernandez-auto-srl': 'DURÁN FERNÁNDEZ AUTO S.R.L',
      'dura-n-ferna-ndez-auto-srl': 'DURÁN FERNÁNDEZ AUTO S.R.L',
    };
    if (DEALER_SLUG_ALIASES[dealerParam]) {
      dealerParam = DEALER_SLUG_ALIASES[dealerParam];
    }

    console.log(`🤖 IA Request para: ${dealerParam}`);

    // 1. Encontrar el Dealer (Búsqueda por ID, por nombre, o por SLUG)
    let matchedDealerId = null;

    // A. Buscar coincidencia exacta por ID de documento (Prioridad absoluta para dealerID)
    const dealerDoc = await db.collection("Dealers").doc(String(dealerParam).trim()).get();
    if (dealerDoc.exists) {
      matchedDealerId = dealerDoc.id;
    } else {
      // B. Búsqueda exhaustiva en la colección Dealers
      const dealersSnap = await db.collection("Dealers").get();
      dealersSnap.forEach(doc => {
        if (matchedDealerId) return; // Ya encontrado
        const data = doc.data();
        const paramLower = dealerParam.toLowerCase();

        // Coincidencia por ID (case-insensitive)
        if (doc.id.toLowerCase() === paramLower) {
          matchedDealerId = doc.id;
        }
        // Coincidencia por campo 'slug' (case-insensitive)
        else if (data.slug && data.slug.toLowerCase() === paramLower) {
          matchedDealerId = doc.id;
        }
        // Coincidencia por campo 'nombre' normalizado
        else if (data.nombre && normalizeText(data.nombre) === normalizeText(dealerParam)) {
          matchedDealerId = doc.id;
        }
        // Coincidencia por slug generado del nombre (para friendly URLs)
        else if (data.nombre && slugify(data.nombre) === paramLower) {
          matchedDealerId = doc.id;
        }
      });
    }

    // C. Fallback: buscar en Supabase por slug del nombre si Firestore no encontró nada
    if (!matchedDealerId) {
      try {
        const { data: sbDealers } = await supabase.from('dealers').select('id, nombre');
        if (sbDealers) {
          const match = sbDealers.find(d => d.nombre && slugify(d.nombre) === dealerParam.toLowerCase());
          if (match) matchedDealerId = match.id;
        }
      } catch (e) {
        console.warn("⚠️ Supabase slug lookup failed:", e.message);
      }
    }

    if (!matchedDealerId) {
      return res.status(404).json({
        error: `Dealer '${dealerParam}' no encontrado`,
        info: "Asegúrate de haber configurado tu Dealer en el panel de administración."
      });
    }

    console.log(`✅ Dealer matched: ${matchedDealerId}`);

    // Obtener datos del Dealer para el título y branding
    const dealerDocFinal = await db.collection("Dealers").doc(matchedDealerId).get();
    const dealerData = dealerDocFinal.exists ? dealerDocFinal.data() : {};
    let dealerName = dealerData.nombre || dealerData.display_name || matchedDealerId;
    const dealerLinkParam = dealerData.slug || matchedDealerId; // Reliable param for links

    // --- DEALER LOGO: Pull from Supabase dealers table ---
    let logoUrl = dealerData.logo_url || dealerData.logoUrl || "";
    let dealerPhone = (dealerData.phone || dealerData.whatsapp || "").replace(/\D/g, '');
    let dealerWaLink = (dealerData.whatsapp_link || "").trim();
    // Par de monedas + tasa de cambio manual del dealer (usados por la calculadora
    // de financiamiento pública). Si no hay tasa manual, se usa una tasa en vivo.
    let dealerCurrencyPrimary = 'DOP';
    let dealerCurrencySecondary = 'USD';
    let dealerManualRate = null;

    // 2. Obtener vehículos (Colección primaria: 'vehiculos', Fallback: 'inventario')
    let collectionName = "vehiculos";
    let inventarioSnap = await db.collection("Dealers").doc(matchedDealerId).collection(collectionName).get();

    // Si 'vehiculos' está vacío, intentar con 'inventario' (backward compatibility)
    if (inventarioSnap.empty) {
      console.log("⚠️ Colección 'vehiculos' vacía, intentando con 'inventario'...");
      collectionName = "inventario";
      inventarioSnap = await db.collection("Dealers").doc(matchedDealerId).collection(collectionName).get();
    }
    const inventory = [];

    inventarioSnap.forEach(doc => {
      const data = doc.data();
      // Filtrar solo disponibles o cotizados
      // Filtrar estricto: Solo Disponible o Cotizado
      const s = (data.status || data.estado || '').toLowerCase().trim();
      const allowed = ['available', 'disponible', 'quoted', 'cotizado'];

      if (allowed.includes(s) && !data.is_trash && !data._deleted && !data._deleted_at) {
        const precioCurrency = data.currency || (data.price_dop > 0 ? 'DOP' : 'USD');
        const inicialCurrency = data.downPaymentCurrency || (data.initial_payment_dop > 0 ? 'DOP' : precioCurrency);
        inventory.push({
          id: doc.id,
          nombre: `${data.year || ""} ${data.make || ""} ${data.model || ""} ${data.edition || ""} ${data.color || ""}`.trim().toUpperCase(),
          moneda_precio: precioCurrency,
          moneda_inicial: inicialCurrency,
          precio: (() => {
            const cur = data.currency || (data.price_dop > 0 ? 'DOP' : 'USD');
            const val = Number(data.price || data.price_dop || 0);
            const f = val.toLocaleString();
            const m = { DOP: `RD$ ${f} Pesos`, USD: `US$ ${f} Dólares`, EUR: `€ ${f} Euros`, COP: `COP$ ${f} Pesos Colombianos` };
            return m[cur] || `US$ ${f} Dólares`;
          })(),
          carfax_status: (data.clean_carfax === "Sí" || data.clean_carfax === "Si" || data.clean_carfax === true || data.carfax === "Sí" || data.carfax === "Si") ? "Sí" : (data.clean_carfax === "No" || data.carfax === "No" || data.carfax === false) ? "No" : capitalize(data.clean_carfax || data.carfax),
          mileage_formatted: `${Number(data.mileage || 0).toLocaleString()} ${(["MI", "MILLAS", "MILLA"].includes((data.mileage_unit || data.unit || "").toUpperCase())) ? "Millas" : "Km"}`,
          link_externo: data.link_externo || null,
          link_catalogo: `https://carbotsystem.com/inventario/${slugify(dealerName)}/catalogo/${vehicleSlugify(data.make, data.model, data.color, data.year)}`,
          link_catalogo_legacy: `https://inventarioia-gzhz2ynksa-uc.a.run.app/catalogo?dealerID=${matchedDealerId}&vehicleID=${doc.id}`,
          // Add color formatted for details
          color_fmt: capitalize(data.color),
          transmision_fmt: capitalize(data.transmision || data.transmission),
          traccion_fmt: (data.traccion || data.traction || data.drivetrain || "").toUpperCase() || "-",
          motor_fmt: (() => {
            const ccVal = (data.engine_cc || "").toString().trim();
            const cc = ccVal ? (ccVal.toLowerCase().includes("litro") ? ccVal : `${ccVal} Litros`) : "";
            const cylVal = (data.engine_cyl || "").toString().trim();
            const cyl = cylVal ? (cylVal.toLowerCase().includes("cilindro") ? cylVal : `${cylVal} cilindros`) : "";
            const type = (data.engine_type || "").toString().trim().toLowerCase() === "normal" ? "" : (data.engine_type || "").toString().trim().toLowerCase();
            const parts = [cc, cyl, type].filter(p => p !== "");
            if (parts.length === 0) return capitalize(data.engine || data.motor || "-");
            const res = parts.join(", ");
            return res.charAt(0).toUpperCase() + res.slice(1);
          })(),
          techo_fmt: capitalize(data.techo || data.roof_type || data.roof),
          combustible_fmt: capitalize(data.combustible || data.fuel),
          llave_fmt: capitalize(data.llave || data.key_type || data.key),
          baul_fmt: capitalize(data.baul || data.trunk || data.is_electric_trunk),
          camera_fmt: capitalize(data.camera || data.reverse_camera),
          sensores_fmt: capitalize(data.sensores || data.sensors),
          carplay_fmt: capitalize(data.carplay || data.apple_android),
          asientos_fmt: capitalize(data.asientos || data.seats),
          vidrios_fmt: capitalize(data.electric_windows || "Sí"),
          material_fmt: capitalize(data.material_interior || data.seat_material || data.interior_material),
          vin_fmt: (data.vin || data.chassis || "").toUpperCase() || "-",
          inicial_fmt: (() => {
            const initVal = Number(data.initial_payment || data.initial_payment_dop || 0);
            const initCur = data.downPaymentCurrency || data.currency || (data.price_dop > 0 ? 'DOP' : 'USD');
            if (initVal > 0) {
              const f = initVal.toLocaleString();
              const m = { DOP: `RD$ ${f} Pesos`, USD: `US$ ${f} Dólares`, EUR: `€ ${f} Euros`, COP: `COP$ ${f} Pesos Colombianos` };
              return m[initCur] || `US$ ${f} Dólares`;
            }
            const pVal = Number(data.price || data.price_dop || 0);
            const pCur = data.currency || (data.price_dop > 0 ? 'DOP' : 'USD');
            const fallback = Math.round(pVal * 0.2);
            const ff = fallback.toLocaleString();
            const mm = { DOP: `RD$ ${ff} Pesos`, USD: `US$ ${ff} Dólares`, EUR: `€ ${ff} Euros`, COP: `COP$ ${ff} Pesos Colombianos` };
            return mm[pCur] || `US$ ${ff} Dólares`;
          })(),
          inicial_num: (() => {
            const initVal = Number(data.initial_payment || data.initial_payment_dop || 0);
            if (initVal > 0) return initVal;
            return Math.round(Number(data.price || data.price_dop || 0) * 0.2);
          })(),
          // Fix: Include image for Related Vehicles section
          imagen: (data.images && data.images.length > 0) ? data.images[0] : (data.image || ""),
          has_images: (data.images && data.images.length > 0) || !!data.image,
          // Campos extra
          marca: data.make,
          modelo: data.model,
          tipo_vehiculo: data.tipo_vehiculo || data.body_style || data.tipo || '',
          edicion: data.edition || data.version,
          anio: data.year,
          anio_num: parseInt(data.year) || 0,
          color: data.color,
          transmision: data.transmission,
          traccion: data.traction || data.drivetrain,
          combustible: data.fuel,
          motor: (() => {
            const litersVal = data.engine_liters || data.engine_cc || (data.cc && Number(data.cc) < 10 ? data.cc : null);
            const liters = litersVal ? `${litersVal} L` : "";
            const cylindersVal = data.engine_cyl || data.cylinders || data.cilindros;
            const cylinders = cylindersVal ? `${cylindersVal} Cilindros` : "";
            const isTurbo = (data.engine_turbo === "SI" || data.turbo === "SI" || data.is_turbo === true || data.engine_type === "Turbo");
            const turbo = isTurbo ? "Turbo" : "Aspirado";
            const parts = [liters, cylinders, turbo].filter(Boolean);
            return parts.length > 0 ? parts.join(", ") : (data.engine || data.motor || "-");
          })(),
          destacado: !!(data.featured || data.destacado || data.is_featured),
          fotos_arr: data.images || (data.image ? [data.image] : []),
          condicion: data.condition || data.condicion || 'Usado Importado',
          carfax: data.clean_carfax || data.carfax || "-",
          asientos: data.seats || data.seatRows || "-",
          asientos_num: parseInt(data.seats || data.seatRows) || 0,
          material_interior: data.seat_material || data.interior_material || data.seatMaterial || data.interior || data.color_interior || "-",
          techo: data.roof_type || data.roof || data.sunroof || "-",
          baul: data.trunk || data.is_electric_trunk || "-",
          llave: data.key_type || data.key || data.keyType || data.llave || "-",
          camera: data.reverse_camera || data.camera || "-",
          sensores: data.sensors || data.parking_sensors || "-",
          carplay: data.apple_android || data.carplay || "-",
          electric_windows: data.electric_windows || data.cristales_electricos || "-",
          mileage: data.mileage || "0",
          unit: data.unit || data.mileageUnit || data.mileage_unit || "KM",
          vin: data.vin || data.chassis,
          // Calculado con lógica desacoplada
          inicial_calculado: (() => {
            const dpVal = data.initial_payment_dop > 0 ? data.initial_payment_dop : (data.initial_payment || 0);
            if (!dpVal) return 'N/A';

            // Detectar moneda específica del inicial
            const dpCurrency = data.downPaymentCurrency || (data.initial_payment_dop > 0 ? 'DOP' : 'USD');
            const currMap = { DOP: ['RD$', 'Pesos'], USD: ['US$', 'Dólares'], EUR: ['€', 'Euros'], COP: ['COP$', 'Pesos Colombianos'] };
            const [simbolo, nombre] = currMap[dpCurrency] || currMap['USD'];

            return `${simbolo} ${Number(dpVal).toLocaleString()} ${nombre}`;
          })(),
          precio_num: data.price_dop > 0 ? Number(data.price_dop) : Number(data.price || 0),
          precio_dop_ref: data.price_dop > 0 ? Number(data.price_dop) : (Number(data.price || 0) * 60)
        });
      }
    });

    console.log(`✅ ${inventory.length} vehículos encontrados en Firestore para ${matchedDealerId} en ${collectionName}`);

    // --- INTEGRACIÓN SUPABASE ---
    // The original code had a nested try-catch here.
    // To "fix the double try block" while maintaining the non-critical nature of Supabase,
    // we'll keep the Supabase logic within a single try-catch block that logs errors
    // but allows the rest of the function to proceed.
    // This ensures that Supabase issues don't halt the entire inventory retrieval.
    const dealerUuid = dealerData.supabaseDealerId || toUuid(matchedDealerId);

    if (dealerUuid) {
      try {
        // Fetch dealer info from Supabase (logo + nombre + whatsapp fallback)
        const { data: sbDealer } = await supabase.from('dealers').select('logo_url, nombre, phone, whatsapp_link, moneda_principal, moneda_secundaria, tasa_cambio_manual, tasa_auto_diaria').eq('id', dealerUuid).single();
        if (sbDealer) {
          if (!logoUrl && sbDealer.logo_url) logoUrl = sbDealer.logo_url;
          if (!dealerPhone && sbDealer.phone) dealerPhone = String(sbDealer.phone).replace(/\D/g, '');
          if (!dealerWaLink && sbDealer.whatsapp_link) dealerWaLink = String(sbDealer.whatsapp_link).trim();
          // Usar nombre de Supabase si Firestore tiene un nombre genérico o es el ID crudo
          if (sbDealer.nombre && (!dealerName || dealerName === matchedDealerId || dealerName.toLowerCase() === 'mi dealer' || dealerName.toLowerCase() === 'dealer')) {
            dealerName = sbDealer.nombre;
          }
          dealerCurrencyPrimary = sbDealer.moneda_principal || dealerCurrencyPrimary;
          dealerCurrencySecondary = sbDealer.moneda_secundaria || dealerCurrencySecondary;
          // Con la tasa automática diaria activada, la tasa fija se ignora.
          dealerManualRate = (sbDealer.tasa_auto_diaria !== true && sbDealer.tasa_cambio_manual > 0)
            ? Number(sbDealer.tasa_cambio_manual)
            : null;
        }
        console.log(`📡 Consultando Supabase para Dealer UUID: ${dealerUuid}`);
        const { data: supabaseVehicles, error: sbError } = await supabase
          .from('vehiculos')
          .select('*')
          .eq('dealer_id', dealerUuid);

        if (sbError) {
          console.error("❌ Error consultando Supabase:", sbError);
        } else if (supabaseVehicles && supabaseVehicles.length > 0) {
          console.log(`✅ ${supabaseVehicles.length} vehículos encontrados en Supabase`);

          supabaseVehicles.forEach(v => {
            // Mapeo idéntico al de App.jsx para consistencia con las nuevas DB columns
            const yearFromTitle = v.anio || v.detalles?.year || v.detalles?.anio || v.titulo_vehiculo?.split(' ')[0] || '';
            const makeFromTitle = v.marca || v.detalles?.make || v.detalles?.marca || v.titulo_vehiculo?.split(' ')[1] || 'N/A';
            const modelFromTitle = v.modelo || v.detalles?.model || v.detalles?.modelo || v.titulo_vehiculo?.split(' ').slice(2).join(' ') || 'N/A';
            const editionVal = v.edicion || v.detalles?.edition || v.detalles?.edicion || '';

            // Monedas
            const currency = v.moneda_precio || v.detalles?.currency || 'USD';
            const downPaymentCurrency = v.moneda_inicial || v.detalles?.downPaymentCurrency || 'USD';
            const priceVal = parseFloat(v.precio || (currency === 'DOP' ? (v.detalles?.price_dop || v.detalles?.price) : v.detalles?.price) || 0);
            const initialVal = parseFloat(v.inicial || (downPaymentCurrency === 'DOP' ? (v.detalles?.initial_payment_dop || v.detalles?.initial_payment) : v.detalles?.initial_payment) || 0);

            // Determinar precios formateados (soporta DOP, USD, EUR, COP)
            const fmtCurrMap = { DOP: ['RD$', 'Pesos'], USD: ['US$', 'Dólares'], EUR: ['€', 'Euros'], COP: ['COP$', 'Pesos Colombianos'] };
            const fmtC = (val, cur) => {
              const [sym, name] = fmtCurrMap[cur] || fmtCurrMap['USD'];
              return `${sym} ${val.toLocaleString()} ${name}`;
            };
            const priceFormatted = fmtC(priceVal, currency);
            const initialFormatted = fmtC(initialVal, downPaymentCurrency);

            // Status similar a Firestore (disponible, cotizado)
            const s = (v.estado || '').toLowerCase().trim();
            const allowed = ['available', 'disponible', 'quoted', 'cotizado'];

            if (allowed.includes(s) && !v.deleted_at && !v.is_trash && !v.detalles?._deleted && !v.detalles?._deleted_at && !v.detalles?.is_trash) {
              const isTurbo = (v.detalles?.engine_turbo === "SI" || v.detalles?.turbo === "SI" || v.detalles?.is_turbo === true || v.detalles?.engine_type === "Turbo");
              const turboStr = isTurbo ? "Turbo" : "Aspirado";

              inventory.push({
                id: v.id,
                is_supabase: true,
                nombre: `${yearFromTitle} ${makeFromTitle} ${modelFromTitle} ${editionVal} ${(v.color || v.detalles?.color || v.detalles?.exteriorColor || "")}`.trim().toUpperCase(),
                moneda_precio: currency,
                moneda_inicial: downPaymentCurrency,
                precio: priceFormatted,
                // Carfax: only show "Clean Carfax" if Sí, otherwise empty
                carfax_status: (v.condicion_carfax === "Sí" || v.condicion_carfax === "Si" || v.condicion_carfax === true || v.detalles?.clean_carfax === "Sí" || v.detalles?.clean_carfax === "Si") ? "Clean Carfax" : "",
                mileage_formatted: `${Number(v.millas || v.detalles?.mileage || 0).toLocaleString()} ${(["MI", "MILLAS", "MILLA"].includes((v.detalles?.mileage_unit || v.detalles?.unit || "").toUpperCase())) ? "Millas" : "Km"}`,
                link_externo: v.link_externo || v.detalles?.link_externo || null,
                link_catalogo: `https://carbotsystem.com/inventario/${slugify(dealerName)}/catalogo/${vehicleSlugify(makeFromTitle, modelFromTitle, v.color || v.detalles?.color || '', yearFromTitle)}`,
                link_catalogo_legacy: `https://inventarioia-gzhz2ynksa-uc.a.run.app/catalogo?dealerID=${matchedDealerId}&vehicleID=${v.id}&source=supabase`,

                // Visual Details (fmt) — fallback to detalles when top-level is null
                color_fmt: capitalize(v.color || v.detalles?.color || v.detalles?.exteriorColor),
                transmision_fmt: capitalize(v.transmision || v.detalles?.transmission),
                traccion_fmt: (v.traccion || v.detalles?.traction || v.detalles?.drivetrain || "").toUpperCase() || "-",
                motor_fmt: (() => {
                  const ccVal = (v.detalles?.engine_cc || "").toString().trim();
                  const cc = ccVal ? `${ccVal}.0 Litros` : "";
                  const cylVal = (v.detalles?.engine_cyl || "").toString().trim();
                  const cyl = cylVal ? `${cylVal} Cilindros` : "";
                  const engineType = (v.detalles?.engine_type || "").toString().trim();
                  let turboLabel = "";
                  if (v.detalles?.engine_turbo === "SI" || v.detalles?.turbo === "SI" || v.detalles?.is_turbo === true || engineType === "Turbo") {
                    turboLabel = "Turbo";
                  } else if (engineType && engineType !== "Normal") {
                    turboLabel = engineType;
                  }
                  const parts = [cc, cyl, turboLabel].filter(p => p !== "");
                  if (parts.length === 0) return capitalize(v.motor || v.detalles?.engine || "-");
                  return parts.join(", ");
                })(),
                techo_fmt: capitalize(v.techo || v.detalles?.roof_type || v.detalles?.roof || "-"),
                combustible_fmt: capitalize(v.combustible || v.detalles?.fuel || "-"),
                llave_fmt: capitalize(v.llave || v.detalles?.key_type || "-"),
                baul_fmt: (v.baul_electrico === true || v.detalles?.trunk === "Sí" || v.detalles?.trunk === "Si" || v.detalles?.baul === "Sí") ? "Sí" : 
                          (v.detalles?.trunk === "No" || v.detalles?.baul === "No" || v.detalles?.baul_electrico === "No") ? "No" : "-",
                camera_fmt: capitalize(v.camara || v.detalles?.camera || "-"),
                sensores_fmt: (v.sensores === true || v.detalles?.sensors === "Sí" || v.detalles?.sensors === "Si" || v.detalles?.sensores === "Sí") ? "Sí" : 
                              (v.detalles?.sensors === "No" || v.detalles?.sensores === "No") ? "No" : "-",
                carplay_fmt: (v.carplay === true || v.detalles?.carplay === "Sí" || v.detalles?.carplay === "Si" || v.detalles?.appleCarplay === "Sí") ? "Sí" : 
                             (v.detalles?.carplay === "No" || v.detalles?.appleCarplay === "No" || v.detalles?.apple_android === "No") ? "No" : "-",
                asientos_fmt: (() => {
                  const n = parseInt(v.cantidad_asientos || v.detalles?.seats || 0);
                  return n > 0 ? `${n} Filas de Asientos` : "-";
                })(),
                vidrios_fmt: (v.vidrios_electricos === true || v.detalles?.electric_windows === "Sí" || v.detalles?.electric_windows === "Si" || v.detalles?.vidrios === "Sí") ? "Sí" : 
                             (v.detalles?.electric_windows === "No" || v.detalles?.vidrios === "No" || v.detalles?.vidrios_electricos === "No") ? "No" : "-",
                material_fmt: capitalize(v.material_asientos || v.detalles?.seat_material),
                vin_fmt: (v.chasis_vin || v.detalles?.vin || "").toUpperCase() || "-",
                inicial_fmt: initialFormatted,
                inicial_num: initialVal,

                // Metadata & Template compatibility
                imagen: (v.fotos && v.fotos.length > 0) ? v.fotos[0] : "",
                has_images: (v.fotos && v.fotos.length > 0),
                marca: makeFromTitle,
                modelo: modelFromTitle,
                edicion: editionVal || v.detalles?.version || "-",
                tipo_vehiculo: v.tipo_vehiculo || v.detalles?.tipo_vehiculo || v.detalles?.body_style || '',
                anio: yearFromTitle,
                anio_num: parseInt(yearFromTitle) || 0,
                color: v.color || v.detalles?.color || v.detalles?.exteriorColor,
                transmision: v.transmision || v.detalles?.transmission || v.detalles?.transmision,
                traccion: v.traccion || v.detalles?.traction || v.detalles?.drivetrain || v.detalles?.traccion,
                combustible: v.combustible || v.detalles?.fuel || v.detalles?.combustible,
                motor: (() => {
                  const ccVal = (v.detalles?.engine_cc || "").toString().trim();
                  const cc = ccVal ? `${ccVal}.0 Litros` : "";
                  const cylVal = (v.detalles?.engine_cyl || "").toString().trim();
                  const cyl = cylVal ? `${cylVal} Cilindros` : "";
                  const engineType = (v.detalles?.engine_type || "").toString().trim();
                  let turboLabel = "";
                  if (v.detalles?.engine_turbo === "SI" || v.detalles?.turbo === "SI" || v.detalles?.is_turbo === true || engineType === "Turbo") {
                    turboLabel = "Turbo";
                  } else if (engineType && engineType !== "Normal") {
                    turboLabel = engineType;
                  }
                  return [cc, cyl, turboLabel].filter(Boolean).join(", ") || (v.motor || "-");
                })(),
                destacado: !!(v.featured || v.destacado || v.detalles?.featured),
                fotos_arr: (v.fotos && v.fotos.length > 0) ? v.fotos : [],
                condicion: v.detalles?.condition || v.condicion || 'Usado Importado',
                carfax: (v.condicion_carfax === "Sí" || v.condicion_carfax === "Si" || v.condicion_carfax === true || v.detalles?.clean_carfax === "Sí" || v.detalles?.clean_carfax === "Si") ? "Clean Carfax" : "",
                asientos: (() => {
                  const n = parseInt(v.cantidad_asientos || v.detalles?.seats || 0);
                  return n > 0 ? `${n} Filas de Asientos` : "-";
                })(),
                asientos_num: parseInt(v.cantidad_asientos || v.detalles?.seats) || 0,
                material_interior: v.material_asientos || v.detalles?.seat_material || "-",
                techo: v.techo || v.detalles?.roof_type || v.detalles?.roof || "-",
                baul: (v.baul_electrico === true || v.detalles?.trunk === "Sí" || v.detalles?.trunk === "Si" || v.detalles?.baul === "Sí") ? "Sí" : 
                      (v.detalles?.trunk === "No" || v.detalles?.baul === "No" || v.detalles?.baul_electrico === "No") ? "No" : "-",
                llave: v.llave || v.detalles?.key_type || "-",
                camera: v.camara || v.detalles?.camera || "-",
                sensores: (v.sensores === true || v.detalles?.sensors === "Sí" || v.detalles?.sensors === "Si" || v.detalles?.sensores === "Sí") ? "Sí" : 
                          (v.detalles?.sensors === "No" || v.detalles?.sensores === "No") ? "No" : "-",
                carplay: (v.carplay === true || v.detalles?.carplay === "Sí" || v.detalles?.carplay === "Si" || v.detalles?.appleCarplay === "Sí") ? "Sí" : 
                         (v.detalles?.carplay === "No" || v.detalles?.appleCarplay === "No" || v.detalles?.apple_android === "No") ? "No" : "-",
                electric_windows: (v.vidrios_electricos === true || v.detalles?.electric_windows === "Sí" || v.detalles?.electric_windows === "Si" || v.detalles?.vidrios === "Sí") ? "Sí" : 
                                  (v.detalles?.electric_windows === "No" || v.detalles?.vidrios === "No" || v.detalles?.vidrios_electricos === "No") ? "No" : "-",
                mileage: v.millas || v.detalles?.mileage || "0",
                unit: (["MI", "MILLAS", "MILLA"].includes((v.detalles?.mileage_unit || v.detalles?.unit || "").toUpperCase())) ? "Millas" : "Km",
                vin: v.chasis_vin || v.detalles?.vin,
                inicial_calculado: initialFormatted,
                precio_num: priceVal,
                precio_dop_ref: (currency === 'USD' ? priceVal * 60 : priceVal)
              });
            }
          });
        }
      } catch (sbErr) {
        console.error("❌ Fallo crítico de Supabase en inventarioIA:", sbErr);
      }
    }

    // Quita null/undefined/"-"/"N/A"/"0" inválido para no confundir al bot con campos vacíos.
    const stripEmptyFields = (raw) => {
      const clean = {};
      Object.entries(raw).forEach(([k, val]) => {
        if (val === null || val === undefined) return;
        const s = String(val).trim();
        if (!s || s === '-' || s.toUpperCase() === 'N/A' || s === '0') return;
        clean[k] = val;
      });
      return clean;
    };

    const fotosLine = (v) => v.link_externo
      ? `Aqui puedes ver las fotos y detalles del carro: ${v.link_externo}`
      : (v.has_images && v.link_catalogo ? `Aqui puedes ver las fotos y detalles del carro: ${v.link_catalogo}` : "No tengo las fotos en este momento, un compañero te ayudará");

    // ── FORMAT=SIMPLE: "Link Carbot Simple" — JSON puro, solo datos básicos + etiquetas
    // (sin HTML, sin vista visual) ──
    if (req.query.format === 'simple') {
      const sortedForJson = [...inventory].sort((a, b) => (a.marca || "").localeCompare(b.marca || ""));
      const vehiculos = sortedForJson.map(v => {
        const clean = stripEmptyFields({
          marca: v.marca,
          modelo: v.modelo,
          año: v.anio_num,
          edicion: v.edicion,
          color: v.color_fmt,
          precio: (v.precio_num > 0) ? v.precio : null,
          inicial: (v.inicial_num > 0) ? v.inicial_fmt : null,
        });
        const etiquetas = inferEtiquetas(v);
        if (etiquetas.length > 0) clean.etiquetas = etiquetas;
        return clean;
      });

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      return res.status(200).json({
        dealer: dealerName,
        total: vehiculos.length,
        vehiculos
      });
    }

    // ── FORMAT=JSON: "Bot Carbot" (especificaciones completas) para GHL Bot / Knowledge Base ──
    if (req.query.format === 'json') {
      const dealerSlugForLinks = slugify(dealerName);
      const catalogoUrl = `https://carbotsystem.com/inventario/${dealerSlugForLinks}/catalogo`;
      const sortedForJson = [...inventory].sort((a, b) => (a.marca || "").localeCompare(b.marca || ""));

      // Sin chasis/VIN, sin campos vacíos/N/A/0 inválido.
      const flatInventory = sortedForJson.map(v => {
        const clean = stripEmptyFields({
          marca: v.marca,
          modelo: v.modelo,
          edicion: v.edicion,
          año: v.anio_num,
          color: v.color_fmt,
          precio: v.precio,
          inicial: v.inicial_fmt,
          millaje: v.mileage_formatted,
          transmision: v.transmision_fmt,
          traccion: v.traccion_fmt,
          motor: v.motor_fmt,
          combustible: v.combustible_fmt,
          carfax: v.carfax_status,
          techo: v.techo_fmt,
          llave: v.llave_fmt,
          baul_electrico: v.baul_fmt,
          camara: v.camera_fmt,
          sensores: v.sensores_fmt,
          carplay: v.carplay_fmt,
          asientos: v.asientos_fmt,
          vidrios_electricos: v.vidrios_fmt,
          material_interior: v.material_fmt,
        });
        clean["FOTOS Y DETALLES:"] = fotosLine(v);
        clean.estado = "Disponible";
        return clean;
      });

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      return res.status(200).json({
        dealer: dealerName,
        total: flatInventory.length,
        link_catalogo: `Mira este es nuestro catalogo actual, puedes ver y decirme cual te interesa: ${catalogoUrl}`,
        vehiculos: flatInventory
      });
    }

    // 3. Formatear respuesta (JSON por defecto, HTML opcional)
    const isCatalogPath = req.path === '/catalogo' || req.query.view === 'catalog';
    const viewMode = isCatalogPath || req.query.view === 'human' || !req.headers.accept?.includes('application/json');
    let vehicleId = req.query.vehicleID || vehicleIdFromPath;
    // Resolve vehicleSlug from friendly URL path to actual vehicleId
    if (!vehicleId && vehicleSlugFromPath && inventory.length > 0) {
      const matchedVehicle = inventory.find(v => {
        const vSlug = vehicleSlugify(v.marca, v.modelo, v.color_fmt, v.anio_num);
        return vSlug === vehicleSlugFromPath;
      });
      if (matchedVehicle) vehicleId = matchedVehicle.id;
    }

    // --- HELPERS PARA SMART RELATED ---
    const TASA_CAMBIO = 60;
    const getPrecioEnPesos = (precio, moneda) => {
      if (!precio) return 0;
      // Normalizar input a string para checkear moneda si viene "US$ 20,000"
      // Aqui asumimos que el objeto ya viene limpio, pero por si acaso.
      const p = parseFloat(precio);
      if (isNaN(p)) return 0;

      if (moneda === 'USD' || moneda === 'US$') {
        return p * TASA_CAMBIO;
      }
      return p;
    };

    if (viewMode) {
      // El catálogo público renderiza TODO con sus propios templates HTML.
      // El detalle de vehículos usa el template de abajo (vehicleId check).

      if (!isCatalogPath) {
        // --- MODO DOCUMENTO (BASE LINK - ALL IN ONE PAGE) ---
        // Sort inventory by brand alphabetically
        const sortedInventory = [...inventory].sort((a, b) => (a.marca || "").localeCompare(b.marca || ""));

        return res.send(`
          <!DOCTYPE html>
          <html lang="es">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Inventario | ${dealerName}</title>
            <style>
              body { font-family: "Segoe UI", Arial, sans-serif; background: white; margin: 0; padding: 20px 40px; color: #000; line-height: 1.4; }
              .container { max-width: 900px; margin: 0; }
              
              .report-header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 30px; }
              .report-header h1 { margin: 0; font-size: 1.6rem; font-weight: bold; text-transform: uppercase; }
              .report-header p { margin: 5px 0 0; font-size: 0.9rem; font-weight: normal; color: #666; }
              
              .brand-title { font-size: 1.3rem; font-weight: bold; text-transform: uppercase; margin: 40px 0 15px; border-bottom: 1px solid #000; padding-bottom: 5px; }
              
              .vehicle-entry { margin-bottom: 40px; }
              .vehicle-title { font-size: 1.1rem; font-weight: bold; margin: 0 0 10px 0; text-transform: uppercase; }
              
              .spec-table { width: 100%; border-collapse: collapse; font-size: 0.95rem; margin-bottom: 15px; }
              .spec-table td { padding: 4px 0; vertical-align: top; }
              .label { font-weight: bold; width: 180px; padding-right: 10px; }
              .value { font-weight: normal; }
              .price-val { font-weight: bold; color: #333; }
              
              .link-section { margin-top: 15px; font-size: 0.9rem; border-top: 1px dotted #ccc; padding-top: 10px; }
              .link-url { color: #0000EE; text-decoration: underline; word-break: break-all; }
              .no-photos-msg { color: #666; font-style: italic; font-size: 0.9rem; margin-bottom: 15px; }
              
              .separator { border: 0; border-top: 1px solid #eee; margin: 40px 0; }
              .footer-tag { text-align: center; margin-top: 60px; font-size: 0.8rem; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="report-header">
                <h1>${dealerName}</h1>
                <p>${inventory.length} VEHÍCULOS DISPONIBLES</p>
              </div>
              
              ${sortedInventory.map((v, idx) => {
          const showBrand = idx === 0 || sortedInventory[idx - 1].marca !== v.marca;
          const isLast = idx === sortedInventory.length - 1;
          const nextSameBrand = !isLast && sortedInventory[idx + 1].marca === v.marca;

          return `
                  ${showBrand ? `<div class="brand-title">${v.marca || 'VARIOS'}</div>` : ''}
                  
                  <div class="vehicle-entry" id="${v.id}">
                    <h2 class="vehicle-title">${v.nombre}</h2>
                    
                    ${!v.has_images ? `<p class="no-photos-msg">No tengo las fotos en este momento, un compañero te ayudará</p>` : ''}
                    
                    <table class="spec-table">
                      <tr><td class="label">COLOR:</td><td class="value">${v.color_fmt}</td></tr>
                      <tr><td class="label">CARFAX:</td><td class="value">${v.carfax_status}</td></tr>
                      <tr><td class="label">CHASIS:</td><td class="value">${v.vin_fmt}</td></tr>
                      <tr><td class="label">PRECIO:</td><td class="value price-val">${v.precio}</td></tr>
                      <tr><td class="label">INICIAL:</td><td class="value">${v.inicial_fmt}</td></tr>
                      <tr><td class="label">MILLAS:</td><td class="value">${v.mileage_formatted}</td></tr>
                      <tr><td class="label">TRACCIÓN:</td><td class="value">${v.traccion_fmt}</td></tr>
                      <tr><td class="label">TRANSMISIÓN:</td><td class="value">${v.transmision_fmt}</td></tr>
                      <tr><td class="label">MOTOR:</td><td class="value">${v.motor_fmt}</td></tr>
                      <tr><td class="label">TECHO:</td><td class="value">${v.techo_fmt}</td></tr>
                      <tr><td class="label">COMBUSTIBLE:</td><td class="value">${v.combustible_fmt}</td></tr>
                      <tr><td class="label">LLAVE:</td><td class="value">${v.llave_fmt}</td></tr>
                      <tr><td class="label">BAÚL ELÉCTRICO:</td><td class="value">${v.baul_fmt}</td></tr>
                      <tr><td class="label">CÁMARA:</td><td class="value">${v.camera_fmt}</td></tr>
                      <tr><td class="label">SENSORES:</td><td class="value">${v.sensores_fmt}</td></tr>
                      <tr><td class="label">CARPLAY:</td><td class="value">${v.carplay_fmt}</td></tr>
                      <tr><td class="label">ASIENTOS:</td><td class="value">${v.asientos_fmt}</td></tr>
                      <tr><td class="label">VIDRIOS ELÉCTRICOS:</td><td class="value">${v.vidrios_fmt}</td></tr>
                      <tr><td class="label">MATERIAL DE ASIENTOS:</td><td class="value">${v.material_fmt}</td></tr>
                    </table>

                    ${(v.link_externo || v.has_images) ? `
                      <div class="link-section">
                        <strong>VER FOTOS Y DETALLES:</strong><br/>
                        <a href="${v.link_externo || v.link_catalogo}" class="link-url">${v.link_externo || v.link_catalogo}</a>
                      </div>
                    ` : ''}
                  </div>
                  
                  ${nextSameBrand ? `<hr class="separator" />` : ''}
                `;
        }).join('')}
              
              <div class="footer-tag">
                <strong>LINK DE CATALOGO:</strong><br/>
                <a href="https://inventarioia-gzhz2ynksa-uc.a.run.app/catalogo?dealerID=${encodeURIComponent(matchedDealerId)}" class="link-url">https://inventarioia-gzhz2ynksa-uc.a.run.app/catalogo?dealerID=${encodeURIComponent(matchedDealerId)}</a>
              </div>

              <div class="footer-tag">Documento Generado por CarBot System</div>
            </div>
          </body>
          </html>
        `);
      }

      if (vehicleId) {
        console.log(`🔍 [inventarioIA] MODO DETALLE para vehículo: ${vehicleId}`);
        // --- MODO DETALLE ---
        const v = inventory.find(item => String(item.id) === String(vehicleId));
        if (!v) {
          console.log(`❌ [inventarioIA] Vehículo no encontrado en inventory`);
          return res.status(404).send("Vehículo no encontrado");
        }

        let raw = {};
        if (v.is_supabase) {
          // Fetch raw from Supabase
          const { data, error } = await supabase.from('vehiculos').select('*').eq('id', vehicleId).single();
          if (!error && data) {
            const makeFromTitle = data.detalles?.make || data.titulo_vehiculo?.split(' ')[1] || 'N/A';
            const modelFromTitle = data.detalles?.model || data.titulo_vehiculo?.split(' ').slice(2).join(' ') || 'N/A';
            const yearFromTitle = data.detalles?.year || data.titulo_vehiculo?.split(' ')[0] || '';

            raw = {
              ...data,
              ...data.detalles,
              make: makeFromTitle,
              model: modelFromTitle,
              year: yearFromTitle,
              images: data.fotos,
              image: data.fotos && data.fotos.length > 0 ? data.fotos[0] : null,
              price: data.precio,
              initial_payment: data.inicial,
              currency: data.detalles?.currency || 'USD',
              body_type: data.detalles?.body_type || data.tipo
            };
          }
        } else {
          // Fetch raw from Firestore
          const vDoc = await db.collection("Dealers").doc(matchedDealerId).collection(collectionName).doc(vehicleId).get();
          raw = vDoc.exists ? vDoc.data() : {};
        }

        // Galería de fotos (carrete)
        const photos = raw.images || (raw.image ? [raw.image] : []);

        // --- SMART RELATED LOGIC ---
        const precioBase = getPrecioEnPesos(raw.price || raw.precio || 0, raw.currency);
        // data.body_type suele venir en inglés o español, normalizamos
        const tipoBase = (raw.body_type || raw.type || raw.tipo || '').split(' ')[0].toLowerCase();
        const asientosBase = parseInt(raw.seats || raw.seatRows || raw.cantidad_asientos || 0);

        const related = inventory.filter(item => {
          // 1. No incluir el mismo carro
          if (String(item.id) === String(vehicleId)) return false;

          // --- FILTRO DE PRECIO (Regla de los 200k) ---
          // item.precio_dop_ref ya viene calculado en el map
          const precioItem = item.precio_dop_ref || 0;
          const diferencia = Math.abs(precioBase - precioItem);
          const estaEnRango = diferencia <= 200000;

          // --- FILTRO DE TIPO ---
          // item.tipo viene del map como "Jeepeta", "Sedan", etc.
          const tipoItem = (item.tipo || '').split(' ')[0].toLowerCase();
          // Comparacion laxa de tipo (ej: "Jeepeta" vs "SUV" podria fallar si no normalizamos más, pero esto cumple lo pedido)
          const esMismoTipo = tipoItem && tipoBase && (tipoItem === tipoBase);

          // item.asientos_num viene del map
          const asientosItem = item.asientos_num || 0;
          const mismosAsientos = asientosBase > 0 && asientosItem > 0 && (asientosItem === asientosBase);

          // REGLA FINAL: Rango Y (Tipo O Asientos)
          return estaEnRango && (esMismoTipo || mismosAsientos);
        }).slice(0, 4);

        const capitalize = (str) => {
          if (!str || typeof str !== 'string') return '-';
          return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
        };

        const catalogUrl = `https://carbotsystem.com/inventario/${slugify(dealerName)}/catalogo`;
        const vehicleDetailCanonical = `https://carbotsystem.com/inventario/${slugify(dealerName)}/vehiculo/${vehicleId}`;
        const vehicleOgImage = photos.length > 0 ? photos[0] : (logoUrl || '');
        const vehicleOgTitle = `${v.anio || ''} ${v.marca || ''} ${v.modelo || ''} ${v.edicion || ''} | ${dealerName}`.trim();
        const vehicleOgDesc = `${v.precio || ''} • Inicial: ${v.inicial_calculado || 'Consultar'} • ${v.mileage_formatted || ''} • ${dealerName}`;

        // Imported vs local logic
        const condicionLower = (v.condicion || '').toLowerCase();
        const isImported = condicionLower.includes('import') || condicionLower.includes('nuevo') || condicionLower === 'recien importado';
        const isLocal = condicionLower.includes('local');
        const hasCleanCarfax = v.carfax === 'Clean Carfax' || v.carfax_status === 'Sí' || v.carfax_status === 'Si';

        // WhatsApp button
        const waMessageDetail = `Hola, me interesa esta ${[v.anio, v.marca, v.modelo, (v.edicion && v.edicion !== '-') ? v.edicion : '', v.color_fmt || v.color || ''].filter(Boolean).join(' ')}`.replace(/\s+/g, ' ').trim() + `\n${vehicleDetailCanonical}`;
        const waLinkDetail = buildWaLink(dealerPhone, dealerWaLink, waMessageDetail);

        // --- FINANCIAMIENTO: bancos reales configurados por el dealer ---
        let financingBanks = [];
        if (dealerUuid) {
          try {
            const { data: banksData, error: banksErr } = await supabase
              .from('dealer_financing_banks')
              .select('banco, tasa_anual, max_financiamiento_pct, plazo_maximo_meses')
              .eq('dealer_id', dealerUuid)
              .eq('activo', true)
              .order('orden', { ascending: true });
            if (banksErr) console.error('❌ Error consultando bancos de financiamiento:', banksErr);
            financingBanks = banksData || [];
          } catch (bankErr) {
            console.error('❌ Fallo consultando bancos de financiamiento:', bankErr);
          }
        }
        const precioNativeVal = v.precio_num || 0;
        const precioCurrencyCode = v.moneda_precio || 'USD';
        const inicialNativeVal = (v.inicial_num > 0) ? v.inicial_num : Math.round(precioNativeVal * 0.2);
        const inicialCurrencyCode = v.moneda_inicial || precioCurrencyCode;

        // "≈ [otra moneda]" chiquito bajo precio e inicial en la ficha del vehículo.
        // Tasa manual del dealer si la configuró; si no, una sola llamada en vivo.
        // Todas las monedas se anclan a la PRINCIPAL del dealer:
        // detailRates[X] = cuántas unidades de la principal vale 1 de X. Así un
        // precio en una moneda fuera del par configurado también convierte.
        // Misma semántica que ratesToPrimary en src/utils/exchangeRate.js.
        const detailRates = { [dealerCurrencyPrimary]: 1 };
        const inPair = (c) => c === dealerCurrencyPrimary || c === dealerCurrencySecondary;
        const needsLiveRates = !(dealerManualRate > 0) || !inPair(precioCurrencyCode) || !inPair(inicialCurrencyCode);
        if (needsLiveRates) try {
          // Misma fuente que el panel: DOP = promedio de venta de bancos RD.
          const rateRes = await fetch(`${SUPABASE_URL}/functions/v1/exchange-rate`);
          const rateData = await rateRes.json();
          const perUsd = rateData?.perUsd;
          if (perUsd?.[dealerCurrencyPrimary] > 0) {
            for (const code of Object.keys(CURRENCY_SYMBOLS)) {
              if (perUsd[code] > 0) detailRates[code] = perUsd[dealerCurrencyPrimary] / perUsd[code];
            }
          }
        } catch (e) { /* sin red: queda la tasa manual y el respaldo de abajo */ }
        // La tasa manual del dealer manda sobre su moneda secundaria; el resto
        // de monedas se quedan con la tasa en vivo.
        if (dealerManualRate > 0 && dealerCurrencySecondary !== dealerCurrencyPrimary) {
          detailRates[dealerCurrencySecondary] = Number(dealerManualRate);
        }
        detailRates[dealerCurrencyPrimary] = 1;
        if (!(detailRates[dealerCurrencySecondary] > 0) && dealerCurrencySecondary !== dealerCurrencyPrimary) {
          detailRates[dealerCurrencySecondary] = 60;
        }

        const convertToOtherCurrency = (amountNative, fromCur) => {
          if (!(amountNative > 0) || dealerCurrencyPrimary === dealerCurrencySecondary) return '';
          // Se muestra en la otra moneda del par; si el precio viene en una
          // tercera moneda, se muestra en la principal.
          const toCur = fromCur === dealerCurrencyPrimary ? dealerCurrencySecondary : dealerCurrencyPrimary;
          const from = detailRates[fromCur], to = detailRates[toCur];
          if (!(from > 0) || !(to > 0) || fromCur === toCur) return '';
          const converted = (amountNative * from) / to;
          return `${CURRENCY_SYMBOLS[toCur] || toCur} ${Math.round(converted).toLocaleString('en-US')}`;
        };
        const precioAltDisplay = convertToOtherCurrency(precioNativeVal, precioCurrencyCode);
        const inicialAltDisplay = (v.inicial_calculado && v.inicial_calculado !== 'N/A') ? convertToOtherCurrency(inicialNativeVal, inicialCurrencyCode) : '';
        const finBanksJson = JSON.stringify(financingBanks.map(b => ({
          banco: b.banco,
          tasa_anual: Number(b.tasa_anual),
          max_financiamiento_pct: Number(b.max_financiamiento_pct),
          plazo_maximo_meses: Number(b.plazo_maximo_meses)
        })));

        // "Cuotas desde": mejor cuota mensual entre los bancos del dealer, usando
        // el precio/inicial reales y un plazo de 4 años (o el máximo del banco si es menor).
        let cuotaDesdeText = null;
        if (financingBanks.length > 0) {
          const montoBase = Math.max(precioNativeVal - inicialNativeVal, 0);
          const calcMonthlyPayment = (principal, annualRatePct, months) => {
            const r = (annualRatePct / 100) / 12;
            return r > 0 ? (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1) : (principal / months);
          };
          const bestCuota = financingBanks.reduce((min, b) => {
            const term = Math.min(48, Number(b.plazo_maximo_meses) || 48);
            const cuota = calcMonthlyPayment(montoBase, Number(b.tasa_anual), term);
            return cuota < min ? cuota : min;
          }, Infinity);
          if (isFinite(bestCuota) && bestCuota > 0) {
            const symbol = precioCurrencyCode === 'DOP' ? 'RD$' : 'US$';
            cuotaDesdeText = `${symbol} ${Math.round(bestCuota).toLocaleString()}`;
          }
        }

        let html = `
          <!DOCTYPE html>
          <html lang="es">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${vehicleOgTitle}</title>
            <!-- Open Graph -->
            <meta property="og:type" content="product">
            <meta property="og:url" content="${vehicleDetailCanonical}">
            <meta property="og:title" content="${vehicleOgTitle}">
            <meta property="og:description" content="${vehicleOgDesc}">
            ${vehicleOgImage ? `<meta property="og:image" content="${vehicleOgImage}">` : ''}
            <meta name="twitter:card" content="summary_large_image">
            <meta name="twitter:title" content="${vehicleOgTitle}">
            <meta name="twitter:description" content="${vehicleOgDesc}">
            ${vehicleOgImage ? `<meta name="twitter:image" content="${vehicleOgImage}">` : ''}
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
            <style>
              :root {
                --accent: #d32f2f;
                --accent-light: rgba(211,47,47,0.08);
                --accent-border: rgba(211,47,47,0.2);
                --glass: rgba(255,255,255,0.72);
                --glass-border: rgba(255,255,255,0.45);
                --glass-strong: rgba(255,255,255,0.88);
                --text-primary: #111827;
                --text-secondary: #6b7280;
                --text-muted: #9ca3af;
                --bg: #f0f0f0;
                --radius-xl: 32px;
                --radius-lg: 24px;
                --shadow-soft: 0 8px 32px rgba(0,0,0,0.06);
                --shadow-hover: 0 20px 60px rgba(0,0,0,0.1);
              }
              * { box-sizing: border-box; margin: 0; padding: 0; min-width: 0; }
              html { scroll-behavior: smooth; }
              body { font-family: 'Inter', -apple-system, system-ui, sans-serif; background: var(--bg); color: var(--text-primary); line-height: 1.5; -webkit-font-smoothing: antialiased; overflow-x: hidden; }

              /* ── LOADER ──────────────────────────────── */
              .loader-screen { position: fixed; inset: 0; background: #fff; z-index: 99999; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: opacity 0.5s ease, visibility 0.5s ease; }
              .loader-screen.hidden { opacity: 0; visibility: hidden; pointer-events: none; }
              .loader-ring { width: 44px; height: 44px; border: 3px solid #e5e7eb; border-top-color: var(--accent); border-radius: 50%; animation: spin 0.75s linear infinite; }
              .loader-text { margin-top: 14px; font-size: 0.72rem; font-weight: 600; color: var(--text-muted); letter-spacing: 3px; text-transform: uppercase; }
              .loader-bar { width: 100px; height: 3px; background: #e5e7eb; border-radius: 4px; margin-top: 10px; overflow: hidden; }
              .loader-bar-fill { width: 0%; height: 100%; background: var(--accent); border-radius: 4px; animation: loadBar 1s ease-in-out forwards; }
              @keyframes spin { to { transform: rotate(360deg); } }
              @keyframes loadBar { 0% { width: 0%; } 60% { width: 80%; } 100% { width: 100%; } }

              /* ── ANIMATIONS ──────────────────────────── */
              .fade-up { opacity: 0; transform: translateY(20px); transition: opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1); }
              .fade-up.visible { opacity: 1; transform: translateY(0); }
              .fade-up.d1 { transition-delay: 0.06s; } .fade-up.d2 { transition-delay: 0.12s; } .fade-up.d3 { transition-delay: 0.18s; } .fade-up.d4 { transition-delay: 0.24s; }

              /* ── TOP BAR ─────────────────────────────── */
              .top-bar { position: sticky; top: 0; z-index: 1000; width: 100%; background: var(--glass); backdrop-filter: blur(20px) saturate(1.8); -webkit-backdrop-filter: blur(20px) saturate(1.8); border-bottom: 1px solid var(--glass-border); padding: 0 24px; height: 64px; display: flex; align-items: center; justify-content: center; transition: box-shadow 0.3s; border-radius: 0 0 24px 24px; }
              .top-bar.scrolled { box-shadow: 0 4px 30px rgba(0,0,0,0.06); }
              .top-bar-center { display: flex; flex-direction: column; align-items: center; gap: 1px; }
              .top-bar-label { font-size: 0.55rem; font-weight: 800; color: var(--accent); text-transform: uppercase; letter-spacing: 2.5px; }
              .top-bar-dealer { font-weight: 700; font-size: 0.95rem; color: var(--text-primary); letter-spacing: -0.2px; text-align: center; }
              .top-bar-catalog { position: absolute; right: 24px; display: inline-flex; align-items: center; gap: 5px; background: var(--accent); color: #fff; padding: 7px 16px; border-radius: 999px; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; text-decoration: none; transition: all 0.3s cubic-bezier(0.16,1,0.3,1); }
              .top-bar-catalog:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(211,47,47,0.3); }
              .top-bar-catalog svg { width: 12px; height: 12px; }
              .catalog-short { display: none; }
              @media (max-width: 600px) { .catalog-full { display: none; } .catalog-short { display: inline; } }

              /* ── TOP BAR MOBILE ───────────────────────── */
              @media (max-width: 600px) {
                .top-bar { height: 52px; padding: 0 10px; }
                .top-bar-label { font-size: 0.48rem; letter-spacing: 2px; }
                .top-bar-dealer { font-size: 0.72rem; }
                .top-bar-catalog { right: 10px; padding: 5px 10px; font-size: 0.55rem; gap: 3px; }
                .top-bar-catalog svg { width: 10px; height: 10px; }
              }

              /* ── CONTAINER ───────────────────────────── */
              .container { max-width: 1400px; margin: 0 auto; padding: 24px 20px 80px; }

              /* ── LAYOUT ──────────────────────────────── */
              .details-grid { display: grid; grid-template-columns: 1fr; gap: 24px; }
              @media (min-width: 960px) { .details-grid { grid-template-columns: 1.4fr 1fr; gap: 28px; align-items: start; } }

              /* Mobile: title/badges above photo, then photo, carrete, then price/specs */
              .mobile-title-block { display: none; }
              @media (max-width: 959px) {
                .mobile-title-block { display: block; }
                .info-card .badge-row, .info-card .vehicle-title { display: none; }
                .details-grid { gap: 16px; }
              }

              /* ── IMAGE CARD ──────────────────────────── */
              .image-col { max-width: 100%; overflow: hidden; }
              .image-card { background: var(--glass-strong); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-radius: var(--radius-xl); padding: 10px; border: 1px solid var(--glass-border); box-shadow: var(--shadow-soft); transition: box-shadow 0.4s; overflow: hidden; max-width: 100%; }
              .image-card:hover { box-shadow: var(--shadow-hover); }
              .main-image-wrap { position: relative; border-radius: var(--radius-lg); overflow: hidden; background: #f9fafb; }
              .main-image { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; cursor: zoom-in; transition: transform 0.5s cubic-bezier(0.16,1,0.3,1); }
              .main-image:hover { transform: scale(1.02); }
              .img-counter { position: absolute; bottom: 12px; right: 12px; background: rgba(0,0,0,0.55); backdrop-filter: blur(8px); color: #fff; padding: 5px 11px; border-radius: 999px; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.5px; }
              .img-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 42px; height: 42px; border-radius: 50%; background: rgba(255,255,255,0.85); backdrop-filter: blur(8px); color: var(--text-primary); border: 1px solid rgba(255,255,255,0.6); cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 16px rgba(0,0,0,0.08); transition: all 0.3s cubic-bezier(0.16,1,0.3,1); z-index: 5; }
              .img-nav:hover { background: #fff; transform: translateY(-50%) scale(1.1); box-shadow: 0 8px 30px rgba(0,0,0,0.12); }
              .img-nav.prev { left: 14px; } .img-nav.next { right: 14px; }
              .img-nav svg { width: 18px; height: 18px; }

              /* ── INFO CARD ───────────────────────────── */
              .info-card { background: var(--glass-strong); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-radius: var(--radius-xl); padding: 36px; border: 1px solid var(--glass-border); box-shadow: var(--shadow-soft); }
              @media (max-width: 600px) { .info-card { padding: 24px 20px; } }

              /* Badge row */
              .badge-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
              .badge-pill { padding: 4px 12px; border-radius: 999px; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
              .badge-year { background: var(--accent-light); color: var(--accent); }
              .badge-meta { background: rgba(0,0,0,0.04); color: var(--text-secondary); }

              /* Title */
              .vehicle-title { font-size: 2rem; font-weight: 900; line-height: 1.05; margin: 0 0 24px; text-transform: uppercase; color: var(--text-primary); letter-spacing: -1px; }
              .vehicle-title .model-name { display: block; color: var(--accent); }
              @media (min-width: 960px) { .vehicle-title { font-size: 2.4rem; } }
              @media (max-width: 500px) { .vehicle-title { font-size: 1.7rem; } }

              /* Divider */
              .divider { height: 1px; background: linear-gradient(90deg, transparent, #e5e7eb, transparent); margin: 20px 0; }

              /* Price */
              .price-label { font-size: 0.62rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
              .price-label svg { color: var(--accent); }
              .price-display { display: flex; align-items: baseline; gap: 6px; }
              .price-sym { font-size: 1.4rem; font-weight: 800; color: var(--accent); }
              .price-val { font-size: 2.2rem; font-weight: 900; color: var(--text-primary); letter-spacing: -1px; }
              .price-suffix { font-size: 0.85rem; font-weight: 500; color: var(--text-muted); margin-left: 4px; }
              @media (max-width: 500px) { .price-val { font-size: 1.7rem; } .price-sym { font-size: 1.1rem; } }

              /* Initial */
              .initial-label { font-size: 0.62rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; }
              .initial-display { display: flex; align-items: baseline; gap: 4px; }
              .initial-sym { font-size: 0.9rem; font-weight: 700; color: var(--text-muted); }
              .initial-val { font-size: 1.3rem; font-weight: 800; color: var(--text-secondary); }
              .price-alt-line { font-size: 0.78rem; font-weight: 600; color: var(--text-muted); margin-top: 4px; }
              .cuota-desde-line { margin-top: 10px; display: inline-flex; align-items: baseline; gap: 6px; cursor: pointer; padding: 6px 10px; margin-left: -10px; border-radius: 10px; transition: background 0.2s; }
              .cuota-desde-line:hover { background: var(--accent-light); }
              .cuota-desde-label { font-size: 0.62rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; }
              .cuota-desde-val { font-size: 0.95rem; font-weight: 900; color: var(--accent); }
              .cuota-desde-suffix { font-size: 0.68rem; font-weight: 600; color: var(--text-muted); margin-left: 2px; }

              /* Quick Specs */
              .quick-specs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
              .spec-pill { display: inline-flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.05); padding: 8px 14px; border-radius: 999px; font-size: 0.72rem; font-weight: 600; color: var(--text-secondary); transition: all 0.25s; }
              .spec-pill:hover { background: rgba(0,0,0,0.06); transform: translateY(-1px); }
              .spec-pill svg { width: 14px; height: 14px; color: var(--text-muted); }

              /* ── THUMBS STRIP (under main image) ────── */
              .thumbs-strip { display: flex; gap: 8px; margin-top: 12px; overflow-x: auto; padding: 2px; scrollbar-width: none; justify-content: center; }
              .thumbs-strip::-webkit-scrollbar { display: none; }
              .thumb-sm { flex-shrink: 0; width: 64px; height: 48px; border-radius: 10px; overflow: hidden; cursor: pointer; border: 2px solid transparent; opacity: 0.5; transition: all 0.2s; }
              .thumb-sm.active { border-color: var(--accent); opacity: 1; }
              .thumb-sm:hover { opacity: 0.85; }
              .thumb-sm img { width: 100%; height: 100%; object-fit: cover; display: block; }

              /* ── SPECS ───────────────────────────────── */
              .specs-section { margin-top: 32px; }
              .specs-card { background: var(--glass-strong); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-radius: var(--radius-xl); padding: 40px; border: 1px solid var(--glass-border); box-shadow: var(--shadow-soft); }
              @media (max-width: 768px) { .specs-card { padding: 24px 18px; } }
              .specs-header { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; }
              .specs-icon { width: 42px; height: 42px; border-radius: 12px; background: var(--accent-light); display: flex; align-items: center; justify-content: center; }
              .specs-icon svg { color: var(--accent); }
              .specs-h { font-size: 1rem; font-weight: 800; color: var(--text-primary); text-transform: uppercase; letter-spacing: 1.5px; }

              .spec-groups { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
              @media (max-width: 1024px) { .spec-groups { grid-template-columns: repeat(2, 1fr); } }
              @media (max-width: 600px) { .spec-groups { grid-template-columns: 1fr; } }
              .spec-group { background: rgba(0,0,0,0.02); border-radius: var(--radius-xl); padding: 24px; border: 1px solid rgba(0,0,0,0.03); transition: all 0.35s; }
              .spec-group:hover { background: rgba(255,255,255,0.6); box-shadow: 0 8px 24px rgba(0,0,0,0.04); transform: translateY(-2px); }
              .spec-group-header { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,0.05); }
              .spec-group-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
              .spec-group-title { font-size: 0.7rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px; }
              .spec-items { display: flex; flex-direction: column; gap: 10px; }
              .spec-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
              .spec-label { font-size: 0.6rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 2px; padding-left: 2px; }
              .spec-val-box { background: rgba(255,255,255,0.7); border-radius: 12px; padding: 12px 16px; border: 1px solid rgba(0,0,0,0.04); min-height: 44px; display: flex; align-items: center; transition: all 0.3s; }
              .spec-val-box:hover { background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.08); }
              .spec-val { font-size: 0.88rem; font-weight: 700; color: var(--text-primary); line-height: 1.2; text-transform: uppercase; }

              /* ── RELATED ─────────────────────────────── */
              .related-section { margin-top: 40px; }
              .section-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
              .section-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
              .section-title { font-size: 0.85rem; font-weight: 800; color: var(--text-primary); text-transform: uppercase; letter-spacing: 1.5px; }
              .related-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
              @media (min-width: 960px) { .related-grid { grid-template-columns: repeat(4, 1fr); } }
              .related-card { text-decoration: none; color: inherit; display: block; border-radius: var(--radius-xl); overflow: hidden; background: var(--glass-strong); backdrop-filter: blur(12px); border: 1px solid var(--glass-border); box-shadow: var(--shadow-soft); transition: all 0.4s cubic-bezier(0.16,1,0.3,1); }
              .related-card:hover { transform: translateY(-6px); box-shadow: var(--shadow-hover); }
              .related-card-img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; transition: transform 0.5s; }
              .related-card:hover .related-card-img { transform: scale(1.04); }
              .related-card-body { padding: 14px 16px; }
              .related-card h4 { font-size: 0.82rem; font-weight: 800; color: var(--text-primary); margin: 0 0 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
              .related-card p { margin: 0; font-size: 0.85rem; color: var(--accent); font-weight: 800; }

              /* ── FOOTER ──────────────────────────────── */
              .page-footer { text-align: center; padding: 40px 20px 60px; }
              .footer-cta { display: inline-flex; align-items: center; gap: 8px; background: var(--accent); color: #fff; padding: 14px 32px; border-radius: 999px; text-decoration: none; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 1px; transition: all 0.3s cubic-bezier(0.16,1,0.3,1); box-shadow: 0 4px 16px rgba(211,47,47,0.25); }
              .footer-cta:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(211,47,47,0.3); }
              .footer-cta svg { width: 16px; height: 16px; }
              .footer-tag { margin-top: 18px; font-size: 0.6rem; color: var(--text-muted); font-weight: 500; letter-spacing: 1.5px; text-transform: uppercase; }

              /* ── LIGHTBOX ────────────────────────────── */
              .lightbox { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; z-index: 10000; background: rgba(255,255,255,0.95); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); touch-action: none; }
              .lightbox.show { display: flex; animation: lbIn 0.25s ease; }
              @keyframes lbIn { from { opacity: 0; } to { opacity: 1; } }
              .lb-header { position: absolute; top: 24px; left: 28px; z-index: 20; pointer-events: none; }
              .lb-title { font-weight: 800; font-size: 1.1rem; color: var(--text-primary); letter-spacing: 0.3px; }
              .lb-counter { color: var(--text-muted); font-size: 0.72rem; font-weight: 600; margin: 3px 0 0; letter-spacing: 2px; text-transform: uppercase; }
              .lb-img-wrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 10; }
              .lb-img { max-width: 88%; max-height: 78vh; object-fit: contain; pointer-events: auto; border-radius: 12px; box-shadow: 0 30px 80px rgba(0,0,0,0.08); transition: opacity 0.2s ease, transform 0.3s cubic-bezier(0.16,1,0.3,1); }
              .lb-close { position: absolute; top: 18px; right: 22px; width: 44px; height: 44px; border-radius: 14px; background: rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.06); color: var(--text-primary); cursor: pointer; z-index: 20; display: flex; align-items: center; justify-content: center; transition: all 0.25s; }
              .lb-close:hover { background: rgba(0,0,0,0.1); transform: scale(1.05); }
              .lb-nav { position: fixed; top: 50%; transform: translateY(-50%); width: 48px; height: 48px; border-radius: 16px; background: rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.06); color: var(--text-primary); cursor: pointer; z-index: 20; display: flex; align-items: center; justify-content: center; transition: all 0.3s; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
              .lb-nav:hover { background: rgba(0,0,0,0.1); transform: translateY(-50%) scale(1.05); }
              .lb-nav svg { width: 20px; height: 20px; }
              .lb-prev { left: 22px; } .lb-next { right: 22px; }
              .lb-thumbs-wrap { position: absolute; bottom: 18px; left: 0; width: 100%; display: flex; justify-content: center; z-index: 30; pointer-events: none; }
              .lb-thumbs { display: flex; gap: 6px; overflow-x: auto; padding: 8px; max-width: 88%; pointer-events: auto; scrollbar-width: none; background: rgba(255,255,255,0.7); backdrop-filter: blur(12px); border-radius: 14px; border: 1px solid rgba(0,0,0,0.04); }
              .lb-thumbs::-webkit-scrollbar { display: none; }
              .lb-thumb { height: 52px; width: 52px; border-radius: 8px; object-fit: cover; opacity: 0.4; transition: all 0.25s; border: 2px solid transparent; flex-shrink: 0; cursor: pointer; }
              .lb-thumb.active { opacity: 1; border-color: var(--accent); transform: scale(1.06); }
              @media (max-width: 1024px) { .lb-nav { display: none !important; } .lb-img { max-height: 66vh !important; } }

              /* ── FINANCING PANEL ────────────────────── */
              .fin-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(17,24,39,0.5); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: none; align-items: center; justify-content: center; padding: 24px; }
              .fin-overlay.show { display: flex; animation: lbIn 0.25s ease; }
              .fin-panel { background: var(--glass-strong); backdrop-filter: blur(28px) saturate(1.8); -webkit-backdrop-filter: blur(28px) saturate(1.8); border-radius: 32px; max-width: 1080px; width: 100%; max-height: 92vh; overflow-y: auto; padding: 36px 40px 32px; box-shadow: 0 40px 100px rgba(0,0,0,0.35); position: relative; border: 1px solid var(--glass-border); }
              .fin-panel::-webkit-scrollbar { width: 6px; }
              .fin-panel::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 10px; }
              .fin-close { position: absolute; top: 20px; right: 20px; width: 38px; height: 38px; border-radius: 12px; background: rgba(0,0,0,0.04); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-primary); transition: all 0.2s; z-index: 2; }
              .fin-close:hover { background: rgba(0,0,0,0.08); }
              .fin-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-right: 40px; flex-wrap: wrap; }
              .fin-eyebrow { font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: var(--accent); margin-bottom: 5px; }
              .fin-title { font-size: 1.5rem; font-weight: 900; color: var(--text-primary); line-height: 1.15; letter-spacing: -0.5px; }
              .fin-rate-line { font-size: 0.7rem; font-weight: 600; color: var(--text-muted); margin-top: 6px; }
              .fin-curr-pill { display: flex; background: rgba(255,255,255,0.4); border: 1px solid rgba(255,255,255,0.5); backdrop-filter: blur(6px); border-radius: 13px; padding: 3px; flex-shrink: 0; }
              .fin-curr-pill button { border: none; background: none; color: var(--text-secondary); font-size: 0.72rem; font-weight: 800; padding: 8px 16px; border-radius: 10px; cursor: pointer; font-family: inherit; transition: all 0.2s; }
              .fin-curr-pill button.active { background: var(--accent); color: #fff; }

              .fin-body { display: grid; grid-template-columns: 1.35fr 1fr; gap: 32px; margin-top: 28px; align-items: start; }
              @media (max-width: 860px) { .fin-body { grid-template-columns: 1fr; gap: 24px; } }

              .fin-amounts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 22px; }
              .fin-amount-box { background: rgba(255,255,255,0.45); border: 1px solid rgba(255,255,255,0.55); backdrop-filter: blur(6px); border-radius: 18px; padding: 14px 16px; }
              .fin-amount-label { display: flex; align-items: center; justify-content: space-between; font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-muted); margin-bottom: 8px; }
              .fin-amount-pct { color: var(--accent); font-weight: 900; }
              .fin-amount-input-wrap { display: flex; align-items: baseline; gap: 6px; }
              .fin-amount-sym { font-size: 0.9rem; font-weight: 800; color: var(--text-muted); }
              .fin-amount-input { background: none; border: none; color: var(--text-primary); font-size: 1.3rem; font-weight: 900; font-family: inherit; width: 100%; padding: 0; outline: none; -moz-appearance: textfield; }
              .fin-amount-input::-webkit-outer-spin-button, .fin-amount-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

              .fin-section { margin-bottom: 22px; }
              .fin-section-label { display: flex; align-items: center; justify-content: space-between; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-muted); margin-bottom: 11px; }
              .fin-tasa-badge { color: var(--accent); font-weight: 900; font-size: 0.72rem; }

              .fin-banks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
              .fin-bank-card { text-align: left; background: rgba(255,255,255,0.4); border: 1.5px solid rgba(255,255,255,0.5); backdrop-filter: blur(6px); border-radius: 16px; padding: 14px 16px; cursor: pointer; transition: all 0.2s; font-family: inherit; }
              .fin-bank-card:hover { border-color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.7); box-shadow: 0 4px 14px rgba(0,0,0,0.06); }
              .fin-bank-card.active { border-color: var(--accent); background: var(--accent-light); box-shadow: 0 6px 20px rgba(211,47,47,0.15); }
              .fin-bank-name { font-size: 0.8rem; font-weight: 900; color: var(--text-primary); margin-bottom: 8px; line-height: 1.2; }
              .fin-bank-rate { font-size: 1.35rem; font-weight: 900; color: var(--accent); line-height: 1; }
              .fin-bank-rate-suffix { font-size: 0.6rem; font-weight: 700; color: var(--text-muted); margin-left: 3px; }
              .fin-bank-meta { margin-top: 8px; display: flex; flex-direction: column; gap: 3px; }
              .fin-bank-meta span { font-size: 0.6rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px; }

              .fin-pill-row { display: flex; gap: 8px; flex-wrap: wrap; }
              .fin-pill { flex-shrink: 0; background: rgba(255,255,255,0.4); border: 1.5px solid rgba(255,255,255,0.5); backdrop-filter: blur(6px); color: var(--text-secondary); border-radius: 13px; padding: 9px 14px; font-family: inherit; cursor: pointer; transition: all 0.2s; text-align: center; }
              .fin-pill:hover { background: rgba(255,255,255,0.7); }
              .fin-pill.active { background: var(--accent); border-color: var(--accent); color: #fff; }
              .fin-pill-term { display: flex; flex-direction: column; align-items: center; min-width: 56px; line-height: 1.15; }
              .fin-pill-term-num { font-size: 1.05rem; font-weight: 900; }
              .fin-pill-term-unit { font-size: 0.56rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; }

              .fin-reset-btn { background: none; border: none; color: var(--accent); font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; padding: 2px 0; font-family: inherit; }
              .fin-warning { margin-top: 14px; display: none; padding: 12px 16px; border-radius: 14px; background: #fff7ed; border: 1px solid #fed7aa; color: #c2410c; font-size: 0.72rem; font-weight: 600; line-height: 1.4; }

              .fin-result-card { border-radius: 24px; padding: 26px 24px; text-align: center; background: linear-gradient(135deg, var(--accent), #8f1616); box-shadow: 0 16px 40px rgba(211,47,47,0.28); position: sticky; top: 0; }
              .fin-result-label { font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; color: rgba(255,255,255,0.8); margin-bottom: 8px; }
              .fin-result-cuota { font-size: 2.5rem; font-weight: 900; color: #fff; letter-spacing: -1px; }
              .fin-result-sub { font-size: 0.72rem; font-weight: 700; color: rgba(255,255,255,0.75); margin-top: 5px; }
              .fin-progress-track { height: 8px; border-radius: 99px; background: rgba(255,255,255,0.22); margin-top: 20px; overflow: hidden; display: flex; }
              .fin-progress-fill-inicial { height: 100%; background: #10b981; transition: width 0.3s ease; }
              .fin-progress-fill-financiado { height: 100%; background: rgba(255,255,255,0.9); transition: width 0.3s ease; }
              .fin-progress-legend { display: flex; justify-content: center; gap: 20px; margin-top: 12px; font-size: 0.68rem; font-weight: 700; color: rgba(255,255,255,0.85); }
              .fin-progress-legend span { display: flex; align-items: center; gap: 5px; }
              .fin-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
              .fin-dot-inicial { background: #10b981; }
              .fin-dot-financiado { background: #fff; }
              .fin-breakdown-toggle { margin-top: 16px; background: none; border: none; color: rgba(255,255,255,0.85); font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; gap: 4px; }
              .fin-breakdown-toggle svg { transition: transform 0.2s; }
              .fin-breakdown-toggle.open svg { transform: rotate(180deg); }
              .fin-breakdown { display: none; margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.2); grid-template-columns: repeat(3, 1fr); gap: 8px; }
              .fin-breakdown.show { display: grid; }
              .fin-breakdown div { font-size: 0.58rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: rgba(255,255,255,0.7); }
              .fin-breakdown strong { display: block; font-size: 0.85rem; font-weight: 900; color: #fff; margin-top: 4px; text-transform: none; letter-spacing: 0; }

              .fin-empty { text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 0.9rem; font-weight: 500; line-height: 1.6; }
              .fin-wa-cta { margin-top: 16px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; background: #25D366; color: #fff; padding: 14px; border-radius: 16px; font-weight: 800; font-size: 0.85rem; text-decoration: none; box-shadow: 0 6px 18px rgba(37,211,102,0.3); }
              @media (max-width: 640px) { .fin-panel { padding: 26px 20px 22px; border-radius: 24px; } .fin-title { font-size: 1.2rem; } .fin-result-cuota { font-size: 2rem; } }
            </style>
          </head>
          <body>
            <!-- LOADER -->
            <div class="loader-screen" id="loader">
              <div class="loader-ring"></div>
              <div class="loader-text">Cargando</div>
              <div class="loader-bar"><div class="loader-bar-fill"></div></div>
            </div>

            <!-- TOP BAR -->
            <div class="top-bar" id="topBar">
              <div class="top-bar-center">
                <span class="top-bar-label">Inventario</span>
                <span class="top-bar-dealer">${dealerName}</span>
              </div>
              <a href="${catalogUrl}" class="top-bar-catalog">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect></svg>
                <span class="catalog-full">Ver Catálogo</span><span class="catalog-short">Ver</span>
              </a>
            </div>

            <div class="container">
              <!-- Mobile title (visible only on mobile) -->
              <div class="mobile-title-block fade-up">
                <div class="badge-row">
                  <span class="badge-pill badge-year">${raw.year}</span>
                  <span class="badge-pill badge-meta">${(raw.color || 'N/A').toUpperCase()}</span>
                  ${raw.edition || raw.version ? `<span class="badge-pill badge-meta">${(raw.edition || raw.version).toUpperCase()}</span>` : ''}
                </div>
                <h2 class="vehicle-title">${raw.make}<span class="model-name">${raw.model}</span></h2>
              </div>

              <div class="details-grid">
                <!-- IMAGE -->
                <div class="image-col fade-up">
                <div class="image-card">
                  <div class="main-image-wrap">
                    ${photos.length > 0
            ? `<img src="${photos[0]}" class="main-image" id="mainImg" onclick="openLightbox()">`
            : `<img src="${logoUrl || 'https://via.placeholder.com/800x600?text=Sin+Imagen'}" class="main-image" id="mainImg" style="object-fit:contain;background:#f9fafb;padding:15%;">`}
                    ${photos.length > 1 ? `
                    <button class="img-nav prev" onclick="prevImg()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
                    <button class="img-nav next" onclick="nextImg()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
                    <div class="img-counter" id="imgCounter">1 / ${photos.length}</div>
                    ` : ''}
                  </div>
                </div>

                ${photos.length > 1 ? `
                <div class="thumbs-strip">
                  ${photos.map((img, idx) => `
                    <div class="thumb-sm ${idx === 0 ? 'active' : ''}" onclick="pickImg(${idx})" id="ci${idx}">
                      <img src="${img}" loading="lazy">
                    </div>
                  `).join('')}
                </div>
                ` : ''}
                </div>

                <!-- INFO -->
                <div class="info-card fade-up d1">
                  <div class="badge-row">
                    <span class="badge-pill badge-year">${raw.year}</span>
                    <span class="badge-pill badge-meta">${(raw.color || 'N/A').toUpperCase()}</span>
                    ${raw.edition || raw.version ? `<span class="badge-pill badge-meta">${(raw.edition || raw.version).toUpperCase()}</span>` : ''}
                    ${(raw.tipo_vehiculo || raw.type || raw.body_type || raw.tipo) ? `<span class="badge-pill badge-meta">${(raw.tipo_vehiculo || raw.type || raw.body_type || raw.tipo).toUpperCase()}</span>` : ''}
                  </div>

                  <h2 class="vehicle-title">${raw.make}<span class="model-name">${raw.model}</span></h2>

                  <div class="divider"></div>

                  <!-- Price -->
                  <div>
                    <div class="price-label">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                      Precio de Venta
                    </div>
                    <div class="price-display">
                      <span class="price-sym">${(v.precio || '').split(' ')[0]}</span>
                      <span class="price-val">${(v.precio || '').substring((v.precio || '').indexOf(' ') + 1)}</span>
                    </div>
                    ${precioAltDisplay ? `<div class="price-alt-line">≈ ${precioAltDisplay}</div>` : ''}
                  </div>

                  <div class="divider"></div>

                  <!-- Initial -->
                  <div>
                    <div class="initial-label">Pago Inicial</div>
                    <div class="initial-display">
                      <span class="initial-sym">${(v.inicial_calculado && v.inicial_calculado !== 'N/A') ? (v.inicial_calculado || '').split(' ')[0] : ''}</span>
                      <span class="initial-val">${(v.inicial_calculado && v.inicial_calculado !== 'N/A') ? (v.inicial_calculado || '').substring((v.inicial_calculado || '').indexOf(' ') + 1) : 'Consultar'}</span>
                    </div>
                    ${inicialAltDisplay ? `<div class="price-alt-line">≈ ${inicialAltDisplay}</div>` : ''}
                    ${cuotaDesdeText ? `
                    <div class="cuota-desde-line" onclick="openFinancing()">
                      <span class="cuota-desde-label">Cuotas desde</span>
                      <span class="cuota-desde-val">${cuotaDesdeText}<span class="cuota-desde-suffix">/mes</span></span>
                    </div>
                    ` : ''}
                  </div>

                  <div class="divider"></div>

                  <!-- CTA Buttons -->
                  <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    ${waLinkDetail ? `<a href="${waLinkDetail}" target="_blank" rel="noopener" style="flex:1;min-width:140px;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#25D366;color:#fff;padding:14px 20px;border-radius:14px;font-weight:800;font-size:0.85rem;text-decoration:none;transition:all 0.3s;box-shadow:0 4px 12px rgba(37,211,102,0.3);">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                      Contacta por WhatsApp
                    </a>` : ''}
                    <button type="button" onclick="openFinancing()" style="flex:1;min-width:140px;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--accent);color:#fff;padding:14px 20px;border-radius:14px;font-weight:800;font-size:0.82rem;border:none;box-shadow:0 4px 12px rgba(211,47,47,0.3);transition:all 0.3s;cursor:pointer;font-family:inherit;">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
                      Financíalo
                    </button>
                  </div>

                  <!-- Quick Specs -->
                  <div class="quick-specs">
                    ${v.transmision ? `<span class="spec-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6"/><path d="M1 12h6m6 0h6"/></svg>${String(v.transmision).toUpperCase()}</span>` : ''}
                    ${v.motor ? `<span class="spec-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 1v3m6-3v3m-6 17v3m6-3v3M1 9h3m17 0h3M1 15h3m17 0h3"/></svg>${String(v.motor).toUpperCase()}</span>` : ''}
                    ${v.traccion ? `<span class="spec-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/></svg>${String(v.traccion).toUpperCase()}</span>` : ''}
                    ${v.combustible ? `<span class="spec-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${String(v.combustible).toUpperCase()}</span>` : ''}
                  </div>
                </div>
              </div>


              <!-- SPECS -->
              <div class="specs-section fade-up d3">
                <div class="specs-card">
                  <div class="specs-header">
                    <div class="specs-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
                    <span class="specs-h">Ficha Técnica Completa</span>
                  </div>
                  <div class="spec-groups">
                    <!-- BASICA -->
                    <div class="spec-group">
                      <div class="spec-group-header"><div class="spec-group-dot"></div><span class="spec-group-title">Básica</span></div>
                      <div class="spec-items">
                        <div class="spec-row">
                          <div><div class="spec-label">Año</div><div class="spec-val-box"><div class="spec-val">${v.anio || '-'}</div></div></div>
                          <div><div class="spec-label">Color</div><div class="spec-val-box"><div class="spec-val">${String(v.color || '').toUpperCase()}</div></div></div>
                        </div>
                        <div><div class="spec-label">Kilometraje</div><div class="spec-val-box"><div class="spec-val">${Number(v.mileage).toLocaleString()} ${v.unit}</div></div></div>
                        <div><div class="spec-label">Versión / Edición</div><div class="spec-val-box"><div class="spec-val">${String(v.edicion || '-').toUpperCase()}</div></div></div>
                        <div class="spec-row">
                          <div><div class="spec-label">Condición</div><div class="spec-val-box"><div class="spec-val">${String(v.condicion || '').toUpperCase()}</div></div></div>
                          <div><div class="spec-label">CarFax</div><div class="spec-val-box"><div class="spec-val">${String(v.carfax || '-').toUpperCase()}</div></div></div>
                        </div>
                        <div><div class="spec-label">Chasis / VIN</div><div class="spec-val-box"><div class="spec-val" style="font-family:monospace;font-size:0.78rem;letter-spacing:0.5px;">${(v.vin || '-').toUpperCase()}</div></div></div>
                      </div>
                    </div>
                    <!-- MECANICA -->
                    <div class="spec-group">
                      <div class="spec-group-header"><div class="spec-group-dot"></div><span class="spec-group-title">Mecánica</span></div>
                      <div class="spec-items">
                        <div><div class="spec-label">Motor / Potencia</div><div class="spec-val-box"><div class="spec-val" style="font-size:0.82rem;">${String(v.motor || '-').toUpperCase()}</div></div></div>
                        <div><div class="spec-label">Transmisión</div><div class="spec-val-box"><div class="spec-val">${String(v.transmision || '-').toUpperCase()}</div></div></div>
                        <div><div class="spec-label">Tracción</div><div class="spec-val-box"><div class="spec-val">${String(v.traccion || '-').toUpperCase()}</div></div></div>
                        <div><div class="spec-label">Combustible</div><div class="spec-val-box"><div class="spec-val">${String(v.combustible || '-').toUpperCase()}</div></div></div>
                      </div>
                    </div>
                    <!-- CONFORT -->
                    <div class="spec-group">
                      <div class="spec-group-header"><div class="spec-group-dot"></div><span class="spec-group-title">Confort</span></div>
                      <div class="spec-items">
                        <div class="spec-row">
                          <div><div class="spec-label">Asientos</div><div class="spec-val-box"><div class="spec-val">${v.asientos || '-'}</div></div></div>
                          <div><div class="spec-label">Interior</div><div class="spec-val-box"><div class="spec-val">${String(v.material_interior || '-').toUpperCase()}</div></div></div>
                        </div>
                        <div class="spec-row">
                          <div><div class="spec-label">CarPlay</div><div class="spec-val-box"><div class="spec-val">${String(v.carplay || '-').toUpperCase()}</div></div></div>
                          <div><div class="spec-label">Cámara</div><div class="spec-val-box"><div class="spec-val">${String(v.camera || '-').toUpperCase()}</div></div></div>
                        </div>
                        <div><div class="spec-label">Sensores</div><div class="spec-val-box"><div class="spec-val">${String(v.sensores || '-').toUpperCase()}</div></div></div>
                        <div><div class="spec-label">Techo</div><div class="spec-val-box"><div class="spec-val">${String(v.techo || '-').toUpperCase()}</div></div></div>
                        <div class="spec-row">
                          <div><div class="spec-label">Vidrios Eléct.</div><div class="spec-val-box"><div class="spec-val">${String(v.electric_windows || '-').toUpperCase()}</div></div></div>
                          <div><div class="spec-label">Baúl Eléct.</div><div class="spec-val-box"><div class="spec-val">${String(v.baul || '-').toUpperCase()}</div></div></div>
                        </div>
                        <div><div class="spec-label">Llave</div><div class="spec-val-box"><div class="spec-val">${String(v.llave || '-').toUpperCase()}</div></div></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- RELATED -->
              <div class="related-section fade-up d4">
                <div class="section-header">
                  <div class="section-dot"></div>
                  <span class="section-title">Vehículos Relacionados</span>
                </div>
                <div class="related-grid">
                  ${related.map(r => `
                    <a href="https://carbotsystem.com/inventario/${slugify(dealerName)}/vehiculo/${r.id}" class="related-card">
                      <div style="overflow:hidden;"><img src="${r.imagen || logoUrl || 'https://via.placeholder.com/400x225?text=Sin+Imagen'}" class="related-card-img" style="${!r.imagen && logoUrl ? 'object-fit:contain;background:#f9fafb;padding:10%;' : ''}"></div>
                      <div class="related-card-body">
                        <h4>${r.nombre}</h4>
                        <p>${r.precio || ''}</p>
                      </div>
                    </a>
                  `).join('')}
                </div>
              </div>

              <!-- FOOTER -->
              <div class="page-footer fade-up">
                <a href="${catalogUrl}" class="footer-cta">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  Ver Catálogo Completo
                </a>
                <div class="footer-tag">Powered by CarBot System</div>
              </div>
            </div>

            <!-- FINANCING PANEL -->
            <div id="finOverlay" class="fin-overlay" onclick="if(event.target===this)closeFinancing()">
              <div class="fin-panel">
                <button class="fin-close" onclick="closeFinancing()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                ${financingBanks.length > 0 ? `
                <div class="fin-header">
                  <div>
                    <div class="fin-eyebrow">Calculadora de Financiamiento</div>
                    <div class="fin-title">Simula tu Financiamiento</div>
                  </div>
                  <div class="fin-curr-pill">
                    <button type="button" class="${precioCurrencyCode === dealerCurrencyPrimary ? 'active' : ''}" data-cur="${dealerCurrencyPrimary}" onclick="finSetCurrency('${dealerCurrencyPrimary}')">${CURRENCY_SYMBOLS[dealerCurrencyPrimary] || dealerCurrencyPrimary}</button>
                    <button type="button" class="${precioCurrencyCode === dealerCurrencyPrimary ? '' : 'active'}" data-cur="${dealerCurrencySecondary}" onclick="finSetCurrency('${dealerCurrencySecondary}')">${CURRENCY_SYMBOLS[dealerCurrencySecondary] || dealerCurrencySecondary}</button>
                  </div>
                </div>
                <div class="fin-rate-line" id="finRateLabel">Cargando tasa de cambio del día…</div>

                <div class="fin-body">
                  <div class="fin-col-form">
                    <div class="fin-amounts-row">
                      <div class="fin-amount-box">
                        <div class="fin-amount-label">Precio</div>
                        <div class="fin-amount-input-wrap">
                          <span class="fin-amount-sym fin-sym">${CURRENCY_SYMBOLS[precioCurrencyCode] || (precioCurrencyCode === 'DOP' ? 'RD$' : 'US$')}</span>
                          <input type="text" inputmode="numeric" id="finPrecio" class="fin-amount-input">
                        </div>
                      </div>
                      <div class="fin-amount-box">
                        <div class="fin-amount-label">Inicial <span class="fin-amount-pct" id="finInicialPct">—</span></div>
                        <div class="fin-amount-input-wrap">
                          <span class="fin-amount-sym fin-sym">${CURRENCY_SYMBOLS[precioCurrencyCode] || (precioCurrencyCode === 'DOP' ? 'RD$' : 'US$')}</span>
                          <input type="text" inputmode="numeric" id="finInicial" class="fin-amount-input">
                        </div>
                      </div>
                    </div>

                    <div class="fin-section">
                      <div class="fin-section-label">Banco <span class="fin-tasa-badge" id="finTasaLabel"></span></div>
                      <div class="fin-banks-grid" id="finBancoPills"></div>
                    </div>

                    <div class="fin-section">
                      <div class="fin-section-label">Plazo</div>
                      <div class="fin-pill-row" id="finPlazoPills"></div>
                    </div>

                    <button type="button" class="fin-reset-btn" onclick="finResetDefaults()">↺ Restablecer valores del dealer</button>
                    <div id="finWarning" class="fin-warning"></div>
                  </div>

                  <div class="fin-col-result">
                    <div class="fin-result-card">
                      <div class="fin-result-label">Cuota Mensual Estimada</div>
                      <div class="fin-result-cuota" id="finCuota">—</div>
                      <div class="fin-result-sub" id="finResultSub">—</div>
                      <div class="fin-progress-track">
                        <div class="fin-progress-fill-inicial" id="finProgressInicial" style="width:0%"></div>
                        <div class="fin-progress-fill-financiado" id="finProgressFinanciado" style="width:0%"></div>
                      </div>
                      <div class="fin-progress-legend">
                        <span><i class="fin-dot fin-dot-inicial"></i>Inicial <span id="finPctInicial">—</span></span>
                        <span><i class="fin-dot fin-dot-financiado"></i>Financiado <span id="finPctFinanciado">—</span></span>
                      </div>
                      <button type="button" class="fin-breakdown-toggle" id="finBreakdownToggle" onclick="finToggleBreakdown()">
                        <span id="finBreakdownLabel">Ver desglose</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                      </button>
                      <div class="fin-breakdown" id="finBreakdown">
                        <div>Financiado<strong id="finMonto">—</strong></div>
                        <div>Total a Pagar<strong id="finTotal">—</strong></div>
                        <div>Interés<strong id="finInteres">—</strong></div>
                      </div>
                    </div>
                    ${waLinkDetail ? `<a href="${waLinkDetail}" target="_blank" rel="noopener" class="fin-wa-cta">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                      Hablar con un Asesor
                    </a>` : ''}
                  </div>
                </div>
                ` : `
                <div class="fin-title" style="margin-bottom:0;padding-right:0;">Simula tu Financiamiento</div>
                <div class="fin-empty">Estamos preparando opciones de financiamiento para este vehículo.<br>Escríbenos y te ayudamos con las condiciones disponibles.</div>
                ${waLinkDetail ? `<a href="${waLinkDetail}" target="_blank" rel="noopener" class="fin-wa-cta">Hablar con un Asesor</a>` : ''}
                `}
              </div>
            </div>

            <!-- LIGHTBOX -->
            <div id="lightbox" class="lightbox" onclick="closeLightbox()">
              <div class="lb-header">
                <div class="lb-title">${v.nombre}</div>
                <div class="lb-counter" id="lbCounter">Foto 1 de ${photos.length}</div>
              </div>
              <div class="lb-close" onclick="closeLightbox()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
              <div class="lb-nav lb-prev" onclick="event.stopPropagation();moveLB(-1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></div>
              <div class="lb-img-wrap"><img class="lb-img" id="lbImg" src="" onclick="event.stopPropagation()"></div>
              <div class="lb-nav lb-next" onclick="event.stopPropagation();moveLB(1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>
              <div class="lb-thumbs-wrap" onclick="event.stopPropagation()">
                <div class="lb-thumbs">
                  ${photos.map((img, idx) => `<img src="${img}" class="lb-thumb ${idx === 0 ? 'active' : ''}" onclick="pickImg(${idx});updLB();" id="lt${idx}">`).join('')}
                </div>
              </div>
            </div>

            <script>
              // Loader
              window.addEventListener('load',function(){setTimeout(function(){document.getElementById('loader').classList.add('hidden');},1000);});

              // Scroll reveal
              var obs=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('visible');obs.unobserve(e.target);}});},{threshold:0.06,rootMargin:'0px 0px -30px 0px'});
              document.querySelectorAll('.fade-up').forEach(function(el){obs.observe(el);});

              // Nav shadow
              window.addEventListener('scroll',function(){document.getElementById('topBar').classList.toggle('scrolled',window.scrollY>8);},{passive:true});

              // Gallery
              var photos=${JSON.stringify(photos)};
              var ci=0,tsx=0,tex=0;

              function pickImg(i){
                ci=i;
                var m=document.getElementById('mainImg');
                m.style.opacity='0';
                setTimeout(function(){m.src=photos[i];m.style.opacity='1';},150);
                // Update thumbs
                document.querySelectorAll('.thumb-sm').forEach(function(t){t.classList.remove('active');});
                var ct=document.getElementById('ci'+i);
                if(ct)ct.classList.add('active');
                var c=document.getElementById('imgCounter');
                if(c)c.textContent=(i+1)+' / '+photos.length;
              }
              function prevImg(){ci--;if(ci<0)ci=photos.length-1;pickImg(ci);}
              function nextImg(){ci++;if(ci>=photos.length)ci=0;pickImg(ci);}

              // Lightbox
              function openLightbox(){updLB();var l=document.getElementById('lightbox');l.classList.add('show');document.body.style.overflow='hidden';document.body.addEventListener('touchmove',pv,{passive:false});}
              function closeLightbox(){var l=document.getElementById('lightbox');l.classList.remove('show');l.style.display='';document.body.style.overflow='';document.body.removeEventListener('touchmove',pv);}
              function pv(e){if(e.target.closest('.lb-thumbs'))return;e.preventDefault();}
              function moveLB(s){ci+=s;if(ci>=photos.length)ci=0;if(ci<0)ci=photos.length-1;updLB();pickImg(ci);}
              function updLB(){
                var img=document.getElementById('lbImg');
                img.style.opacity='0';img.style.transform='scale(0.96)';
                setTimeout(function(){img.src=photos[ci];img.style.opacity='1';img.style.transform='scale(1)';},100);
                document.getElementById('lbCounter').textContent='Foto '+(ci+1)+' de '+photos.length;
                document.querySelectorAll('.lb-thumb').forEach(function(t){t.classList.remove('active');});
                var at=document.getElementById('lt'+ci);
                if(at){at.classList.add('active');var c=document.querySelector('.lb-thumbs');if(c){c.scrollTo({left:at.offsetLeft-(c.clientWidth/2)+(at.clientWidth/2),behavior:'smooth'});}}
              }

              // Keys
              document.addEventListener('keydown',function(e){if(document.getElementById('lightbox').classList.contains('show')){if(e.key==='Escape')closeLightbox();if(e.key==='ArrowLeft')moveLB(-1);if(e.key==='ArrowRight')moveLB(1);}});

              // Touch
              var lbEl=document.getElementById('lightbox');
              lbEl.addEventListener('touchstart',function(e){tsx=e.changedTouches[0].screenX;},{passive:true});
              lbEl.addEventListener('touchend',function(e){tex=e.changedTouches[0].screenX;if(tex<tsx-50)moveLB(1);if(tex>tsx+50)moveLB(-1);},{passive:true});

              // Img transition
              var mi=document.getElementById('mainImg');if(mi)mi.style.transition='opacity 0.3s ease';

              // ── FINANCIAMIENTO ──────────────────────
              var FIN = {
                precio: ${precioNativeVal},
                precioCurrency: ${JSON.stringify(precioCurrencyCode)},
                inicial: ${inicialNativeVal},
                inicialCurrency: ${JSON.stringify(inicialCurrencyCode)},
                banks: ${finBanksJson},
                terms: [6,12,24,36,48,72],
                primaryCurrency: ${JSON.stringify(dealerCurrencyPrimary)},
                secondaryCurrency: ${JSON.stringify(dealerCurrencySecondary)},
                manualRate: ${dealerManualRate != null ? dealerManualRate : 'null'},
                rates: ${JSON.stringify(detailRates)}
              };
              var FIN_CURRENCY_SYMBOLS = { DOP: 'RD$', USD: 'US$', EUR: '€', COP: 'COP$' };
              // 1 unidad de secondaryCurrency = finRate unidades de primaryCurrency.
              // Si el dealer configuró una tasa manual, esa manda; si no, se reemplaza
              // con la tasa en vivo al cargar (ver fetch más abajo). 60 es solo respaldo.
              var finRate = FIN.rates[FIN.secondaryCurrency] || 60;
              var finCurrency = FIN.precioCurrency === FIN.secondaryCurrency ? FIN.secondaryCurrency : FIN.primaryCurrency;
              var finBankIdx = 0;
              var finPlazo = 48;

              function finConvert(amount, fromCur, toCur) {
                if (fromCur === toCur) return amount;
                var from = FIN.rates[fromCur], to = FIN.rates[toCur];
                if (!(from > 0) || !(to > 0)) return amount;
                return amount * from / to;
              }
              function finFmt(n) { return Math.round(n).toLocaleString('en-US'); }
              function finSymbol(cur) { return FIN_CURRENCY_SYMBOLS[cur] || cur; }

              function finPopulateBanks() {
                var wrap = document.getElementById('finBancoPills');
                if (!wrap) return;
                wrap.innerHTML = FIN.banks.map(function(b, i) {
                  return '<button type="button" class="fin-bank-card' + (i === finBankIdx ? ' active' : '') + '" data-idx="' + i + '" onclick="finSelectBank(' + i + ')">' +
                    '<div class="fin-bank-name">' + b.banco + '</div>' +
                    '<div class="fin-bank-rate">' + b.tasa_anual + '<span class="fin-bank-rate-suffix">% ANUAL</span></div>' +
                    '<div class="fin-bank-meta"><span>Hasta ' + b.max_financiamiento_pct + '% financiado</span><span>Plazo máx. ' + b.plazo_maximo_meses + ' meses</span></div>' +
                    '</button>';
                }).join('');
                var tasaLabel = document.getElementById('finTasaLabel');
                if (tasaLabel && FIN.banks[finBankIdx]) tasaLabel.textContent = FIN.banks[finBankIdx].tasa_anual + '% anual';
              }
              function finSelectBank(i) {
                finBankIdx = i;
                document.querySelectorAll('#finBancoPills .fin-bank-card').forEach(function(el) { el.classList.toggle('active', parseInt(el.dataset.idx, 10) === i); });
                var tasaLabel = document.getElementById('finTasaLabel');
                if (tasaLabel) tasaLabel.textContent = FIN.banks[i].tasa_anual + '% anual';
                finPopulatePlazos();
                finCalculate();
              }
              function finPopulatePlazos() {
                var wrap = document.getElementById('finPlazoPills');
                var bank = FIN.banks[finBankIdx];
                if (!wrap || !bank) return;
                var maxMeses = bank.plazo_maximo_meses;
                var opts = FIN.terms.filter(function(m) { return m <= maxMeses; });
                if (opts.indexOf(maxMeses) === -1) opts.push(maxMeses);
                if (opts.indexOf(finPlazo) === -1) {
                  // Default a un plazo típico de 4 años; si el banco no lo permite, el más largo disponible.
                  finPlazo = opts.indexOf(48) !== -1 ? 48 : opts[opts.length - 1];
                }
                wrap.innerHTML = opts.map(function(m) {
                  var num = (m % 12 === 0) ? (m / 12) : m;
                  var unit = (m % 12 === 0) ? (m / 12 === 1 ? 'AÑO' : 'AÑOS') : 'MESES';
                  return '<button type="button" class="fin-pill fin-pill-term' + (m === finPlazo ? ' active' : '') + '" data-val="' + m + '" onclick="finSelectPlazo(' + m + ')"><span class="fin-pill-term-num">' + num + '</span><span class="fin-pill-term-unit">' + unit + '</span></button>';
                }).join('');
              }
              function finSelectPlazo(m) {
                finPlazo = m;
                document.querySelectorAll('#finPlazoPills .fin-pill').forEach(function(el) { el.classList.toggle('active', parseInt(el.dataset.val, 10) === m); });
                finCalculate();
              }
              function finParseNum(str) { return parseFloat(String(str || '').replace(/,/g, '')) || 0; }
              function finSetInputValue(id, num) { document.getElementById(id).value = Math.round(num).toLocaleString('en-US'); }
              function finFormatInputLive(e) {
                var el = e.target;
                var digits = el.value.replace(/[^0-9]/g, '');
                el.value = digits ? Number(digits).toLocaleString('en-US') : '';
              }
              function finSetCurrency(cur) {
                if (cur === finCurrency) return;
                var precioInput = document.getElementById('finPrecio');
                var inicialInput = document.getElementById('finInicial');
                finSetInputValue('finPrecio', finConvert(finParseNum(precioInput.value), finCurrency, cur));
                finSetInputValue('finInicial', finConvert(finParseNum(inicialInput.value), finCurrency, cur));
                finCurrency = cur;
                document.querySelectorAll('.fin-curr-pill button').forEach(function(b) { b.classList.toggle('active', b.dataset.cur === cur); });
                document.querySelectorAll('.fin-sym').forEach(function(s) { s.textContent = finSymbol(cur); });
                finCalculate();
              }
              function finResetDefaults() {
                finSetInputValue('finPrecio', finConvert(FIN.precio, FIN.precioCurrency, finCurrency));
                finSetInputValue('finInicial', finConvert(FIN.inicial, FIN.inicialCurrency, finCurrency));
                finCalculate();
              }
              function finToggleBreakdown() {
                var el = document.getElementById('finBreakdown');
                var btn = document.getElementById('finBreakdownToggle');
                var isOpen = el.classList.toggle('show');
                btn.classList.toggle('open', isOpen);
                document.getElementById('finBreakdownLabel').textContent = isOpen ? 'Ocultar desglose' : 'Ver desglose';
              }
              function finCalculate() {
                if (!FIN.banks.length) return;
                var precio = finParseNum(document.getElementById('finPrecio').value);
                var inicial = finParseNum(document.getElementById('finInicial').value);
                var bank = FIN.banks[finBankIdx];
                var plazo = finPlazo || 1;
                if (!bank) return;

                var monto = Math.max(precio - inicial, 0);
                var r = (bank.tasa_anual / 100) / 12;
                var cuota = r > 0 ? (monto * r * Math.pow(1 + r, plazo)) / (Math.pow(1 + r, plazo) - 1) : (monto / plazo);
                var totalPagar = cuota * plazo;
                var totalInteres = totalPagar - monto;

                document.getElementById('finCuota').textContent = finSymbol(finCurrency) + ' ' + finFmt(cuota);
                document.getElementById('finResultSub').textContent = plazo + ' meses · ' + bank.tasa_anual + '% anual';
                document.getElementById('finMonto').textContent = finSymbol(finCurrency) + ' ' + finFmt(monto);
                document.getElementById('finTotal').textContent = finSymbol(finCurrency) + ' ' + finFmt(totalPagar);
                document.getElementById('finInteres').textContent = finSymbol(finCurrency) + ' ' + finFmt(totalInteres);

                var pctInicial = precio > 0 ? Math.min((inicial / precio) * 100, 100) : 0;
                var pctFinanciado = Math.max(100 - pctInicial, 0);
                document.getElementById('finInicialPct').textContent = pctInicial.toFixed(0) + '%';
                document.getElementById('finPctInicial').textContent = pctInicial.toFixed(0) + '%';
                document.getElementById('finPctFinanciado').textContent = pctFinanciado.toFixed(0) + '%';
                document.getElementById('finProgressInicial').style.width = pctInicial + '%';
                document.getElementById('finProgressFinanciado').style.width = pctFinanciado + '%';

                var pctFinanciadoReal = precio > 0 ? (monto / precio) * 100 : 0;
                var warnEl = document.getElementById('finWarning');
                if (pctFinanciadoReal > bank.max_financiamiento_pct + 0.01) {
                  warnEl.style.display = 'block';
                  warnEl.textContent = 'Este banco financia hasta ' + bank.max_financiamiento_pct + '% del precio. Con este inicial estás pidiendo ' + pctFinanciadoReal.toFixed(1) + '%. Aumenta el inicial o consulta condiciones especiales con el asesor.';
                } else {
                  warnEl.style.display = 'none';
                }
              }
              function openFinancing() {
                document.getElementById('finOverlay').classList.add('show');
                document.body.style.overflow = 'hidden';
              }
              function closeFinancing() {
                document.getElementById('finOverlay').classList.remove('show');
                document.body.style.overflow = '';
              }

              if (FIN.banks.length > 0) {
                finPopulateBanks();
                finPopulatePlazos();
                finResetDefaults();
                document.getElementById('finPrecio').addEventListener('input', function(e) { finFormatInputLive(e); finCalculate(); });
                document.getElementById('finInicial').addEventListener('input', function(e) { finFormatInputLive(e); finCalculate(); });

                if (FIN.manualRate) {
                  var manualRateLabel = document.getElementById('finRateLabel');
                  if (manualRateLabel) manualRateLabel.textContent = 'Tasa: 1 ' + finSymbol(FIN.secondaryCurrency) + ' = ' + finSymbol(FIN.primaryCurrency) + finRate.toFixed(2);
                } else {
                  fetch(${JSON.stringify(SUPABASE_URL + '/functions/v1/exchange-rate')})
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                      var perUsd = data && data.perUsd;
                      if (perUsd && perUsd[FIN.primaryCurrency] > 0) {
                        for (var code in FIN_CURRENCY_SYMBOLS) {
                          if (perUsd[code] > 0) FIN.rates[code] = perUsd[FIN.primaryCurrency] / perUsd[code];
                        }
                        FIN.rates[FIN.primaryCurrency] = 1;
                        finRate = FIN.rates[FIN.secondaryCurrency];
                        var rateLabel = document.getElementById('finRateLabel');
                        if (rateLabel && finRate > 0) rateLabel.textContent = 'Tasa de hoy: 1 ' + finSymbol(FIN.secondaryCurrency) + ' = ' + finSymbol(FIN.primaryCurrency) + finRate.toFixed(2);
                      }
                    })
                    .catch(function() { /* se mantiene la tasa de respaldo */ });
                }
              }

              document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') { var fo = document.getElementById('finOverlay'); if (fo && fo.classList.contains('show')) closeFinancing(); }
              });
            </script>
          </body>
          </html>
        `;


        res.set('Content-Type', 'text/html');
        console.log(`✅ [inventarioIA] Retornando HTML de MODO DETALLE, tamaño: ${html.length}`);
        return res.send(html);
      }

      console.log(`👉 [inventarioIA] Pasando a MODO LISTA (REDISEÑO TIENDA PREMIUM)`);

      // Catalog: only vehicles with price > 0
      const catalogInventory = inventory.filter(v => v.precio_num > 0);
      // Sort: destacados → más recientes → más económicos
      catalogInventory.sort((a, b) => {
        if (b.destacado !== a.destacado) return (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0);
        if (b.anio_num !== a.anio_num) return b.anio_num - a.anio_num;
        return a.precio_num - b.precio_num;
      });

      const dealerSlugForCatalog = slugify(dealerName);
      const catalogPageUrl = `https://carbotsystem.com/inventario/${dealerSlugForCatalog}/catalogo`;
      const ogImage = logoUrl || 'https://carbotsystem.com/og-default.png';

      let html = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${dealerName} | Inventario Disponible</title>
          <!-- Open Graph -->
          <meta property="og:type" content="website">
          <meta property="og:url" content="${catalogPageUrl}">
          <meta property="og:title" content="${dealerName} | Inventario Disponible">
          <meta property="og:description" content="Explora nuestro inventario actualizado de vehículos disponibles con financiamiento y garantía.">
          <meta property="og:image" content="${ogImage}">
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="${dealerName} | Inventario Disponible">
          <meta name="twitter:description" content="Explora nuestro inventario actualizado de vehículos disponibles con financiamiento y garantía.">
          <meta name="twitter:image" content="${ogImage}">
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800;900&family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
          <style>
            :root { 
              --primary: #ef4444; 
              --bg: #f8fafc; 
              --text: #1e293b; 
              --secondary: #64748b; 
              --glass: rgba(255, 255, 255, 0.85);
            }
            * { box-sizing: border-box; }
            body { font-family: 'Inter', sans-serif; background-color: var(--bg); margin: 0; padding: 0; color: var(--text); -webkit-font-smoothing: antialiased; }
            h1, h2, h3, .card-title, .header-label, .btn-view { font-family: 'Outfit', sans-serif; }
            
            .header { padding: 60px 20px 40px; text-align: center; }
            .header-label { font-weight: 800; font-size: 0.85rem; color: var(--primary); text-transform: uppercase; letter-spacing: 4px; display: block; margin-bottom: 12px; }
            .header h1 { color: #1e293b; font-weight: 900; text-transform: uppercase; margin: 0; font-size: 2.8rem; letter-spacing: -1px; line-height: 1; }
            
            .sticky-filters { position: sticky; top: 20px; z-index: 1000; margin-bottom: 40px; transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
            .sticky-filters.hidden { transform: translateY(-150%); }
            .filter-pill { 
              background: var(--glass); 
              backdrop-filter: blur(12px); 
              -webkit-backdrop-filter: blur(12px);
              border: 1px solid rgba(255, 255, 255, 0.5);
              border-radius: 24px; 
              padding: 12px; 
              box-shadow: 0 10px 30px -10px rgba(0,0,0,0.1); 
            }
            .container { max-width: 1400px; margin: 0 auto; padding: 0 20px; }
            
            .filter-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
            @media (min-width: 900px) { .filter-grid { grid-template-columns: 2.2fr 1fr 1fr 1fr 1fr 1fr 1fr 1.2fr; } }
            
            .sort-group { display: flex; gap: 4px; width: 100%; }
            .btn-sort-dir { 
              width: 48px; 
              height: 48px; 
              display: flex; 
              align-items: center; 
              justify-content: center; 
              background: #fff; 
              border: 1px solid #e2e8f0; 
              border-radius: 18px; 
              color: var(--secondary); 
              cursor: pointer; 
              transition: all 0.4s; 
              flex-shrink: 0;
            }
            .btn-sort-dir:hover { border-color: var(--primary); color: var(--primary); transform: translateY(-4px); }
            .btn-sort-dir.active { background: var(--primary); color: #fff; border-color: var(--primary); }
            .btn-sort-dir svg { width: 22px; height: 22px; transition: transform 0.3s; }
            .btn-sort-dir.desc svg { transform: rotate(180deg); }
            
            .filter-item { position: relative; }
            .filter-item { position: relative; width: 100%; }
            .filter-item input { 
              width: 100%; 
              padding: 14px 18px; 
              border: 1px solid #e2e8f0; 
              border-radius: 18px; 
              font-family: inherit; 
              font-size: 0.95rem; 
              font-weight: 500; 
              color: var(--text); 
              background: #fff;
              box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
              outline: none; 
              transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); 
            }
            .filter-item input:hover { 
              border-color: var(--primary); 
              color: var(--primary);
              transform: translateY(-8px); 
              box-shadow: 0 20px 25px -5px rgba(239, 68, 68, 0.1); 
            }

            /* --- CUSTOM SELECT STYLES --- */
            .custom-select { position: relative; cursor: pointer; user-select: none; }
            .select-trigger {
              display: flex;
              align-items: center;
              justify-content: space-between;
              width: 100%; 
              padding: 14px 18px; 
              border: 1px solid #e2e8f0; 
              border-radius: 18px; 
              font-size: 0.95rem; 
              font-weight: 500; 
              color: var(--text); 
              background: #fff;
              box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
              transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .select-trigger:hover {
              border-color: var(--primary); 
              color: var(--primary);
              transform: translateY(-8px); 
              box-shadow: 0 20px 25px -5px rgba(239, 68, 68, 0.1);
            }
            .custom-select.active .select-trigger { border-color: var(--primary); transform: translateY(-8px); }
            
            .select-trigger svg { width: 18px; height: 18px; color: var(--secondary); transition: transform 0.3s, color 0.3s; }
            .select-trigger:hover svg, .custom-select.active .select-trigger svg { color: var(--primary); }
            .custom-select.active .select-trigger svg { transform: rotate(180deg); }

            .options-list {
              position: absolute;
              top: calc(100% + 10px);
              left: 0;
              width: 100%;
              background: rgba(255, 255, 255, 0.95);
              backdrop-filter: blur(15px);
              -webkit-backdrop-filter: blur(15px);
              border: 1px solid rgba(255, 255, 255, 0.5);
              border-radius: 20px;
              box-shadow: 0 20px 40px rgba(0,0,0,0.15);
              z-index: 1100;
              max-height: 300px;
              overflow-y: auto;
              padding: 8px;
              opacity: 0;
              visibility: hidden;
              transform: translateY(20px);
              transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .custom-select.active .options-list { opacity: 1; visibility: visible; transform: translateY(0); }
            
            .option { 
              padding: 12px 16px; 
              border-radius: 12px; 
              font-size: 0.9rem; 
              font-weight: 600; 
              color: var(--text); 
              transition: all 0.2s; 
            }
            .option:hover { background: #fee2e2; color: var(--primary); }
            .option.selected { background: var(--primary); color: #fff; }

            /* --- MOBILE FILTERS REDESIGN --- */
            .mobile-filter-btn {
              display: none;
              position: fixed;
              bottom: 30px;
              right: 30px;
              width: 65px;
              height: 65px;
              border-radius: 50%;
              background: var(--primary);
              color: white;
              border: none;
              box-shadow: 0 10px 25px rgba(239, 68, 68, 0.4);
              z-index: 2000;
              cursor: pointer;
              align-items: center;
              justify-content: center;
              transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .mobile-filter-btn:active { transform: scale(0.9); }
            .mobile-filter-btn svg { width: 30px; height: 30px; stroke-width: 2.5; }

            .close-filters { display: none; }

            @media (max-width: 899px) {
              .mobile-filter-btn { display: flex; }
              .sticky-filters {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(255, 255, 255, 0.85);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                z-index: 1500;
                margin: 0;
                padding: 100px 20px 40px;
                opacity: 0;
                visibility: hidden;
                transform: translateX(100%);
                transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                overflow-y: auto;
              }
              .sticky-filters.show-mobile {
                opacity: 1;
                visibility: visible;
                transform: translateX(0);
              }
              .filter-pill {
                background: transparent;
                box-shadow: none;
                border: none;
                padding: 0;
                width: 100%;
              }
              .filter-grid {
                display: flex;
                flex-direction: column;
                gap: 15px;
              }
              .filter-item input, .select-trigger, .btn-clear {
                font-size: 1.1rem;
                padding: 18px 24px;
                border-radius: 24px;
                background: #fff;
                border: 2px solid #f1f5f9;
              }
              .filter-item input:hover, .select-trigger:hover, .btn-clear:hover {
                transform: none;
              }
              .close-filters {
                position: absolute;
                top: 30px;
                right: 30px;
                width: 50px;
                height: 50px;
                border-radius: 50%;
                background: #f1f5f9;
                color: var(--text);
                border: none;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
              }
              .sticky-filters.hidden { transform: translateX(100%); }
            }

            .options-list::-webkit-scrollbar { width: 6px; }
            .options-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
            
            .btn-clear {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              padding: 14px;
              background: #f1f5f9;
              color: var(--secondary);
              border: 1px solid transparent;
              border-radius: 18px;
              font-family: 'Outfit', sans-serif;
              font-weight: 700;
              font-size: 0.85rem;
              text-transform: uppercase;
              letter-spacing: 1px;
              cursor: pointer;
              transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); 
              white-space: nowrap;
            }
            .btn-clear:hover { 
              background: var(--primary); 
              color: #fff; 
              transform: translateY(-8px); 
              box-shadow: 0 20px 25px -5px rgba(239, 68, 68, 0.3);
            }
            .btn-clear svg { width: 16px; height: 16px; }
            
            .results-info { margin: 30px 0 20px; font-size: 0.9rem; font-weight: 700; color: var(--secondary); text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.8; }
            
            .inventory-grid { display: grid; grid-template-columns: 1fr; gap: 25px; margin-bottom: 80px; }
            @media (min-width: 640px) { .inventory-grid { grid-template-columns: repeat(2, 1fr); } }
            @media (min-width: 1024px) { .inventory-grid { grid-template-columns: repeat(3, 1fr); } }
            
            .vehicle-card { background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #e8ecf1; transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1); display: flex; flex-direction: column; position: relative; }
            .vehicle-card:hover { transform: translateY(-8px) scale(1.01); box-shadow: 0 20px 40px rgba(0,0,0,0.12), 0 4px 10px rgba(0,0,0,0.06); border-color: #d1d5db; }
            .card-img-link { text-decoration: none; color: inherit; display: flex; flex-direction: column; flex: 1; }
            .card-badge-featured { position: absolute; top: 12px; left: 12px; background: var(--primary); color: #fff; font-size: 0.65rem; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 4px 10px; border-radius: 999px; }
            .card-actions { display: flex; gap: 8px; padding: 0 20px 20px; margin-top: auto; }
            .btn-wa { display: inline-flex; align-items: center; gap: 6px; background: #25D366; color: #fff; padding: 12px 14px; border-radius: 14px; font-weight: 700; font-size: 0.78rem; text-decoration: none; transition: all 0.3s; white-space: nowrap; }
            .btn-wa:hover { background: #1ebe5c; transform: translateY(-2px); }
            
            .card-img-container { width: 100%; aspect-ratio: 4/3; background: #eee; position: relative; overflow: hidden; }
            .card-img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1); }
            .vehicle-card:hover .card-img { transform: scale(1.1); }
            
            .card-body { padding: 20px 20px 12px; flex: 1; display: flex; flex-direction: column; }
            .card-tag { font-family: 'Outfit', sans-serif; font-size: 0.75rem; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px; min-height: 1.1em; }
            .card-title { font-size: 1.4rem; font-weight: 800; color: #1e293b; text-transform: uppercase; line-height: 1.1; margin-bottom: 10px; height: 3.1rem; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; letter-spacing: -0.5px; }

            .card-price-row { display: flex; align-items: baseline; gap: 8px; margin-top: auto; }
            .card-price { font-size: 1.7rem; font-weight: 900; color: #1e293b; font-family: 'Outfit'; letter-spacing: -1px; }
            .card-currency { font-size: 1rem; font-weight: 800; color: var(--primary); text-transform: uppercase; }
            .card-dp { font-size: 0.95rem; font-weight: 600; color: var(--secondary); margin-top: 2px; }

            .card-specs { display: flex; gap: 20px; margin: 14px 0; padding-top: 14px; border-top: 1px solid #f1f5f9; }
            .mini-spec { font-size: 0.8rem; font-weight: 600; color: var(--secondary); display: flex; align-items: center; gap: 6px; }
            .mini-spec svg { opacity: 0.7; width: 14px; height: 14px; }
            
            .btn-view { flex: 1; padding: 12px 16px; background: #1e293b; color: #fff; text-align: center; border-radius: 14px; font-weight: 800; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 1.5px; transition: all 0.3s; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-decoration: none; display: flex; align-items: center; justify-content: center; }
            .vehicle-card:hover .btn-view { background: var(--primary); box-shadow: 0 10px 15px rgba(239, 68, 68, 0.3); }
            
            .no-results { text-align: center; padding: 120px 20px; display: none; }
            .no-results h3 { font-family: 'Outfit'; font-size: 2rem; color: #cbd5e1; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; }
          </style>
        </head>
        <body>
          <button class="mobile-filter-btn" onclick="toggleMobileFilters()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>

           <div class="header">
              <div class="container" style="text-align:center;">
                 <span class="header-label">Catálogo Exclusive</span>
                 <h1>${dealerName}</h1>
             </div>
           </div>
          
          <div class="sticky-filters" id="stickyFilters">
            <button class="close-filters" onclick="toggleMobileFilters()">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <div class="container">
              <div class="filter-pill">
                <div class="filter-grid">
                  <div class="filter-item"><input type="text" id="searchInput" placeholder="Buscar vehículo..." oninput="filterInventory()"></div>
                  
                  <!-- Marca -->
                  <div class="filter-item">
                    <div class="custom-select" id="brandSelect">
                      <input type="hidden" id="brandFilter" value="">
                      <div class="select-trigger" onclick="toggleDropdown('brandSelect')">
                        <span class="trigger-text">Marca</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                      </div>
                      <div class="options-list">
                        <div class="option" onclick="selectOption('brandSelect', '', 'Marca')">Marca</div>
                        ${[...new Set(catalogInventory.map(v => (v.marca || '').toUpperCase()).filter(Boolean))].sort().map(b => `<div class="option" onclick="selectOption('brandSelect', '${b}', '${b}')">${b}</div>`).join('')}
                      </div>
                    </div>
                  </div>

                  <!-- Modelo (Cascading) -->
                  <div class="filter-item">
                    <div class="custom-select" id="modelSelect">
                      <input type="hidden" id="modelFilter" value="">
                      <div class="select-trigger" onclick="toggleDropdown('modelSelect')">
                        <span class="trigger-text">Modelo</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                      </div>
                      <div class="options-list" id="modelOptions">
                        <div class="option" onclick="selectOption('modelSelect', '', 'Modelo')">Modelo</div>
                      </div>
                    </div>
                  </div>

                  <!-- Año -->
                  <div class="filter-item">
                    <div class="custom-select" id="yearSelect">
                      <input type="hidden" id="yearFilter" value="">
                      <div class="select-trigger" onclick="toggleDropdown('yearSelect')">
                        <span class="trigger-text">Año</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                      </div>
                      <div class="options-list">
                        <div class="option" onclick="selectOption('yearSelect', '', 'Año')">Año</div>
                        ${Array.from(new Set(inventory.map(v => v.anio_num))).filter(y => y > 0).sort((a, b) => b - a).map(y => `<div class="option" onclick="selectOption('yearSelect', '${y}', '${y}')">${y}</div>`).join('')}
                      </div>
                    </div>
                  </div>

                  <!-- Precio -->
                  <div class="filter-item">
                    <div class="custom-select" id="priceSelect">
                      <input type="hidden" id="priceFilter" value="">
                      <div class="select-trigger" onclick="toggleDropdown('priceSelect')">
                        <span class="trigger-text">Precio</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                      </div>
                      <div class="options-list">
                        <div class="option" onclick="selectOption('priceSelect', '', 'Precio')">Precio</div>
                        <div class="option" onclick="selectOption('priceSelect', '0-500000', '≤ RD$ 500k')">≤ RD$ 500k</div>
                        <div class="option" onclick="selectOption('priceSelect', '500000-1000000', 'RD$ 500k - 1M')">RD$ 500k - 1M</div>
                        <div class="option" onclick="selectOption('priceSelect', '1000000-2000000', 'RD$ 1M - 2M')">RD$ 1M - 2M</div>
                        <div class="option" onclick="selectOption('priceSelect', '2000000-99999999', 'RD$ 2M+')">RD$ 2M+</div>
                      </div>
                    </div>
                  </div>

                  <!-- Asientos -->
                  <div class="filter-item">
                    <div class="custom-select" id="seatsSelect">
                      <input type="hidden" id="seatsFilter" value="">
                      <div class="select-trigger" onclick="toggleDropdown('seatsSelect')">
                        <span class="trigger-text">Asientos</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                      </div>
                      <div class="options-list">
                        <div class="option" onclick="selectOption('seatsSelect', '', 'Asientos')">Asientos</div>
                        <div class="option" onclick="selectOption('seatsSelect', '2', '2 Filas')">2 Filas</div>
                        <div class="option" onclick="selectOption('seatsSelect', '3', '3 Filas')">3 Filas</div>
                      </div>
                    </div>
                  </div>

                  <!-- Tracción (Dynamic) -->
                  <div class="filter-item">
                    <div class="custom-select" id="tractionSelect">
                      <input type="hidden" id="tractionFilter" value="">
                      <div class="select-trigger" onclick="toggleDropdown('tractionSelect')">
                        <span class="trigger-text">Tracción</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                      </div>
                      <div class="options-list">
                        <div class="option" onclick="selectOption('tractionSelect', '', 'Tracción')">Tracción</div>
                        <div class="option" onclick="selectOption('tractionSelect', 'FWD', 'FWD')">FWD</div>
                        <div class="option" onclick="selectOption('tractionSelect', 'RWD', 'RWD')">RWD</div>
                        <div class="option" onclick="selectOption('tractionSelect', 'AWD', 'AWD')">AWD</div>
                        <div class="option" onclick="selectOption('tractionSelect', '4X4', '4x4')">4x4</div>
                      </div>
                    </div>
                  </div>

                  <!-- Ordenamiento -->
                  <div class="filter-item">
                    <div class="sort-group">
                      <div class="custom-select" id="sortSelect" style="flex: 1;">
                        <input type="hidden" id="sortFilter" value="marca">
                        <div class="select-trigger" onclick="toggleDropdown('sortSelect')">
                          <span class="trigger-text">Marca (A-Z)</span>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </div>
                        <div class="options-list">
                          <div class="option selected" onclick="selectOption('sortSelect', 'marca', 'Marca (A-Z)')">Marca (A-Z)</div>
                          <div class="option" onclick="selectOption('sortSelect', 'anio', 'Año')">Año</div>
                          <div class="option" onclick="selectOption('sortSelect', 'precio', 'Precio')">Precio</div>
                          <div class="option" onclick="selectOption('sortSelect', 'recientes', 'Recientes')">Recientes</div>
                        </div>
                      </div>
                      <button id="sortDirBtn" class="btn-sort-dir desc" onclick="toggleSortDirection()" title="Cambiar dirección">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                      </button>
                    </div>
                  </div>
                  
                  <button class="btn-clear" onclick="resetFilters()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
                    Limpiar
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div class="container">
            <div class="results-info">
               <span id="resultsCount">${catalogInventory.length}</span> Unidades en stock
            </div>

            <div id="inventoryGrid" class="inventory-grid">
              ${catalogInventory.map((v, idx) => {
                const vehicleDetailUrl = `https://carbotsystem.com/inventario/${dealerSlugForCatalog}/vehiculo/${v.id}`;
                const mileageDisplay = Number(v.mileage) > 0
                  ? `${Number(v.mileage).toLocaleString()} ${v.unit || 'Km'}`
                  : 'Consultar';
                const inicialDisplay = (v.inicial_calculado && v.inicial_calculado !== 'N/A')
                  ? v.inicial_calculado.replace('INICIAL: ', '')
                  : 'Consultar';
                const waMsg = dealerPhone
                  ? `https://wa.me/${dealerPhone}?text=${encodeURIComponent(`Hola, me interesa el vehículo:\n${v.anio || ''} ${v.marca || ''} ${v.modelo || ''} ${v.edicion || ''}\nque vi en el catálogo de ${dealerName}.\n¿Podrían brindarme más información?`)}`
                  : null;
                const cardTagParts = [
                  v.anio || '',
                  (v.edicion && v.edicion !== '-') ? v.edicion : '',
                  (v.color && v.color !== '-') ? v.color : '',
                  (v.tipo_vehiculo && v.tipo_vehiculo !== '-') ? v.tipo_vehiculo : '',
                ].filter(Boolean);
                return `
                <div class="vehicle-card"
                   style="animation: fadeIn 0.6s ease-out forwards; animation-delay: ${idx * 0.05}s"
                   data-brand="${(v.marca || '').toUpperCase()}"
                   data-model="${(v.modelo || '').toUpperCase()}"
                   data-year="${v.anio_num}"
                   data-price="${v.precio_num}"
                   data-price-ref="${v.precio_dop_ref}"
                   data-seats="${v.asientos_num}"
                   data-traction="${(v.traccion || '').toUpperCase()}"
                   data-text="${v.nombre.toLowerCase()}">
                  <a href="${vehicleDetailUrl}" class="card-img-link">
                  <div class="card-img-container">
                    ${v.imagen
                      ? `<img src="${v.imagen}" class="card-img" loading="lazy">`
                      : `<img src="${logoUrl || 'https://via.placeholder.com/600x450?text=Sin+Foto'}" class="card-img" style="object-fit:contain;background:#f8fafc;padding:12%;" loading="lazy">`}
                    ${v.destacado ? '<div class="card-badge-featured">Destacado</div>' : ''}
                  </div>
                  <div class="card-body">
                    <div class="card-tag">${cardTagParts.join(' • ')}</div>
                    <div class="card-title">${v.marca || ''} ${v.modelo || ''}</div>

                    <div class="card-specs">
                      <div class="mini-spec">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                        ${(v.transmision || '-').split(' ')[0]}
                      </div>
                      <div class="mini-spec">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 1 0 0 14A7 7 0 0 0 12 2zm0 0v2m0 10v2m10-7h-2M4 12H2"/></svg>
                        ${mileageDisplay}
                      </div>
                    </div>

                    <div class="card-price-row">
                      <span class="card-currency">${v.precio.split(' ')[0]}</span>
                      <span class="card-price">${v.precio.split(' ')[1] || v.precio}</span>
                    </div>
                    <div class="card-dp">Inicial: ${inicialDisplay}</div>
                  </div>
                  </a>
                  <div class="card-actions">
                    <a href="${vehicleDetailUrl}" class="btn-view">Ver Detalles</a>
                    ${waMsg ? `<a href="${waMsg}" target="_blank" class="btn-wa" rel="noopener">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                      WhatsApp
                    </a>` : ''}
                  </div>
                </div>`;
              }).join('')}
            </div>
            
            <div id="noResults" class="no-results">
              <h3>Sin coincidencias</h3>
              <p style="color: #94a3b8; font-weight: 500;">Intenta ajustando tus criterios de búsqueda.</p>
            </div>
          </div>
          
          <script>
            let sortDir = -1; // -1 for DESC, 1 for ASC

            function toggleMobileFilters() {
              const panel = document.getElementById('stickyFilters');
              panel.classList.toggle('show-mobile');
              document.body.style.overflow = panel.classList.contains('show-mobile') ? 'hidden' : '';
            }

            function toggleSortDirection() {
              sortDir *= -1;
              const btn = document.getElementById('sortDirBtn');
              if (sortDir === 1) {
                btn.classList.remove('desc');
              } else {
                btn.classList.add('desc');
              }
              filterInventory();
            }

            function filterInventory() {
              const search = document.getElementById('searchInput').value.toLowerCase();
              const brand = document.getElementById('brandFilter').value.toUpperCase();
              const model = document.getElementById('modelFilter').value.toUpperCase();
              const year = parseInt(document.getElementById('yearFilter').value);
              const priceRange = document.getElementById('priceFilter').value;
              const seats = document.getElementById('seatsFilter').value;
              const traction = document.getElementById('tractionFilter').value.toUpperCase();
              const sortField = document.getElementById('sortFilter').value;
              const cards = Array.from(document.querySelectorAll('.vehicle-card'));
              let visibleCount = 0;
              
              let maxPriceSearch = Infinity;
              let minPriceSearch = 0;
              if (priceRange) {
                const parts = priceRange.split('-').map(Number);
                minPriceSearch = parts[0];
                maxPriceSearch = parts[1] || parts[0];
              }

              cards.forEach(card => {
                const cText = card.dataset.text;
                const cBrand = card.dataset.brand;
                const cModel = card.dataset.model.toUpperCase();
                const cYear = parseInt(card.dataset.year);
                const cPriceRef = parseInt(card.dataset.priceRef); // Use normalized DOP price
                const cSeats = card.dataset.seats;
                const cTraction = card.dataset.traction.toUpperCase();
                
                let matches = true;
                
                if (search && !cText.includes(search)) matches = false;
                if (brand && cBrand !== brand) matches = false;
                if (model && cModel !== model) matches = false;
                if (year && cYear > year) matches = false; // Show target year and below
                if (seats && cSeats !== seats) matches = false;
                if (priceRange && cPriceRef > maxPriceSearch) matches = false; // Show target price and below

                if (traction) {
                   if (traction === '4X4' || traction === 'AWD' || traction === '4WD') {
                      if (!cTraction.includes('4X4') && !cTraction.includes('AWD') && !cTraction.includes('4WD')) matches = false;
                   } else {
                      if (cTraction !== traction) matches = false;
                   }
                }
                
                if (matches) { 
                  card.style.display = 'flex'; 
                  visibleCount++;
                  
                  // Calculate dynamic score for sorting
                  let score = 0;
                  if (year && cYear === year) score += 20000; // High bonus for exact year
                  if (priceRange && cPriceRef >= minPriceSearch && cPriceRef <= maxPriceSearch) score += 10000; // High bonus for price in target range
                  
                  // Tie-breakers: Newer cars and slightly more expensive (closer to target) preferred
                  score += (cYear * 10); 
                  score += (cPriceRef / 100000); 
                  
                  card.dataset.score = score;
                } else { 
                  card.style.display = 'none'; 
                }
              });

              // Apply sorting to the visible cards
              const grid = document.getElementById('inventoryGrid');
              const sortedCards = [...cards].sort((a, b) => {
                let valA, valB;
                
                if (sortField === 'recientes') {
                   // Newer is higher index/score by default from server sort, but here we use anio_num as proxy or original order
                   valA = parseInt(a.dataset.year || 0);
                   valB = parseInt(b.dataset.year || 0);
                } else if (sortField === 'precio') {
                   valA = parseInt(a.dataset.priceRef || 0);
                   valB = parseInt(b.dataset.priceRef || 0);
                } else if (sortField === 'marca') {
                   valA = (a.dataset.brand || '').trim().toUpperCase();
                   valB = (b.dataset.brand || '').trim().toUpperCase();
                } else { // anio
                   valA = parseInt(a.dataset.year || 0);
                   valB = parseInt(b.dataset.year || 0);
                }
                
                // sortDir: -1 means higher value first (Down Arrow = Descending??)
                // Wait: User said: "arriba es el mas nuevo o mayor y hacia abajo el menor"
                // So Arrow Up (dir: 1) -> DESC (Highest first)
                // Arrow Down (dir: -1) -> ASC (Lowest first)
                
                if (sortField === 'marca') {
                   // For strings, Dir 1 (which acts like 'DESC' for numbers) will mean A-Z here manually mapped
                   // because A-Z is usually the default. Let's make sortDir === 1 mean A-Z.
                   if (sortDir === 1) {
                     return valA.localeCompare(valB);
                   } else {
                     return valB.localeCompare(valA);
                   }
                } else {
                   if (sortDir === 1) { // Up = DESC
                     return valB - valA;
                   } else { // Down = ASC
                     return valA - valB;
                   }
                }
              });

              sortedCards.forEach(card => grid.appendChild(card));
              
              document.getElementById('resultsCount').innerText = visibleCount;
              document.getElementById('noResults').style.display = visibleCount === 0 ? 'block' : 'none';
            }

            let lastScrollTop = 0;
            window.addEventListener('scroll', function() {
              if (window.innerWidth < 900) return; // Skip for mobile
              const st = window.pageYOffset || document.documentElement.scrollTop;
              const filterBar = document.querySelector('.sticky-filters');
              if (st > lastScrollTop && st > 150) {
                filterBar.classList.add('hidden');
                closeAllDropdowns();
              } else {
                filterBar.classList.remove('hidden');
              }
              lastScrollTop = st <= 0 ? 0 : st;
            }, false);

            function toggleDropdown(id) {
              const el = document.getElementById(id);
              const isActive = el.classList.contains('active');
              closeAllDropdowns();
              if (!isActive) el.classList.add('active');
            }

            function closeAllDropdowns() {
              document.querySelectorAll('.custom-select').forEach(d => d.classList.remove('active'));
            }

            function selectOption(selectId, value, label) {
              const selectEl = document.getElementById(selectId);
              const input = selectEl.querySelector('input[type="hidden"]');
              const triggerText = selectEl.querySelector('.trigger-text');
              
              input.value = value;
              triggerText.innerText = label;
              
              selectEl.querySelectorAll('.option').forEach(opt => {
                opt.classList.remove('selected');
                if (opt.innerText === label) opt.classList.add('selected');
              });
              
              if (selectId === 'brandSelect') {
                updateModelOptions(value);
              }
              
              closeAllDropdowns();
              filterInventory();
            }

            function updateModelOptions(brand) {
              const modelSelect = document.getElementById('modelSelect');
              const modelOptions = document.getElementById('modelOptions');
              const modelInput = modelSelect.querySelector('input[type="hidden"]');
              const modelTriggerText = modelSelect.querySelector('.trigger-text');
              
              // Reset model
              modelInput.value = '';
              modelTriggerText.innerText = 'Modelo';
              
              if (!brand) {
                modelOptions.innerHTML = \`<div class="option" onclick="selectOption('modelSelect', '', 'Modelo')">Modelo</div>\`;
                return;
              }

              const cards = Array.from(document.querySelectorAll('.vehicle-card'));
              const models = Array.from(new Set(cards.filter(c => c.dataset.brand === brand).map(c => c.dataset.model))).sort();
              
              modelOptions.innerHTML = \`<div class="option" onclick="selectOption('modelSelect', '', 'Modelo')">Modelo</div>\` +
                models.map(m => \`<div class="option" onclick="selectOption('modelSelect', '\${m}', '\${m}')">\${m}</div>\`).join('');
            }

            // Close dropdowns on outside click
            document.addEventListener('click', (e) => {
              if (!e.target.closest('.custom-select')) closeAllDropdowns();
            });

            function resetFilters() {
              document.getElementById('searchInput').value = '';
              
              // Reset custom selects
              selectOption('brandSelect', '', 'Marca');
              selectOption('yearSelect', '', 'Año');
              selectOption('priceSelect', '', 'Precio');
              selectOption('seatsSelect', '', 'Asientos');
              selectOption('tractionSelect', '', 'Tracción');
              selectOption('sortSelect', 'recientes', 'Recientes');
              sortDir = -1;
              document.getElementById('sortDirBtn').classList.add('desc');
              
              filterInventory();
            }
          </script>
        </body>
        </html>
      `;
      res.set('Content-Type', 'text/html');
      return res.send(html);
    }

    // Default JSON response if not html mode (though it usually is)
    return res.json({
      dealer: matchedDealerId,
      total: inventory.length,
      inventory: inventory
    });

  } catch (error) {
    console.error("❌ Error en inventarioIA:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ──────────────────────────────────────────────────────────────────
// inventorySearch — integración Cloy (soporte postventa)
// POST /inventorySearch  { dealer_id, filtros? }
// Header: Authorization: Bearer <cloy_api_key del dealer>
// Devuelve { total, vehiculos }. Si un vehículo está "Vendido", incluye
// comprador { nombre, telefono, cedula, correo, fecha_venta }.
// ──────────────────────────────────────────────────────────────────
function timingSafeEqualStr(a, b) {
  const bufA = crypto.createHash('sha256').update(String(a || '')).digest();
  const bufB = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(bufA, bufB);
}

function toE164(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.startsWith('+')) return s;
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits ? `+${digits}` : null;
}

exports.inventorySearch = onRequest({ cors: true, secrets: [supabaseServiceKey] }, async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const bearerToken = match ? match[1].trim() : null;

    const dealerId = req.body?.dealer_id;
    if (!dealerId) {
      return res.status(400).json({ error: "Falta 'dealer_id' en el body." });
    }
    if (!bearerToken) {
      return res.status(401).json({ error: 'Falta Authorization: Bearer <api_key>.' });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, supabaseServiceKey.value());

    const { data: keyRow, error: keyErr } = await supabaseAdmin
      .from('dealer_api_keys')
      .select('cloy_api_key')
      .eq('dealer_id', dealerId)
      .maybeSingle();

    if (keyErr || !keyRow || !timingSafeEqualStr(bearerToken, keyRow.cloy_api_key)) {
      return res.status(401).json({ error: 'API key inválida para este dealer_id.' });
    }

    const filtros = req.body?.filtros || {};

    let query = supabaseAdmin
      .from('vehiculos')
      .select('*')
      .eq('dealer_id', dealerId)
      .is('deleted_at', null);

    if (filtros.id) query = query.eq('id', filtros.id);
    if (filtros.chasis_vin) query = query.ilike('chasis_vin', filtros.chasis_vin);
    if (filtros.marca) query = query.ilike('marca', `%${filtros.marca}%`);
    if (filtros.modelo) query = query.ilike('modelo', `%${filtros.modelo}%`);
    if (filtros.estado) query = query.eq('estado', filtros.estado);

    // Búsqueda por identidad del comprador (caso de uso principal: soporte postventa
    // recibe teléfono/cédula del cliente y necesita ubicar su vehículo).
    if (filtros.telefono || filtros.cedula || filtros.correo) {
      let buyerQuery = supabaseAdmin.from('compradores').select('vehiculo_id').eq('dealer_id', dealerId);
      if (filtros.telefono) buyerQuery = buyerQuery.eq('telefono', toE164(filtros.telefono));
      if (filtros.cedula) buyerQuery = buyerQuery.eq('cedula', filtros.cedula);
      if (filtros.correo) buyerQuery = buyerQuery.ilike('correo', filtros.correo);

      const { data: buyerRows, error: buyerErr } = await buyerQuery;
      if (buyerErr) throw buyerErr;

      const vehicleIds = [...new Set((buyerRows || []).map(r => r.vehiculo_id))];
      if (vehicleIds.length === 0) {
        return res.status(200).json({ total: 0, vehiculos: [] });
      }
      query = query.in('id', vehicleIds);
    }

    const { data: vehiculos, error: vErr } = await query;
    if (vErr) throw vErr;

    if (!vehiculos || vehiculos.length === 0) {
      return res.status(200).json({ total: 0, vehiculos: [] });
    }

    // Traer compradores solo para los vendidos de este batch (evita queries de más).
    const soldIds = vehiculos.filter(v => v.estado === 'Vendido').map(v => v.id);
    let buyersByVehicle = new Map();
    if (soldIds.length > 0) {
      const { data: buyers, error: bErr } = await supabaseAdmin
        .from('compradores')
        .select('vehiculo_id, nombre, telefono, cedula, correo, fecha_venta')
        .in('vehiculo_id', soldIds)
        .order('fecha_venta', { ascending: false });
      if (bErr) throw bErr;
      (buyers || []).forEach(b => {
        if (!buyersByVehicle.has(b.vehiculo_id)) buyersByVehicle.set(b.vehiculo_id, b);
      });
    }

    const result = vehiculos.map(v => {
      const out = { ...v };
      delete out.deleted_at;
      if (v.estado === 'Vendido' && buyersByVehicle.has(v.id)) {
        const b = buyersByVehicle.get(v.id);
        out.comprador = {
          nombre: b.nombre,
          telefono: b.telefono || null,
          cedula: b.cedula || null,
          correo: b.correo || null,
          fecha_venta: b.fecha_venta,
        };
      }
      return out;
    });

    return res.status(200).json({ total: result.length, vehiculos: result });
  } catch (error) {
    console.error('❌ Error en inventorySearch:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 2. Función para listar Dealers (Para que el bot sepa quién existe)
exports.availableDealers = onRequest({ cors: true }, async (req, res) => {
  try {
    console.log("🔍 availableDealers: Buscando en 'Dealers'...");
    let dealersSnap = await db.collection("Dealers").get();

    if (dealersSnap.empty) {
      console.log("ℹ️ 'Dealers' vacío, intentando con 'dealers'...");
      dealersSnap = await db.collection("dealers").get();
    }

    const dealersList = [];
    dealersSnap.forEach(doc => {
      const data = doc.data();
      dealersList.push({
        id: doc.id,
        nombre: data.nombre || data.display_name || doc.id,
        slug: data.slug || "",
        location_id: data.locationId || doc.id
      });
    });

    console.log(`✅ ${dealersList.length} dealers encontrados.`);
    res.json({
      count: dealersList.length,
      dealers: dealersList
    });
  } catch (error) {
    console.error("❌ Error en availableDealers:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Trigger: Generar Link de Bot al crear o actualizar Dealer
// exports.generateDealerBotLink = onDocumentWritten("Dealers/{dealerId}", async (event) => {
//   const dealerId = event.params.dealerId;
//   const change = event.data;

//   if (!change || !change.after.exists) {
//     console.log(`ℹ️ Documento ${dealerId} eliminado o no existe. Nada que procesar.`);
//     return;
//   }

//   const data = change.after.data();
//   const rawName = data.display_name || data.nombre || dealerId;
//   const slug = slugify(rawName);

//   console.log(`🤖 [Trigger] Procesando Dealer: ${dealerId} | Nombre: ${rawName} | Slug: ${slug}`);

//   try {
//     // 1. Guardar el slug en el propio Dealer para facilitar búsquedas
//     if (data.slug !== slug) {
//       await change.after.ref.set({ slug: slug }, { merge: true });
//       console.log(`✅ Slug '${slug}' actualizado en el documento del Dealer.`);
//     }

//     // 2. Crear el documento de configuración en la ruta: Dealers/{dealerId}/:DATA BOT RN/CONFIG
//     const botLink = `https://inventarioia-gzhz2ynksa-uc.a.run.app/?dealerID=${slug}`;
//     const shopLink = `https://inventarioia-gzhz2ynksa-uc.a.run.app/tienda?dealerID=${slug}`;

//     const botConfigRef = db.collection("Dealers").doc(dealerId).collection(":DATA BOT RN").doc("CONFIG");

//     await botConfigRef.set({
//       LINK_INVENTARIO_GHL: botLink,
//       LINK_TIENDA: shopLink,
//       dealer_id: dealerId,
//       dealer_name: rawName,
//       slug: slug,
//       status: "active",
//       updatedAt: admin.firestore.FieldValue.serverTimestamp()
//     });

//     console.log(`✅ Documentos generados exitosamente en Dealers/${dealerId}/:DATA BOT RN/CONFIG`);
//     console.log(`🔗 GHL Bot: ${botLink}`);
//     console.log(`🔗 Tienda: ${shopLink}`);

//   } catch (error) {
//   console.error(`❌ Error al procesar bot_link para ${dealerId}:`, error);
// }
// });

// 4. Función para inicializar todos los links de bots (Proactivo)
exports.initBotLinks = onRequest({ cors: true }, async (req, res) => {
  try {
    // Forzar IDs estandarizados (Slugs)
    const manualIds = [
      "dura-n-ferna-ndez-auto-srl",
      "gary-motors",
      "mi-dealer"
    ];

    const dealersRefs = await db.collection("Dealers").listDocuments();
    const allIds = new Set([...manualIds, ...dealersRefs.map(r => r.id)]);

    let count = 0;
    const processed = [];

    for (const dealerId of allIds) {
      const docRef = db.collection("Dealers").doc(dealerId);
      const docSnap = await docRef.get();
      const data = docSnap.exists ? docSnap.data() : {};

      // Intentar obtener un nombre válido
      const rawName = data.display_name || data.nombre || data.dealer_name || dealerId;
      const slug = slugify(rawName);

      console.log(`🤖 [Init] Procesando Dealer: ${dealerId} | Slug: ${slug}`);

      const botLink = `https://inventarioia-gzhz2ynksa-uc.a.run.app/?dealerID=${slug}`;
      const shopLink = `https://inventarioia-gzhz2ynksa-uc.a.run.app/tienda?dealerID=${slug}`;

      await db.collection("Dealers").doc(dealerId).collection(":DATA BOT RN").doc("CONFIG").set({
        LINK_INVENTARIO_GHL: botLink,
        LINK_TIENDA: shopLink,
        dealer_id: dealerId,
        dealer_name: rawName,
        slug: slug,
        status: "active",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // Actualizar el documento principal (Asegurar que NO sea phantom)
      await docRef.set({
        nombre: rawName.toUpperCase().includes('DURAN') ? "DURÁN FERNÁNDEZ AUTO S.R.L" : rawName,
        slug: slug,
        status: "active",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      count++;
      processed.push(dealerId);
    }
    res.json({ message: `✅ Se generaron links para ${count} documentos.`, processed: processed, status: "ok" });
  } catch (error) {
    console.error("❌ Error en initBotLinks:", error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Función de Limpieza: Elimina duplicados creados por error 
exports.cleanupDealers = onRequest({ cors: true }, async (req, res) => {
  try {
    const dealersRefs = await db.collection("Dealers").listDocuments();
    let deletedCount = 0;
    const deletedIds = [];

    for (const docRef of dealersRefs) {
      const dealerId = docRef.id;
      const docSnap = await docRef.get();
      const data = docSnap.exists ? docSnap.data() : {};

      // Criterios de limpieza:
      // 1. IDs de prueba hardcodeados
      // 1. IDs de prueba hardcodeados y el duplicado mal codificado específico
      const isTestId = [
        "DURAN-FERNANDEZ-AUTO-SRL",
        "MI-DEALER-TEST",
        "DURÃÓN FERNÃÁNDEZ AUTO S.R.L" // Specific targeting
      ].includes(dealerId);

      // 2. IDs con errores de codificación (caracteres raros)
      const hasEncodingError = /Ã|Â|Ã³/.test(dealerId);

      // 3. Documentos phantom sin data real
      const isPhantom = !docSnap.exists || (!data.nombre && !data.display_name && !data.email);

      if (isTestId || hasEncodingError || (isPhantom && dealerId !== "MI-DEALER" && dealerId !== "DURÁN FERNÁNDEZ AUTO S.R.L")) {
        console.log(`🗑️ Eliminando documento: ${dealerId}`);

        // Eliminar subcolecciones (:DATA BOT RN)
        const subDocs = await docRef.collection(":DATA BOT RN").get();
        for (const subDoc of subDocs.docs) {
          await subDoc.ref.delete();
        }

        await docRef.delete();
        deletedCount++;
        deletedIds.push(dealerId);
      }
    }

    res.json({
      message: `✅ Limpieza completada. Se eliminaron ${deletedCount} documentos.`,
      deletedIds: deletedIds,
      status: "ok"
    });
  } catch (error) {
    console.error("❌ Error en cleanupDealers:", error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Función de Migración (Para eliminar nivel 'items' definitivamente)
exports.migrarEstructura = onRequest({ cors: true }, async (req, res) => {
  try {
    const dealerId = req.query.dealer;
    if (!dealerId) return res.status(400).send("Falta ?dealer=NombreDealer");

    const batch = db.batch();
    let count = 0;

    // 1. Migrar de 'inventario' (nivel plano) a 'vehiculos'
    const currentSnap = await db.collection("Dealers").doc(dealerId).collection("inventario").get();
    currentSnap.forEach(docSnap => {
      const data = docSnap.data();
      const newRef = db.collection("Dealers").doc(dealerId).collection("vehiculos").doc(docSnap.id);
      batch.set(newRef, data);
      count++;
    });

    // 2. Migrar de 'inventario/items/items' (nivel antiguo) a 'vehiculos'
    const oldItemsSnap = await db.collection("Dealers").doc(dealerId).collection("inventario").doc("items").collection("items").get();
    oldItemsSnap.forEach(docSnap => {
      const data = docSnap.data();
      const newRef = db.collection("Dealers").doc(dealerId).collection("vehiculos").doc(docSnap.id);
      batch.set(newRef, data);
      count++;
    });

    if (count > 0) {
      await batch.commit();
      return res.send(`✅ Migración completada para ${dealerId}. Se movieron ${count} vehículos a la colección 'vehiculos'.`);
    } else {
      return res.send(`ℹ️ No se encontraron vehículos para migrar en ${dealerId}.`);
    }
  } catch (e) {
    res.status(500).send("Error: " + e.message);
  }
});

// --- GHL OAUTH2 INTEGRATION ---
// GHL_CLIENT_ID and GHL_CLIENT_SECRET are managed as Firebase secrets

exports.ghlAuthorize = onRequest({ cors: true, secrets: [ghlClientSecret, ghlClientId, supabaseServiceKey] }, (req, res) => {
  const CLIENT_ID = ghlClientId.value();
  const dealerId = req.query.dealerId || 'default';
  const scope = "contacts.readonly contacts.write documents_contracts/list.readonly documents_contracts/sendLink.write documents_contracts_template/list.readonly documents_contracts_template/sendLink.write locations.readonly users.readonly locations/customFields.readonly locations/customFields.write";
  const REDIRECT_URI = "https://lpiwkennlavpzisdvnnh.supabase.co/functions/v1/oauth-callback";

  const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${scope}&state=${dealerId}`;
  res.redirect(authUrl);
});

exports.ghlCallback = onRequest({ cors: true, secrets: [ghlClientSecret, ghlClientId, supabaseServiceKey] }, async (req, res) => {
  const code = req.query.code;
  const dealerId = req.query.state || 'default';
  if (!code) return res.status(400).send("Falta el código de autorización");

  const CLIENT_ID = ghlClientId.value();
  const CLIENT_SECRET = ghlClientSecret.value();
  const REDIRECT_URI = "https://lpiwkennlavpzisdvnnh.supabase.co/functions/v1/oauth-callback";

  console.log("--- GHL OAuth Diagnostic ---");
  console.log("CLIENT_ID length:", CLIENT_ID ? CLIENT_ID.length : 0);
  console.log("CLIENT_SECRET length:", CLIENT_SECRET ? CLIENT_SECRET.length : 0);
  console.log("HAS_CODE:", !!code);
  console.log("REDIRECT_URI:", REDIRECT_URI);
  console.log("DEALER_ID:", dealerId);

  try {
    const response = await fetch('https://services.leadconnectorhq.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
        user_type: 'Location'
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("❌ GHL Token Exchange Failed:", data);
      throw new Error(data.error_description || data.message || "Error intercambiando token");
    }

    console.log("--- GHL Callback DATA (Token Response) ---");
    console.log(JSON.stringify(data));
    console.log("--- GHL Callback REQ QUERY ---");
    console.log(JSON.stringify(req.query));

    // Intentar extraer locationId/companyId de múltiples fuentes
    const locationId = data.locationId || data.location_id || data.companyId || req.query.locationId || req.query.location_id || req.query.companyId;
    const userId = data.userId || data.user_id || req.query.userId || req.query.user_id;

    if (!locationId) {
      console.error("❌ GHL Callback: No locationId/companyId found anywhere.");
      console.error("Keys in data:", Object.keys(data));
      console.error("Keys in query:", Object.keys(req.query));
      return res.status(400).send(`Error: No se encontró el ID de la ubicación o compañía. Recibido: ${JSON.stringify(data)}`);
    }

    console.log("✅ Conexión establecida para:", locationId, "Usuario:", userId);

    // Guardar tokens en Supabase
    const supabaseAdmin = createClient(SUPABASE_URL, supabaseServiceKey.value());
    const dealerUuid = toUuid(dealerId);
    const expiresAt = new Date(Date.now() + (data.expires_in * 1000));

    const { error: sbError } = await supabaseAdmin
      .from('dealers')
      .update({
        ghl_access_token: data.access_token,
        ghl_refresh_token: data.refresh_token,
        ghl_token_expires_at: expiresAt.toISOString(),
        ghl_location_id: locationId,
        location_id: locationId, // Also update the general location_id if it's used elsewhere
        updated_at: new Date().toISOString()
      })
      .eq('id', dealerUuid);

    if (sbError) {
      console.error("❌ Error guardando tokens en Supabase:", sbError);
      // Fallback a Firestore si falla Supabase (opcional, pero mantengamos compatibilidad por ahora)
    } else {
      console.log("✅ Tokens guardados en Supabase para:", dealerUuid);
    }

    // Función auxiliar para limpiar objetos de valores undefined para Firestore
    const cleanData = (obj) => {
      const newObj = {};
      Object.keys(obj).forEach(key => {
        if (obj[key] !== undefined && obj[key] !== null) {
          newObj[key] = obj[key];
        }
      });
      return newObj;
    };

    // Mantener Firestore por ahora como backup o si el sistema lo requiere
    const tokenRef = admin.firestore().collection("Dealers").doc(dealerId).collection("llave_ghl").doc("config");
    await tokenRef.set(cleanData({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      expires_at: admin.firestore.Timestamp.fromDate(expiresAt),
      locationId: locationId,
      companyId: data.companyId,
      userId: userId,
      userType: data.userType,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }));

    res.send(`
      <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
        <h1 style="color: #4CAF50;">✅ ¡Conexión Exitosa con GoHighLevel!</h1>
        <p>Ya puedes cerrar esta ventana y volver al sistema.</p>
        <button onclick="window.close()" style="padding: 10px 20px; cursor: pointer;">Cerrar Ventana</button>
      </div>
    `);
  } catch (error) {
    console.error("❌ Error en GHL Callback:", error);
    res.status(500).send("Error procesando la conexión con GHL: " + error.message);
  }
});

// Helper para obtener/refrescar token
// Helper para obtener/refrescar token por Dealer (Migrado a Supabase)
async function getGHLConfig(dealerId, clientId, clientSecret, serviceKey) {
  if (!dealerId) throw new Error("Dealer ID es requerido");
  if (!clientId || !clientSecret || !serviceKey) {
    throw new Error("GHL Client ID, Secret y Supabase Service Key son requeridos");
  }

  const supabaseAdmin = createClient(SUPABASE_URL, serviceKey);

  // Intentar obtener por ID (Slug o UUID)
  const dealerUuid = toUuid(dealerId);
  console.log(`📡 Buscando Dealer en Supabase: ${dealerId} (UUID: ${dealerUuid})`);

  let { data: dealer, error } = await supabaseAdmin
    .from('dealers')
    .select('*')
    .or(`id.eq.${dealerUuid},ghl_location_id.eq.${dealerId},location_id.eq.${dealerId}`)
    .maybeSingle();

  if (error || !dealer) {
    console.warn(`⚠️ No se encontró dealer en Supabase por ID/UUID/GHL_ID: ${dealerId}. Error: ${error?.message}`);
    // Fallback: buscar por nombre si dealerId es un slug-pero-no-exacto
    const { data: dealerByName } = await supabaseAdmin
      .from('dealers')
      .select('*')
      .ilike('nombre', `%${dealerId}%`)
      .limit(1)
      .maybeSingle();

    if (dealerByName) {
      dealer = dealerByName;
    } else {
      throw new Error(`GHL no está conectado para este Dealer (${dealerId}) en Supabase`);
    }
  }

  // Normalizar nombres de columnas dinámicamente
  const tokens = {
    access_token: dealer.ghl_access_token || dealer.access_token,
    refresh_token: dealer.ghl_refresh_token || dealer.refresh_token,
    expires_at: dealer.ghl_token_expires_at || dealer.ghl_expires_at || dealer.expires_at,
    locationId: dealer.ghl_location_id || dealer.location_id
  };

  if (!tokens.access_token) {
    throw new Error(`Dealer ${dealerId} no tiene token de GHL en Supabase`);
  }

  const now = Date.now();
  const expiresAt = tokens.expires_at ? new Date(tokens.expires_at).getTime() : 0;

  // Buffer de 5 minutos para el refresh
  if (now >= (expiresAt - 300000)) {
    console.log(`🔄 Refrescando token GHL para Dealer: ${dealerId}`);
    try {
      const response = await fetch('https://services.leadconnectorhq.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
          user_type: tokens.userType || 'Location'
        })
      });

      const data = await response.json();
      if (!response.ok) {
        console.error("❌ Error al refrescar token GHL:", data);
        throw new Error(data.error_description || data.message || "Error refrescando token");
      }

      const newExpiresAt = new Date(Date.now() + (data.expires_in * 1000));

      // Actualizar en Supabase
      const { error: updateError } = await supabaseAdmin
        .from('dealers')
        .update({
          ghl_access_token: data.access_token,
          ghl_refresh_token: data.refresh_token,
          ghl_token_expires_at: newExpiresAt.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', dealer.id);

      if (updateError) {
        console.error("❌ Error actualizando token en Supabase:", updateError);
      }

      console.log("✅ Token GHL refrescado y guardado en Supabase");
      return {
        access_token: data.access_token,
        locationId: tokens.locationId
      };
    } catch (err) {
      console.error("❌ Fallo el flujo de refresh GHL:", err);
      throw err;
    }
  }

  return tokens;
}

exports.ghlTemplates = onRequest({ cors: true, secrets: [ghlClientSecret, ghlClientId, supabaseServiceKey] }, async (req, res) => {
  try {
    const { ghl_access_token, locationId, dealerId } = req.query;

    let accessToken = ghl_access_token;
    let finalLocationId = locationId;

    try {
      if (dealerId) {
        const config = await getGHLConfig(dealerId, ghlClientId.value(), ghlClientSecret.value(), supabaseServiceKey.value());
        accessToken = config.access_token;
        finalLocationId = config.locationId || finalLocationId;
      }
    } catch (e) {
      console.warn("⚠️ No se pudo obtener config de GHL del backend:", e.message);
    }

    if (!accessToken || !finalLocationId) {
      return res.status(400).json({ error: "Faltan parámetros requeridos: ghl_access_token y/o locationId" });
    }

    const response = await fetch(`https://services.leadconnectorhq.com/proposals/templates?locationId=${finalLocationId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Version': '2021-07-28',
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Error al obtener plantillas de GHL");

    // Mapear a formato simple { id, name }
    const templates = (data.data || []).map(t => ({
      id: t._id || t.id,
      name: t.name
    }));

    return res.status(200).json(templates);
  } catch (err) {
    console.error("❌ Error fetching GHL templates:", err);
    return res.status(500).json({ error: err.message });
  }
});

// 2. Función para Enviar a GHL (Sustituye el placeholder anterior)
exports.apiGHL = onRequest({ cors: true, secrets: [ghlClientSecret, ghlClientId, supabaseServiceKey], timeoutSeconds: 300, memory: '2GiB', cpu: 2 }, async (req, res) => {
  const VERSION = "2024-03-05-v5-GOLD";
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { mode, contactData, templateId, ghl_access_token, vehicleData, financialData, documentType, dealerId: bodyDealerId } = req.body;

    // ── MODO LIMPIEZA MASIVA (TEMPORAL) ──────────────────────────────────────
    if (mode === 'cleanup' && bodyDealerId) {
      console.log(`🧹 Iniciando limpieza masiva para dealer: ${bodyDealerId}`);
      const config = await getGHLConfig(bodyDealerId, ghlClientId.value(), ghlClientSecret.value(), supabaseServiceKey.value());
      const accessToken = config.access_token;
      const finalLocationId = config.locationId;

      const noisyTags = [
        'compro', 'Compro', 'compró', 'COMPRO', 'Compró',
        'cotizo', 'cotizado', 'cotizacion', 'cotización', 'cotizó',
        'vendido', 'vendida', 'Vendido', 'VENDIDO', 'COTIZACION', 'COTIZÓ', 'COTIZADO'
      ];

      let allContacts = [];
      let startAfterId = null;
      let hasMore = true;

      while (hasMore) {
        let url = `https://services.leadconnectorhq.com/contacts/?locationId=${finalLocationId}&limit=100`;
        if (startAfterId) url += `&startAfterId=${startAfterId}`;

        const resContacts = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Version': '2021-07-28',
            'Accept': 'application/json'
          }
        });
        const contactDataResult = await resContacts.json();
        const batch = contactDataResult.contacts || [];
        allContacts = allContacts.concat(batch);

        if (batch.length < 100) {
          hasMore = false;
        } else {
          startAfterId = batch[batch.length - 1].id;
        }
      }

      console.log(`👀 Analizando ${allContacts.length} contactos de GHL...`);
      let cleanedCount = 0;

      for (const contact of allContacts) {
        const currentTags = contact.tags || [];
        const hasDirty = currentTags.some(t => {
          const lowerT = String(t).toLowerCase();
          return noisyTags.some(n => n.toLowerCase() === lowerT);
        });

        if (hasDirty) {
          const newTags = [];
          if (currentTags.some(t => String(t).toLowerCase().includes('compro'))) newTags.push('COMPRÓ');
          if (currentTags.some(t => String(t).toLowerCase().includes('cotiz'))) newTags.push('COTIZACIÓN');

          // Borrar todas las variantes ruidosas detectadas
          const tagsToRemove = currentTags.filter(t => {
            const lowerT = String(t).toLowerCase();
            return noisyTags.some(n => n.toLowerCase() === lowerT);
          });

          await fetch(`https://services.leadconnectorhq.com/contacts/${contact.id}/tags`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Version': '2021-07-28' },
            body: JSON.stringify({ tags: tagsToRemove })
          });

          if (newTags.length > 0) {
            await fetch(`https://services.leadconnectorhq.com/contacts/${contact.id}/tags`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Version': '2021-07-28' },
              body: JSON.stringify({ tags: newTags })
            });
          }
          cleanedCount++;
        }
      }
      return res.status(200).json({ status: 'Limpieza masiva completada', totalContactsAnalyzed: allContacts.length, cleanedCount });
    }

    console.log(`[${VERSION}] 🟢 Inicia apiGHL. Template: ${templateId}, Dealer: ${bodyDealerId}`);

    if (!contactData || !templateId) {
      return res.status(400).json({ error: "Faltan datos de contacto o templateId" });
    }

    const { locationId, dealerId: contactDealerId } = contactData;
    const queryDealerId = req.query.dealerId;
    const dealerId = bodyDealerId || queryDealerId || contactDealerId;

    let accessToken = ghl_access_token;
    let finalLocationId = locationId;

    try {
      if (dealerId) {
        console.log(`🔍 Intentando obtener config GHL oficial para Dealer: ${dealerId}`);
        const config = await getGHLConfig(dealerId, ghlClientId.value(), ghlClientSecret.value(), supabaseServiceKey.value());
        accessToken = config.access_token;
        finalLocationId = config.locationId || finalLocationId;
        console.log("✅ Usando Token de base de datos (Backend Managed)");
      } else if (accessToken) {
        console.log("ℹ️ Usando Token proporcionado por el Frontend (Auth Pass-through)");
      }
    } catch (e) {
      console.warn("⚠️ No se pudo obtener config de GHL del backend:", e.message);
    }

    if (!finalLocationId) {
      throw new Error("No se encontró Location ID para este Dealer");
    }

    console.log(`🚀 Procesando Contacto para Location: ${finalLocationId}`);

    // 2. Upsert Contact (GHL V2)
    // Limpiar contactData de campos no permitidos por GHL V2 en el root del contacto
    const frontendCustomFields = contactData.customFields || []; // Save to extract cedula etc
    const cleanContactData = { ...contactData };
    delete cleanContactData.dealerId;
    delete cleanContactData.ghl_access_token;
    delete cleanContactData.locationId;
    delete cleanContactData.customFields; // IMPORTANT: Borramos customFields temporales del root para que no den Error 400 en GHL

    const finalPayload = { ...cleanContactData, locationId: finalLocationId };
    console.log("📤 Enviando Upsert Contact a GHL:", {
      firstName: finalPayload.firstName,
      lastName: finalPayload.lastName,
      email: finalPayload.email || 'N/A',
      phone: finalPayload.phone || 'N/A',
      locationId: finalPayload.locationId
    });

    let contactRes = await fetch(`https://services.leadconnectorhq.com/contacts/upsert`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Version': '2021-07-28'
      },
      body: JSON.stringify(finalPayload)
    });

    let contactResult = await contactRes.json();

    // Si falla por email, reintentar sin email (pero SOLO si hay otro identificador como phone)
    if (!contactRes.ok && (JSON.stringify(contactResult).toLowerCase().includes("email"))) {
      if (cleanContactData.phone) {
        console.log("⚠️ Reintentando sin email por error de validación (usando phone como backup)...");
        delete cleanContactData.email;
        const retryPayload = { ...cleanContactData, locationId: finalLocationId };
        contactRes = await fetch(`https://services.leadconnectorhq.com/contacts/upsert`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Version': '2021-07-28'
          },
          body: JSON.stringify(retryPayload)
        });
        contactResult = await contactRes.json();
      } else {
        console.warn("⚠️ Falló por email y no hay teléfono para reintentar.");
      }
    }

    if (!contactRes.ok) {
      console.error("❌ Error Upsert Contact GHL:", contactResult);
      throw new Error(contactResult.message || "Error al crear/actualizar contacto");
    }

    const contactId = contactResult.contact?.id || contactResult.id;
    if (!contactId) {
      throw new Error("No se pudo identificar el contacto en GHL");
    }
    console.log(`✅ Contacto procesado: ${contactId}`);

    // ──────────────────────────────────────────────────────────────────
    // 2.5 INYECTAR CUSTOM FIELDS AL CONTACTO (Vehicle + Financial Data)
    // ──────────────────────────────────────────────────────────────────

    const veh = vehicleData || {};
    const fin = financialData || {};

    // Obtener cedula y datos genericos pasados via customFields en el request original
    const cedulaFromFrontend = frontendCustomFields.find(cf => cf.id === 'cedula' || cf.key === 'cedula')?.value || cleanContactData.cedula || "";

    // 2.5.1 Obtener la definición de los Custom Fields de la Location desde GHL
    let remoteCustomFields = [];
    try {
      const cfRes = await fetch(`https://services.leadconnectorhq.com/locations/${finalLocationId}/customFields`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-07-28',
          'Accept': 'application/json'
        }
      });
      if (cfRes.ok) {
        const cfData = await cfRes.json();
        remoteCustomFields = cfData.customFields || [];
        console.log(`✅ Obtenidos ${remoteCustomFields.length} Custom Fields de la Location`);
        const garantMatches = remoteCustomFields.filter(cf => (cf.fieldKey || "").toLowerCase().includes('garant') || (cf.name || "").toLowerCase().includes('garant'));
        console.log(`🔎 DEBUG garantia fields:`, JSON.stringify(garantMatches.map(cf => ({ id: cf.id, fieldKey: cf.fieldKey, name: cf.name }))));
      } else {
        const errText = await cfRes.text();
        console.warn(`⚠️ No se pudieron cargar los Custom Fields de GHL. Status: ${cfRes.status}, Body: ${errText}`);
      }
    } catch (e) {
      console.warn("⚠️ Error cargando Custom Fields remotos:", e.message);
    }

    // Helper para buscar ID exactamente por el field_key (Case-insensitive y robusto)
    const findCfIdByKey = (possibleKeys) => {
      for (const k of possibleKeys) {
        const lowerK = k.toLowerCase();
        const match = remoteCustomFields.find(cf => {
          const remoteKey = (cf.fieldKey || "").replace(/^contact\./, "").replace(/^{{\s*contact\./, "").replace(/\s*}}$/, "").toLowerCase();
          return remoteKey === lowerK || cf.fieldKey.toLowerCase() === lowerK;
        });
        if (match) return match.id;
      }
      return null;
    };

    // -- HELPERS DE FORMATEO "BONITO" (Espejo del frontend) --

    // Manual comma formatter (toLocaleString no es confiable en Cloud Functions)
    const addCommas = (n) => {
      const parts = String(n).split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return parts.join('.');
    };

    const ghlBool = (v) => {
      if (v === null || v === undefined || v === "" || v === "-") return "No";
      const s = String(v).toLowerCase().trim();
      const truthy = ["true", "si", "sí", "yes", "s", "y", "1", "es clean carfax"];
      return truthy.includes(s) ? "Sí" : "No";
    };

    const fmtCur = (monto, moneda) => {
      if (!monto) return "";
      const val = Number(String(monto).replace(/[^0-9.-]+/g, ""));
      if (isNaN(val) || val === 0) return "";
      const formatted = addCommas(Math.round(val));
      const map = { DOP: `RD$ ${formatted} Pesos`, 'RD$': `RD$ ${formatted} Pesos`, USD: `US$ ${formatted} Dolares`, EUR: `€ ${formatted} Euros`, COP: `COP$ ${formatted} Pesos Colombianos` };
      return map[moneda] || `US$ ${formatted} Dolares`;
    };

    const fmtMil = (m, veh) => {
      if (!m) return "";
      const val = Number(String(m).replace(/[^0-9.-]+/g, ""));
      if (isNaN(val)) return String(m);

      let suffix = 'Millas';
      if (
        String(m).toLowerCase().includes('km') ||
        (veh && veh.kilometraje) ||
        (veh && veh.mileage_unit && String(veh.mileage_unit).toUpperCase() === 'KM') ||
        (veh && veh.unit && String(veh.unit).toUpperCase() === 'KM')
      ) {
        suffix = 'Km';
      }
      return `${addCommas(Math.round(val))} ${suffix}`;
    };

    const fmtMot = (v) => {
      const parts = [];
      // 1. Cilindrada (CC / Displacement)
      const ccRaw = v.engine_cc || v.cc || "";
      if (ccRaw && ccRaw !== "-") {
        let cc = String(ccRaw).replace(/\s*[Ll]$/, "").replace(/\s*[Cc][Cc]$/, "").trim();
        // Si es un número entero (ej: "2"), agregar .0 para que quede "2.0"
        const ccNum = parseFloat(cc);
        if (!isNaN(ccNum) && !cc.includes('.')) {
          cc = ccNum.toFixed(1);
        }
        parts.push(`${cc} L`);
      }
      // 2. Cilindros
      const cylRaw = v.engine_cyl || v.cilindros || "";
      if (cylRaw && cylRaw !== "-") {
        const cyl = String(cylRaw).replace(/\s*[Cc][Ii][Ll][Ii]?[Nn]?[Dd]?[Rr]?[Oo]?[Ss]?/g, "").trim();
        parts.push(`${cyl} Cilindros`);
      }
      // 3. Tipo / Turbo
      const typeStr = String(v.engine_type || v.turbo || "").toLowerCase();
      if (typeStr.includes("turbo") || v.turbo === true || v.turbo === "Sí" || v.turbo === "si") {
        parts.push("Turbo");
      }
      return parts.join(', ');
    };

    const fmtAsi = (qty) => qty ? `${qty} Filas de asientos` : '';

    const fmtCfx = (cf) => {
      if (cf === true) return 'Es clean CarFax';
      if (cf === false || cf === null || cf === undefined || cf === '' || cf === '-') return '-';
      const s = String(cf).toLowerCase().trim();
      if (s === 'clean' || s.includes('clean carfax') || s === 'si' || s === 'sí' || s === 'true' || s === '1' || s === 'yes' || s === 'es clean carfax') return 'Es clean CarFax';
      return '-';
    };

    // Mapeo dinámico multi-cuenta: Relaciona los fieldKeys de GHL proporcionados por el usuario con el valor local
    // El primer elemento de 'keys' será usado como fallback si no se encuentra el ID en GHL
    // Helper to extract formatted values sent from frontend if available
    const getFrontendCf = (cfKey) => {
      const field = frontendCustomFields.find(cf => cf.key === cfKey || cf.id === cfKey);
      return field && field.value ? String(field.value) : "";
    };

    // ── DETECTAR MONEDA ──
    // Prioridad: financialData > vehicleData > default USD
    const monedaVenta = fin.moneda_venta || fin.monedaVenta || (veh.price_dop > 0 ? 'DOP' : 'USD');
    const monedaInicial = fin.moneda_inicial || fin.monedaInicial || monedaVenta;

    // ── OBTENER RAW NUMBERS para formateo ──
    const rawPrecio = fin.precio_venta || fin.precioFinal || veh.price || veh.precio || 0;
    const rawInicial = fin.pago_inicial || fin.pago_financiar || fin.inicial || 0;
    const rawMileage = veh.mileage || veh.kilometraje || veh.millaje || veh.millas || 0;

    console.log(`[${VERSION}] 🔢 RAW VALUES => precio: ${rawPrecio} (${monedaVenta}), inicial: ${rawInicial} (${monedaInicial}), millaje: ${rawMileage}`);
    console.log(`[${VERSION}] 🔢 FORMATTED => precio: ${fmtCur(rawPrecio, monedaVenta)}, inicial: ${fmtCur(rawInicial, monedaInicial)}, millaje: ${fmtMil(rawMileage, veh)}`);
    console.log(`[${VERSION}] 🔢 carfax raw: "${veh.carfax || veh.clean_carfax || ''}" => formatted: "${fmtCfx(veh.carfax || veh.clean_carfax)}"`);

    // 2. Prepara fallback de email para GHL Proposals (evita error 40035)
    // Si no hay email, o el contacto se creó sin email debido a validación previa,
    // inyectamos uno temporal solo para que la propuesta se pueda generar.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const finalClientEmail = (cleanContactData.email && emailRegex.test(cleanContactData.email))
      ? cleanContactData.email
      : `${cleanContactData.firstName || 'cliente'}.${Date.now()}@carbot-fallback.com`;

    if (!cleanContactData.email || !emailRegex.test(cleanContactData.email)) {
      console.log(`⚠️ Email inválido o ausente para contacto ${contactId}. Usando fallback: ${finalClientEmail}`);
      // Actualizar el contacto con el email de fallback para permitir la propuesta
      try {
        await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Version': '2021-07-28'
          },
          body: JSON.stringify({ email: finalClientEmail })
        });
      } catch (e) {
        console.warn("⚠️ No se pudo inyectar email de fallback:", e.message);
      }
    }

    const fieldsToInject = [
      // Vehículo (Básico)
      { keys: ["marca"], value: getFrontendCf('marca') || String(veh.make || veh.marca || "").toUpperCase() },
      { keys: ["modelo"], value: getFrontendCf('modelo') || String(veh.model || veh.modelo || "").toUpperCase() },
      { keys: ["ao", "año", "ano"], value: getFrontendCf('ano') || String(veh.year || veh.ano || "") },
      { keys: ["color"], value: getFrontendCf('color') || String(veh.color || veh.exteriorColor || "").toUpperCase() },
      { keys: ["edicin", "edicion", "edicion_version"], value: getFrontendCf('edicion') || String(veh.edition || veh.edicion_version || veh.trim || veh.edicion || "").toUpperCase() },
      { keys: ["chasis", "chasis_vin", "vin"], value: getFrontendCf('chasis') || String(veh.vin || veh.chasis_vin || veh.chasis || "").toUpperCase() },

      // ⬇️ SIEMPRE usar formatter backend para estos campos (no confiar en getFrontendCf)
      { keys: ["millaje", "kilometraje"], value: fmtMil(rawMileage, veh) },
      { keys: ["tipo_de_vehculo", "tipo_vehiculo"], value: getFrontendCf('tipo') || String(veh.type || veh.bodyType || veh.tipo_vehiculo || "") },
      { keys: ["condicin", "condicion", "condición"], value: getFrontendCf('condicion') || String(veh.condition || veh.condicion || "") },
      { keys: ["carfax", "clean_carfax"], value: fmtCfx(veh.carfax || veh.clean_carfax) },

      // Mecánica
      { keys: ["transmisin", "transmision"], value: getFrontendCf('transmision') || String(veh.transmission || veh.transmision || "") },
      { keys: ["traccin", "traccion"], value: getFrontendCf('traccion') || String(veh.traction || veh.drivetrain || veh.traccion || "") },
      { keys: ["tipo_de_combustible", "combustible"], value: getFrontendCf('combustible') || String(veh.fuel || veh.combustible || veh.fuelType || "") },
      { keys: ["motor"], value: fmtMot(veh) },

      // Equipamiento y Extras
      { keys: ["interior"], value: getFrontendCf('interior') || String(veh.seat_material || veh.interior || veh.interiorMaterial || "") },
      { keys: ["techo"], value: getFrontendCf('techo') || String(veh.roof_type || veh.techo || veh.roof || "") },
      { keys: ["carplay", "apple_carplay", "apple_android"], value: ghlBool(getFrontendCf('carplay') || veh.carplay || veh.appleCarplay) },
      { keys: ["camara", "camaa", "cámara", "camera"], value: ghlBool(getFrontendCf('camara') || veh.camera || veh.camara) },
      { keys: ["sensores", "sensors"], value: ghlBool(getFrontendCf('sensores') || veh.sensors || veh.sensores) },
      { keys: ["baul_electrico", "baul", "trunk", "power_trunk"], value: ghlBool(getFrontendCf('baul_electrico') || veh.trunk || veh.baul_electrico || veh.powerTrunk) },
      { keys: ["cristales_electrico", "cristales_electricos", "vidrios", "windows"], value: ghlBool(getFrontendCf('cristales_electrico') || veh.electric_windows || veh.cristales_electricos || veh.cristales_electrico || veh.vidrios_electricos || veh.powerWindows) },
      { keys: ["llave"], value: getFrontendCf('llave') || String(veh.key_type || veh.llave || "") },
      { keys: ["filas_de_asientos", "filas_asientos"], value: getFrontendCf('filas_asientos') || fmtAsi(veh.seats || veh.filas_asientos) },

      // ⬇️ Financiero: SIEMPRE usar formatter backend
      { keys: ["precio", "precio_rd", "precio_venta"], value: fmtCur(rawPrecio, monedaVenta) },
      { keys: ["inicial", "monto_a_financiar_rd", "pago_inicial"], value: fmtCur(rawInicial, monedaInicial) },
      { keys: ["banco_o_financiera", "banco", "financiera"], value: getFrontendCf('banco_o_financiera') || String(fin.banco || "").toUpperCase() },
      { keys: ["tiempo_de_garanta", "tiempo_de_garantia", "tiempo_garantia"], value: getFrontendCf('tiempo_de_garanta') || String(fin.tiempo_garantia || fin.tiempoGarantia || "") },

      // Cliente Extra
      { keys: ["a_que_quien_va_dirigida", "a_quien_va_dirigida"], value: getFrontendCf('a_quien_va_dirigida') || `${cleanContactData.firstName || ''} ${cleanContactData.lastName || ''}`.trim().toUpperCase() },
      { keys: ["cdula", "cedula", "cédula"], value: getFrontendCf('cedula') || String(cedulaFromFrontend) },
      { keys: ["placa"], value: getFrontendCf('placa') || String(veh.plate || veh.placa || "").toUpperCase() },
      { keys: ["cilindros"], value: getFrontendCf('cilindros') || String(veh.cilindros || veh.engine_cyl || "") },

      // Ubicación (custom fields, no estándar — address1/city/state/country/postalCode
      // ya van directo en el root del contacto vía cleanContactData)
      { keys: ["num_casaapartamento", "num_casa_apartamento"], value: getFrontendCf('num_casaapartamento') || "" },
      { keys: ["sector"], value: getFrontendCf('sector') || "" },
      { keys: ["pais"], value: getFrontendCf('pais') || "" }
    ];

    // Construir el array final buscando dinámicamente los IDs en la cuenta de GHL actual (Multi-Tenant)
    const customFieldsPayload = [];

    fieldsToInject.forEach(field => {
      const ghlId = findCfIdByKey(field.keys);
      // Fallback: usar el primer elemento de keys como 'key' si no hay ID
      const fallbackKey = field.keys[0];

      if (field.value && field.value !== "undefined" && field.value !== "null" && String(field.value).trim() !== "") {
        const val = String(field.value).trim();
        if (ghlId) {
          customFieldsPayload.push({ id: ghlId, value: val });
        } else {
          // Si no tenemos ID (ej. 401 Unauthorized en fetch cf), intentamos enviar por KEY
          // Nota: Algunos endpoints de GHL aceptan key, otros solo ID. Enviamos ambos para máxima compatibilidad si es posible
          console.log(`ℹ️ Usando fallback por KEY para campo: ${fallbackKey} -> ${val}`);
          customFieldsPayload.push({ id: fallbackKey, value: val, key: fallbackKey });
        }
      }
    });

    if (customFieldsPayload.length > 0) {
      console.log(`[${VERSION}] 📝 Enviando actualización de 30 Custom Fields a GHL para contacto ${contactId}:`, JSON.stringify(customFieldsPayload, null, 2));
      try {
        const updateContactRes = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Version': '2021-07-28'
          },
          body: JSON.stringify({ customFields: customFieldsPayload })
        });
        const updateResult = await updateContactRes.json();
        if (!updateContactRes.ok) {
          console.warn("⚠️ Error actualizando Custom Fields (no-bloqueante):", updateResult);
        } else {
          console.log(`✅ Custom Fields dinámicos actualizados para contacto ${contactId}`);
        }
      } catch (cfError) {
        console.warn("⚠️ Error en actualización de Custom Fields:", cfError.message);
      }
    } else {
      console.log("ℹ️ No se agregaron Custom Fields al payload (No se encontraron IDs coincidentes en GHL o los valores están vacíos).");
    }

    // 3. Generar Documento desde Template (GHL V2 Proposals API)
    // Se requiere `userId` (quien envía el documento) y GHL rechaza el campo `name` en esta ruta.

    let assignedUserId = "GHL_USER_ID"; // placeholder
    try {
      const usersRes = await fetch(`https://services.leadconnectorhq.com/users/?locationId=${finalLocationId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-07-28',
          'Accept': 'application/json'
        }
      });
      const usersData = await usersRes.json();
      if (usersData.users && usersData.users.length > 0) {
        assignedUserId = usersData.users[0].id;
      } else {
        console.warn("⚠️ No se encontraron usuarios válidos en GHL", usersData);
      }
    } catch (e) {
      console.warn("⚠️ Error obteniendo userId", e.message);
    }

    console.log(`📤 Enviando documento via GHL para el Location ${finalLocationId}, User: ${assignedUserId}, Contact: ${contactId}, Template: ${templateId}`);

    const docRes = await fetch(`https://services.leadconnectorhq.com/proposals/templates/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Version': '2021-07-28'
      },
      body: JSON.stringify({
        templateId: templateId,
        contactId: contactId,
        locationId: finalLocationId,
        userId: assignedUserId,
        sendDocument: false // EVITA EL ENVÍO DE CORREO QUE CAUSA EL ERROR 40035
      })
    });

    const docResult = await docRes.json();
    console.log("📄 GHL docResult raw:", JSON.stringify(docResult));
    if (!docRes.ok) {
      console.error("❌ Error Generate Document GHL:", docResult);
      throw new Error(docResult.message || docResult.error || "Error al generar documento en GHL");
    }

    // ── AGREGAR ETIQUETAS AL CONTACTO ─────────────────────────────────────────
    // Standardize tags: Brand (MARCA) + Action (COMPRÓ / COTIZACIÓN) in Uppercase with Accents
    try {
      const veh = vehicleData || {};
      const make = (veh.make || veh.marca || '').trim().toUpperCase();
      const isQuote = String(documentType).toLowerCase().includes('cotiz');
      
      const tagsToAdd = isQuote ? ['COTIZACIÓN'] : ['COMPRÓ'];
      if (make) tagsToAdd.push(make);

      // List of noisy or redundant tags to clean up from the contact
      const noisyTags = [
        'compro', 'Compro', 'compró', 'COMPRO', 'Compró',
        'cotizo', 'cotizado', 'cotizacion', 'cotización', 'cotizó',
        'vendido', 'vendida', 'Vendido', 'VENDIDO', 'COTIZACION', 'COTIZÓ', 'COTIZADO'
      ];

      // 1. Remove noisy tags (GHL V2 protocol)
      // Note: We ignore errors here to ensure the process continues even if some tags aren't present
      await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/tags`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Version: '2021-07-28',
        },
        body: JSON.stringify({ tags: noisyTags }),
      }).catch(e => console.warn('[apiGHL] Error removiendo tags ruidosos:', e.message));

      // 2. Add standardized tags
      await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/tags`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Version: '2021-07-28',
        },
        body: JSON.stringify({ tags: tagsToAdd }),
      });
      console.log(`🏷️ Tags estandarizados para contacto ${contactId}:`, tagsToAdd);
    } catch (tagErr) {
      // Non-fatal: log but don't fail the response
      console.warn('[apiGHL] Error procesando tags:', tagErr.message);
    }

    // GHL returns { document: { _id, ... } }
    const docId = (docResult.document && (docResult.document._id || docResult.document.id || docResult.document.documentId))
      || (docResult.links && docResult.links[0] && docResult.links[0].documentId)
      || docResult.documentId
      || docResult.id
      || null;

    const ghlPreviewUrl = docId
      ? `https://app.iagil.ai/v2/location/${finalLocationId}/payments/proposals-estimates/edit/preview/${docId}?locale=es`
      : (docResult.url || docResult.documentUrl || null);

    console.log(`📎 GHL docId: ${docId} | previewUrl: ${ghlPreviewUrl}`);

    res.json({
      documentUrl: ghlPreviewUrl,
      status: "ok",
      ghlDocumentId: docId
    });

  } catch (error) {
    console.error("❌ Fallo crítico en apiGHL:", {
      message: error.message,
      stack: error.stack,
      ghlResponse: error.response?.data || 'N/A'
    });
    res.status(500).json({
      error: error.message,
      details: error.response?.data || null
    });
  }
});

// ── Contacts API ─────────────────────────────────────────────────────────────
exports.ghlContacts = onRequest({ cors: true, secrets: [ghlClientSecret, ghlClientId, supabaseServiceKey] }, async (req, res) => {
  const GHL_BASE = 'https://services.leadconnectorhq.com';

  // Webhook receiver: POST ?webhook=1
  if (req.method === 'POST' && req.query.webhook) {
    const locationId = req.body?.locationId || req.body?.location_id;
    if (locationId) {
      try {
        const supa = createClient(SUPABASE_URL, supabaseServiceKey.value());
        await supa.from('dealers').update({ updated_at: new Date().toISOString() }).eq('ghl_location_id', locationId);
      } catch (_) {}
    }
    return res.status(200).json({ received: true });
  }

  const { dealerId, contactId, limit = '100', startAfterId, query: searchQuery, assignedTo } = req.query;
  if (!dealerId) return res.status(400).json({ error: 'dealerId es requerido' });

  try {
    const { access_token, locationId } = await getGHLConfig(dealerId, ghlClientId.value(), ghlClientSecret.value(), supabaseServiceKey.value());
    const headers = {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    };

    if (req.method === 'GET') {
      // Fetch custom field schema once to annotate contacts (maps UUID id → readable fieldKey)
      let cfSchema = {}; // id → normalized key (e.g. "cedula", "placa")
      try {
        const cfRes = await fetch(`${GHL_BASE}/locations/${locationId}/customFields`, { headers });
        if (cfRes.ok) {
          const cfData = await cfRes.json();
          console.log('[ghlContacts] Custom field schema:', JSON.stringify((cfData.customFields || []).map(cf => ({ id: cf.id, fieldKey: cf.fieldKey, name: cf.name }))));
          (cfData.customFields || []).forEach(cf => {
            if (cf.id) {
              // Normalize fieldKey: strip "contact." prefix and braces
              const fromKey = (cf.fieldKey || '').replace(/^\{\{?\s*contact\.\s*/i, '').replace(/\s*\}?\}?$/, '').toLowerCase().trim();
              // Also normalize name: remove accents, lowercase
              const fromName = (cf.name || '').toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
                .replace(/[^a-z0-9_]/g, '_').trim();
              // Use fieldKey if available, fall back to normalized name
              cfSchema[cf.id] = fromKey || fromName;
            }
          });
        }
      } catch (_) {}

      // Helper to annotate a contact's customFields with readable key
      const annotateContact = (contact) => {
        if (!contact || !contact.customFields) return contact;
        return {
          ...contact,
          customFields: contact.customFields.map(cf => ({
            ...cf,
            fieldKey: cfSchema[cf.id] || cf.fieldKey || cf.id || '',
          }))
        };
      };

      if (contactId) {
        const r = await fetch(`${GHL_BASE}/contacts/${contactId}`, { headers });
        if (!r.ok) return res.status(r.status).json(await r.json());
        const data = await r.json();
        return res.json(annotateContact(data.contact || data));
      }
      const params = new URLSearchParams({ locationId, limit });
      if (startAfterId) params.set('startAfterId', startAfterId);
      if (searchQuery) params.set('query', searchQuery);
      if (assignedTo) params.set('assignedTo', assignedTo);
      const r = await fetch(`${GHL_BASE}/contacts/?${params}`, { headers });
      if (!r.ok) return res.status(r.status).json(await r.json());
      const data = await r.json();
      const contacts = (data.contacts || []).map(annotateContact);
      return res.json({ ...data, contacts });
    }

    if (req.method === 'PUT') {
      if (!contactId) return res.status(400).json({ error: 'contactId requerido' });
      const r = await fetch(`${GHL_BASE}/contacts/${contactId}`, { method: 'PUT', headers, body: JSON.stringify(req.body) });
      return res.status(r.status).json(await r.json());
    }

    if (req.method === 'DELETE') {
      if (!contactId) return res.status(400).json({ error: 'contactId requerido' });
      const r = await fetch(`${GHL_BASE}/contacts/${contactId}`, { method: 'DELETE', headers });
      return res.status(r.status).json({ ok: r.ok });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[ghlContacts] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Conversations API ─────────────────────────────────────────────────────────
exports.ghlConversations = onRequest({ cors: true, secrets: [ghlClientSecret, ghlClientId, supabaseServiceKey] }, async (req, res) => {
  const GHL_BASE = 'https://services.leadconnectorhq.com';
  const { dealerId, conversationId, messages, lastMessageId, lastId, limit = '25', assignedUserId, bots, botStatus, contactId } = req.query;

  if (!dealerId) return res.status(400).json({ error: 'dealerId es requerido' });

  try {
    const { access_token, locationId } = await getGHLConfig(dealerId, ghlClientId.value(), ghlClientSecret.value(), supabaseServiceKey.value());
    const headers = {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    };

    if (req.method === 'GET') {
      // Fetch conversation AI agents/bots for this location
      if (bots === '1') {
        const params = new URLSearchParams({ locationId });
        const r = await fetch(`${GHL_BASE}/conversation-ai/agents/search?${params}`, { headers });
        const data = r.ok ? await r.json() : { agents: [] };
        const agents = (data.agents || data.data || []).map(a => ({
          id: a.id, name: a.name, status: a.status, mode: a.mode, channels: a.channels || [],
        }));
        return res.status(200).json({ agents, hasBot: agents.length > 0 });
      }

      // Get bot status for a specific conversation
      if (conversationId && botStatus === '1') {
        console.log('[ghlConversations] Bot status GET:', { conversationId });
        const r = await fetch(`${GHL_BASE}/conversations-ai/employeeConfigs/${conversationId}`, { headers });
        const rawText = await r.text();
        console.log('[ghlConversations] Bot status response:', { status: r.status, body: rawText });
        if (!r.ok) {
          if (r.status === 404) return res.status(200).json({ status: null, hasConfig: false });
          let data;
          try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }
          return res.status(r.status).json(data);
        }
        let data;
        try { data = JSON.parse(rawText); } catch { data = {}; }
        return res.status(200).json({
          status: data.status || null,
          hasConfig: true,
          sleepingTill: data.sleepingTill || null,
        });
      }

      // Get messages for a conversation
      if (conversationId && messages === '1') {
        const params = new URLSearchParams({ limit: '50' });
        if (lastMessageId) params.set('lastMessageId', lastMessageId);
        const r = await fetch(`${GHL_BASE}/conversations/${conversationId}/messages?${params}`, { headers });
        return res.status(r.status).json(await r.json());
      }
      // Get single conversation
      if (conversationId) {
        const r = await fetch(`${GHL_BASE}/conversations/${conversationId}`, { headers });
        return res.status(r.status).json(await r.json());
      }
      // List all tags for this location
      if (req.query.tags === '1') {
        // Try the tags endpoint with the correct API version
        const tagHeaders = { ...headers, Version: '2021-07-28' };
        const r = await fetch(`${GHL_BASE}/locations/${locationId}/tags`, { headers: tagHeaders });
        if (r.ok) {
          const data = await r.json();
          const tags = (data.tags || []).map(t => ({ id: t.id, name: t.name }));
          return res.json({ tags });
        }
        // Fallback: collect unique tags from recent contacts
        const cParams = new URLSearchParams({ locationId, limit: '100' });
        const cr = await fetch(`${GHL_BASE}/contacts/?${cParams}`, { headers });
        if (cr.ok) {
          const cData = await cr.json();
          const tagSet = new Set();
          (cData.contacts || []).forEach(c => (c.tags || []).forEach(t => tagSet.add(t)));
          const tags = [...tagSet].sort().map(name => ({ id: name, name }));
          return res.json({ tags });
        }
        return res.json({ tags: [] });
      }
      // Get team members for @ mentions
      if (req.query.teamMembers === '1') {
        const r = await fetch(`${GHL_BASE}/users/?locationId=${locationId}`, { headers });
        const data = r.ok ? await r.json() : { users: [] };
        const members = (data.users || []).map(u => ({
          id: u.id,
          name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
          email: u.email || '',
          avatar: u.profilePhoto || '',
        }));
        return res.json({ members });
      }
      // List conversations — filter by assignedUserId if onlyAssignedData
      const params = new URLSearchParams({ locationId, limit, sortBy: 'last_message_date', sort: 'desc' });
      if (lastId) params.set('startAfterId', lastId);
      if (assignedUserId) params.set('assignedTo', assignedUserId);
      const r = await fetch(`${GHL_BASE}/conversations/search?${params}`, { headers });
      return res.status(r.status).json(await r.json());
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (!body.conversationId) return res.status(400).json({ error: 'conversationId es requerido' });

      // Internal notes — GHL API accepts type:'Note' on /conversations/messages with 'message' field
      if (body.type === 'Note') {
        const notePayload = {
          type: 'Note',
          conversationId: body.conversationId,
          message: body.message || '',
        };
        console.log('[ghlConversations] Sending Note payload:', JSON.stringify(notePayload));
        const r = await fetch(`${GHL_BASE}/conversations/messages`, {
          method: 'POST',
          headers,
          body: JSON.stringify(notePayload),
        });
        const rData = await r.json();
        console.log('[ghlConversations] Note response:', r.status, JSON.stringify(rData));
        if (!r.ok) {
          // Fallback: try with 'html' field instead of 'message'
          const r2 = await fetch(`${GHL_BASE}/conversations/messages`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ type: 'Note', conversationId: body.conversationId, html: body.message || '' }),
          });
          const rData2 = await r2.json();
          console.log('[ghlConversations] Note fallback response:', r2.status, JSON.stringify(rData2));
          return res.status(r2.status).json(rData2);
        }
        return res.status(r.status).json(rData);
      }

      // GHL requires contactId for regular messages — fetch it from the conversation if not provided
      let contactId = body.contactId;
      if (!contactId) {
        try {
          const convR = await fetch(`${GHL_BASE}/conversations/${body.conversationId}`, { headers });
          if (convR.ok) {
            const convData = await convR.json();
            contactId = convData.conversation?.contactId || convData.contactId;
          }
        } catch (_) {}
      }
      const payload = {
        type: body.type || 'WhatsApp',
        conversationId: body.conversationId,
        contactId,
        message: body.message || '',
        ...(body.attachments ? { attachments: body.attachments } : {}),
      };
      const r = await fetch(`${GHL_BASE}/conversations/messages`, { method: 'POST', headers, body: JSON.stringify(payload) });
      return res.status(r.status).json(await r.json());
    }

    if (req.method === 'PUT') {
      // Toggle conversation AI bot status
      if (conversationId && botStatus === '1') {
        const body = req.body || {};
        const status = body.status;
        if (!status || !['active', 'inactive'].includes(status)) {
          return res.status(400).json({ error: 'status debe ser "active" o "inactive"' });
        }
        const payload = {
          data: {
            status,
            ...(status === 'inactive' ? {
              reactivateAfterTimeValue: body.reactivateAfterTimeValue || 24,
              reactivateAfterTimeUnit: body.reactivateAfterTimeUnit || 'hour',
            } : {}),
          },
          locationId,
        };
        console.log('[ghlConversations] Bot toggle request:', {
          url: `${GHL_BASE}/conversations-ai/employeeConfigs/${conversationId}`,
          payload,
        });
        const r = await fetch(`${GHL_BASE}/conversations-ai/employeeConfigs/${conversationId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        });
        const rawText = await r.text();
        console.log('[ghlConversations] Bot toggle response:', { status: r.status, body: rawText });
        let data;
        try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }
        return res.status(r.status).json(data);
      }

      // Add tag to contact
      if (contactId && req.body?.addTag) {
        const r = await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
          method: 'POST', headers,
          body: JSON.stringify({ tags: [req.body.addTag] }),
        });
        const data = await r.json().catch(() => ({}));
        return res.status(r.status).json(data);
      }

      // Remove tag from contact
      if (contactId && req.body?.removeTag) {
        const r = await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
          method: 'DELETE', headers,
          body: JSON.stringify({ tags: [req.body.removeTag] }),
        });
        const data = await r.json().catch(() => ({}));
        return res.status(r.status).json(data);
      }

      if (!conversationId) return res.status(400).json({ error: 'conversationId es requerido para PUT' });
      // GHL requires locationId in the body for conversation updates
      const updateBody = { ...req.body, locationId };
      const r = await fetch(`${GHL_BASE}/conversations/${conversationId}`, { method: 'PUT', headers, body: JSON.stringify(updateBody) });
      return res.status(r.status).json(await r.json());
    }

    if (req.method === 'DELETE') {
      if (!conversationId) return res.status(400).json({ error: 'conversationId es requerido para DELETE' });
      const r = await fetch(`${GHL_BASE}/conversations/${conversationId}`, { method: 'DELETE', headers });
      if (r.status === 204) return res.status(200).json({ success: true });
      const data = await r.json().catch(() => ({}));
      return res.status(r.status).json(data);
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[ghlConversations] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// X. Función de Depuración (Para el desarrollador)
exports.debugInfo = onRequest({ cors: true }, async (req, res) => {
  try {
    const userSnap = await db.collection("users").doc("janilfernandez@hotmail_com").get();
    const userData = userSnap.exists ? userSnap.data() : "NO EXISTE";

    const collections = await db.listCollections();
    const results = [];

    for (const coll of collections) {
      const snap = await coll.limit(5).get(); // Limit reduced for speed
      const docs = snap.docs.map(d => ({ id: d.id, data: d.data() }));
      results.push({
        id: coll.id,
        count: snap.size,
        docs: docs
      });
    }

    const vehiclesSnap = await db.collection("vehicles").limit(10).get();
    const dealerIdsInVehicles = new Set();
    vehiclesSnap.forEach(doc => {
      const data = doc.data();
      if (data.dealerId) dealerIdsInVehicles.add(data.dealerId);
      if (data.dealerID) dealerIdsInVehicles.add(data.dealerID);
      if (data.locationId) dealerIdsInVehicles.add(data.locationId);
    });

    return res.json({
      project: process.env.GCLOUD_PROJECT,
      collections: results,
      dealerIdsFoundInVehicles: Array.from(dealerIdsInVehicles),
      userSample: userData,
      status: "debug_active"
    });
  } catch (error) {
    console.error("❌ Error en debugInfo:", error);
    res.status(500).send(error.message);
  }
});

// Y. Función de Depuración de Usuarios
exports.debugUsers = onRequest({ cors: true }, async (req, res) => {
  console.log("--- debugUsers Request ---");
  console.log("Method:", req.method);
  console.log("Headers:", JSON.stringify(req.headers));
  console.log("Query:", JSON.stringify(req.query));
  console.log("Body:", JSON.stringify(req.body));

  try {
    const email = req.query.email || req.body.email;
    const userId = req.query.id || req.body.id || req.query.userId || req.body.userId;
    const userEmail = req.query.userEmail || req.body.userEmail;

    const finalEmail = email || userEmail;

    // 1. Intentar búsqueda específica si se provee ID o Email
    if (finalEmail || userId) {
      console.log("🔍 Buscando usuario específico:", { finalEmail, userId });

      // Búsqueda en collectionGroup para mayor alcance
      let userDoc = null;
      if (userId) {
        // userId podría ser el ID del documento en la subcolección
        const snap = await db.collectionGroup("usuarios").get();
        userDoc = snap.docs.find(d => d.id === userId);
      } else if (finalEmail) {
        const snap = await db.collectionGroup("usuarios").where("email", "==", finalEmail.toLowerCase()).limit(1).get();
        userDoc = snap.empty ? null : snap.docs[0];
      }

      if (userDoc) {
        const data = userDoc.data();
        const response = {
          id: userDoc.id,
          name: data.name || data.displayName || data.email?.split('@')[0] || "Usuario",
          email: data.email
        };
        console.log("✅ Usuario encontrado:", JSON.stringify(response));
        return res.json(response);
      }
    }

    // 2. Obtener todos los usuarios vía collectionGroup
    const usersSnap = await db.collectionGroup("usuarios").limit(50).get();
    let users = usersSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || data.displayName || data.email?.split('@')[0] || "Usuario",
        email: data.email,
        dealerId: doc.ref.parent.parent ? doc.ref.parent.parent.id : 'unknown'
      };
    });

    // 3. FALLBACK PARA TEST DE MARKETPLACE:
    // Si no hay usuarios, devolvemos uno de prueba para que GHL pueda mapear los campos
    if (users.length === 0) {
      console.log("⚠️ No se encontraron usuarios reales. Enviando usuario de prueba para el handshake de GHL.");
      users = [{
        id: "test-user-ghl",
        name: "Usuario de Prueba Carbot",
        email: "soporte@carbot.com",
        dealerId: "TEST-DEALER"
      }];
    }

    // 3. RESPUESTA PARA GHL (REQUERIDA PLANA Y RÁPIDA)
    // El Marketplace de GHL requiere un JSON plano y sin caracteres basura al final para el handshake inicial.
    const finalUser = (users && users.length > 0) ? users[0] : {
      id: "carbot-master-id",
      name: "Jean C. Gomez",
      email: "soporte@carbot.com"
    };

    // Preparamos payload completo para asegurar compatibilidad con todos los mapeos posibles
    const responsePayload = {
      id: finalUser.id,
      name: finalUser.name,
      email: finalUser.email,
      count: users.length,
      users: users
    };

    console.log(`✅ Enviando JSON final a GHL (Size: ${JSON.stringify(responsePayload).length} bytes):`, JSON.stringify(responsePayload));

    // Usamos res.json() que maneja automáticamente Content-Type: application/json
    // y la terminación correcta del stream.
    return res.json(responsePayload);

  } catch (error) {
    console.error("❌ Error en debugUsers:", error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Z. Shims para Proveedor OAuth2 (Handshake con GHL External Authentication)
exports.ghlAuth = onRequest({ cors: true }, (req, res) => {
  const { redirect_uri, state } = req.query;
  console.log("--- ghlAuth (Provider Shim) ---");
  console.log("Redirect URI:", redirect_uri);

  if (!redirect_uri) {
    return res.status(400).send("Falta redirect_uri");
  }

  // Generamos un código falso para el handshake
  const mockCode = "carbot-handshake-" + Math.random().toString(36).substring(7);
  const separator = redirect_uri.includes('?') ? '&' : '?';
  const targetUrl = `${redirect_uri}${separator}code=${mockCode}&state=${state || ''}`;

  console.log("✅ Redirigiendo a GHL con mock code:", targetUrl);
  res.redirect(targetUrl);
});

exports.ghlToken = onRequest({ cors: true }, (req, res) => {
  console.log("--- ghlToken (Provider Shim) ---");
  console.log("Method:", req.method);
  console.log("Body:", JSON.stringify(req.body));

  // GHL espera un access_token para poder llamar a debugUsers después
  const mockToken = {
    access_token: "carbot-token-" + Math.random().toString(36).substring(7),
    token_type: "Bearer",
    expires_in: 3600
  };

  console.log("✅ Enviando mock token a GHL");
  res.json(mockToken);
});

// AA. Función para forzar la creación de dealers básicos
exports.onboardDealers = onRequest({ cors: true }, async (req, res) => {
  try {
    const dealers = [
      { id: "MI-DEALER", name: "Mi Dealer" },
      { id: "DURAN-FERNANDEZ-AUTO-SRL", name: "DURÁN FERNÁNDEZ AUTO S.R.L" }
    ];

    let count = 0;
    for (const d of dealers) {
      await admin.firestore().collection("Dealers").doc(d.id).set({
        nombre: d.name,
        display_name: d.name,
        slug: slugify(d.name),
        status: "active",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      count++;
    }

    res.json({ message: `✅ Se crearon/actualizaron ${count} dealers.`, status: "ok" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. COMENTADO PARA EVITAR FANTASMAS: El frontend se encarga de esto ahora con IDs técnicos
// exports.setupDealerBot = onDocumentCreated("Dealers/{dealerId}", async (event) => {
//   ...
// });

// 10. REPAIR FUNCTION (Temporary)
exports.repairDealerData = onRequest(async (req, res) => {
  const DEALER_ID = '5YBWavjywU0Ay0Y85R9p';
  const DEALER_NAME = 'DURÁN FERNÁNDEZ AUTO S.R.L';

  try {
    // 1. Fix Main Doc
    // Normalization logic: remove accents and special chars
    const idBusqueda = DEALER_NAME.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 ]/g, "");

    await db.collection('Dealers').doc(DEALER_ID).set({
      name: DEALER_NAME,
      id_busqueda: idBusqueda,
      nombre: DEALER_NAME,
      ghlLocationId: idBusqueda, // Solicitud Usuario: ID Técnico = Nombre sin tildes
      status: 'active',
      lastRepair: new Date().toISOString()
    }, { merge: true });

    // 2. Fix Bot Config
    const linkInventario = `https://inventarioia-gzhz2ynksa-uc.a.run.app/?dealer=${DEALER_ID}`;
    const linkTienda = `https://carbot-5d709.web.app/inventory?dealer=${DEALER_ID}`;

    await db.collection('Dealers').doc(DEALER_ID).collection(':DATA BOT RN').doc('CONFIG').set({
      LINK_INVENTARIO_GHL: linkInventario,
      LINK_TIENDA: linkTienda,
      bot_active: true,
      dealerName: DEALER_NAME,
      repairedBy: 'Cloud Function'
    }, { merge: true });

    res.status(200).send(`✅ REPAIR COMPLETE for ${DEALER_ID}`);
  } catch (error) {
    console.error(error);
    res.status(500).send(`❌ Error: ${error.message}`);
  }
});



exports.testSecrets = require('./test_secrets').testSecrets;

// ── Push Notifications ─────────────────────────────────────────────────────────
// Receives a notification request from the frontend, resolves all FCM tokens for
// the dealer, and fans out personalized push messages via FCM multicast.

const VEHICLE_MESSAGES = [
  'Hola {receptor}, {actor} agregó un {año} {marca} {modelo} {color} al inventario 🚗',
  'Nuevo en el lote 👀 {año} {marca} {modelo} {color} añadido por {actor}',
  '{actor} subió un nuevo vehículo: {marca} {modelo} {año} 🔥',
  'Ya está disponible un {año} {marca} {modelo} {color} en inventario',
  'Oye {receptor}, entró un {marca} {modelo} {año} nuevo al lote',
];

const QUOTE_MESSAGES = [
  '{actor} cotizó un {año} {marca} {modelo} {color} para {cliente} 📋',
  'Nueva cotización lista: {cliente} — {marca} {modelo} {año}',
  '{actor} preparó una cotización para {cliente} del {año} {marca} {modelo}',
  'Ojo, {cliente} ya recibió cotización del {marca} {modelo} {año} 👀',
  'Movimiento nuevo 💼 {actor} cotizó el {marca} {modelo} {año} para {cliente}',
];

const CONTRACT_MESSAGES = [
  '¡Contrato generado! {cliente} cerró el {año} {marca} {modelo} {color} con {actor} 🎉',
  '{actor} generó un contrato para {cliente}: {marca} {modelo} {año} ✅',
  'Venta cerrada 🔥 Contrato listo para el {año} {marca} {modelo} de {cliente}',
  'Buenas noticias: {actor} cerró con {cliente} el {marca} {modelo} {año} 🙌',
  'Contrato finalizado 💪 {cliente} ya va con su {año} {marca} {modelo}',
];

const TEMPLATES_BY_TYPE = {
  vehicle: VEHICLE_MESSAGES,
  quote: QUOTE_MESSAGES,
  contract: CONTRACT_MESSAGES,
};

/**
 * Picks a random template from the array and replaces {placeholder} tokens.
 * Unknown placeholders are left intact.
 */
function pickPushMessage(templates, vars) {
  const template = templates[Math.floor(Math.random() * templates.length)];
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}

exports.sendPushNotification = onRequest(async (req, res) => {
  // CORS — allow the deployed frontend and local dev origins.
  const allowedOrigins = [
    'https://carbotsystem.web.app',
    'https://carbot-5d709.web.app',
    'http://localhost:5173',
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { dealerId, type, actorName, vehicleData, clientName } = req.body ?? {};

  // Input validation
  if (!dealerId || typeof dealerId !== 'string') {
    res.status(400).json({ error: 'Missing or invalid dealerId' });
    return;
  }
  if (!type || !TEMPLATES_BY_TYPE[type]) {
    res.status(400).json({ error: 'Invalid type. Must be vehicle, quote, or contract.' });
    return;
  }
  if (!actorName || typeof actorName !== 'string') {
    res.status(400).json({ error: 'Missing or invalid actorName' });
    return;
  }
  if (!vehicleData || typeof vehicleData !== 'object') {
    res.status(400).json({ error: 'Missing or invalid vehicleData' });
    return;
  }

  const { año = '', marca = '', modelo = '', color = '' } = vehicleData;

  // Use the service-role key via Secret Manager if available, else fall back to
  // the anon key already in scope (read-only for push_subscriptions via RLS).
  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON);

  // Fetch all FCM tokens for this dealer, joined with the user's name.
  const { data: subscriptions, error: fetchError } = await supabaseClient
    .from('push_subscriptions')
    .select('fcm_token, user_id, usuarios(nombre)')
    .eq('dealer_id', dealerId);

  if (fetchError) {
    console.error('[sendPushNotification] Supabase fetch error:', fetchError);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
    return;
  }

  if (!subscriptions || subscriptions.length === 0) {
    res.status(200).json({ message: 'No subscribers for this dealer.', sent: 0 });
    return;
  }

  const messaging = admin.messaging();
  const staleTokens = [];
  let sentCount = 0;

  // Send a personalized message to each subscriber.
  // We send individually (not multicast) so each message can have a unique body.
  const sends = subscriptions.map(async ({ fcm_token, usuarios: userRow }) => {
    const receptorName = userRow?.nombre || 'tú';
    const vars = {
      receptor: receptorName,
      actor: actorName,
      año,
      marca,
      modelo,
      color,
      cliente: clientName || '',
    };

    const body = pickPushMessage(TEMPLATES_BY_TYPE[type], vars);
    const title = 'CarBot';

    try {
      await messaging.send({
        token: fcm_token,
        notification: { title, body },
        webpush: {
          notification: {
            title,
            body,
            icon: '/logoapp.png',
            badge: '/logoapp.png',
            vibrate: [200, 100, 200],
          },
        },
        data: { type, dealerId },
      });
      sentCount++;
    } catch (err) {
      const code = err.code ?? '';
      // These error codes signal a permanently invalid token.
      if (
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered'
      ) {
        staleTokens.push(fcm_token);
      } else {
        console.error('[sendPushNotification] FCM send error for token', fcm_token, err.message);
      }
    }
  });

  await Promise.all(sends);

  // Clean up invalid tokens so they don't accumulate.
  if (staleTokens.length > 0) {
    const { error: deleteError } = await supabaseClient
      .from('push_subscriptions')
      .delete()
      .in('fcm_token', staleTokens);

    if (deleteError) {
      console.error('[sendPushNotification] Failed to remove stale tokens:', deleteError);
    } else {
      console.info(`[sendPushNotification] Removed ${staleTokens.length} stale token(s).`);
    }
  }

  res.status(200).json({ sent: sentCount, stalePurged: staleTokens.length });
});

// ── storeGhlDocument ──────────────────────────────────────────────────────────
// Descarga un documento generado en GHL (PDF/imagen) usando el access token del
// dealer, lo sube al bucket "documents" de Supabase Storage, y guarda el registro
// en la tabla generated_documents. Devuelve la URL pública propia.
//
// POST /storeGhlDocument
// Body: { dealerId, ghlDocumentId, ghlUrl, documentType, clientName, vehicleId, contactId, templateId }
exports.storeGhlDocument = onRequest(
  { cors: true, secrets: [ghlClientSecret, ghlClientId, supabaseServiceKey] },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const {
      dealerId,
      ghlDocumentId,
      ghlUrl,
      documentType = 'contrato',
      clientName,
      vehicleId,
      contactId,
      templateId,
    } = req.body || {};

    if (!dealerId || !ghlUrl) {
      return res.status(400).json({ error: 'dealerId y ghlUrl son requeridos' });
    }

    const supa = createClient(SUPABASE_URL, supabaseServiceKey.value());

    // 1. Recuperar access token del dealer desde Supabase
    const { data: dealerRow, error: dealerErr } = await supa
      .from('dealers')
      .select('ghl_access_token, ghl_location_id')
      .eq('id', dealerId)
      .single();

    if (dealerErr || !dealerRow) {
      return res.status(404).json({ error: 'Dealer no encontrado', detail: dealerErr?.message });
    }

    const accessToken = dealerRow.ghl_access_token;
    if (!accessToken) {
      return res.status(403).json({ error: 'El dealer no tiene GHL access token configurado' });
    }

    // 2. Insertar registro en pending para tracking
    const { data: docRecord, error: insertErr } = await supa
      .from('generated_documents')
      .insert({
        dealer_id: dealerId,
        vehicle_id: vehicleId || null,
        contact_id: contactId || null,
        ghl_document_id: ghlDocumentId || null,
        ghl_url: ghlUrl,
        document_type: documentType,
        client_name: clientName || null,
        template_id: templateId || null,
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[storeGhlDocument] Error insertando registro:', insertErr);
      return res.status(500).json({ error: 'Error creando registro en BD', detail: insertErr.message });
    }

    const recordId = docRecord.id;

    try {
      // 3. Descargar el documento desde GHL con el access token del dealer
      const downloadRes = await fetch(ghlUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-07-28',
        },
      });

      if (!downloadRes.ok) {
        // GHL puede no permitir descarga directa de la preview URL — intentamos
        // la API de documentos si tenemos el docId
        if (!ghlDocumentId) {
          throw new Error(`GHL respondió ${downloadRes.status} y no hay ghlDocumentId para intentar API alternativa`);
        }

        // Intentar endpoint de exportación de GHL
        const exportRes = await fetch(
          `https://services.leadconnectorhq.com/proposals/${ghlDocumentId}/pdf`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Version': '2021-07-28',
            },
          }
        );

        if (!exportRes.ok) {
          throw new Error(`GHL export respondió ${exportRes.status}: no se pudo descargar el documento`);
        }

        const contentType = exportRes.headers.get('content-type') || 'application/pdf';
        const buffer = Buffer.from(await exportRes.arrayBuffer());
        await uploadToStorage({ supa, recordId, dealerId, buffer, contentType, documentType, clientName });
      } else {
        const contentType = downloadRes.headers.get('content-type') || 'application/pdf';
        const buffer = Buffer.from(await downloadRes.arrayBuffer());
        await uploadToStorage({ supa, recordId, dealerId, buffer, contentType, documentType, clientName });
      }

      // 4. Leer el registro actualizado para devolver la URL
      const { data: updated } = await supa
        .from('generated_documents')
        .select('public_url, storage_path, status')
        .eq('id', recordId)
        .single();

      return res.json({
        ok: true,
        recordId,
        publicUrl: updated?.public_url || null,
        status: updated?.status || 'stored',
      });

    } catch (err) {
      console.error('[storeGhlDocument] Error descargando/subiendo:', err.message);

      // Marcar el registro como error pero no bloqueamos al usuario
      await supa
        .from('generated_documents')
        .update({ status: 'error', error_message: err.message })
        .eq('id', recordId);

      // Devolvemos el recordId igual para que el frontend pueda mostrar la URL de GHL como fallback
      return res.status(200).json({
        ok: false,
        recordId,
        publicUrl: null,
        fallbackUrl: ghlUrl,
        error: err.message,
      });
    }
  }
);

// Helper: sube buffer a Supabase Storage y actualiza el registro
async function uploadToStorage({ supa, recordId, dealerId, buffer, contentType, documentType, clientName }) {
  const ext = contentType.includes('pdf') ? 'pdf'
    : contentType.includes('png') ? 'png'
    : contentType.includes('jpg') || contentType.includes('jpeg') ? 'jpg'
    : 'bin';

  const safeName = (clientName || 'documento')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);

  const storagePath = `${dealerId}/${documentType}/${safeName}-${recordId}.${ext}`;

  const { error: uploadErr } = await supa.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadErr) {
    throw new Error(`Supabase Storage upload falló: ${uploadErr.message}`);
  }

  const { data: urlData } = supa.storage.from('documents').getPublicUrl(storagePath);
  const publicUrl = urlData?.publicUrl || null;

  await supa
    .from('generated_documents')
    .update({ storage_path: storagePath, public_url: publicUrl, status: 'stored' })
    .eq('id', recordId);
}

// Helper: Proxy Firebase Storage images through a public URL
// Since Firebase bucket is private, we serve images through our Cloud Function
const getPublicImageUrl = (url) => {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('firebasestorage.googleapis.com')) return url;

  try {
    // Convert Firebase URL to a format we can pass as a query parameter
    // Route to the Firebase Cloud Function (not the Vercel app's /api route)
    const encodedUrl = encodeURIComponent(url);
    return `https://us-central1-carbot-5d709.cloudfunctions.net/imageProxy?url=${encodedUrl}`;
  } catch (err) {
    console.warn('getPublicImageUrl error, returning original:', err.message);
    return url;
  }
};

// 20.5 Image Proxy - Serve Firebase Storage images publicly
// Since Firebase bucket is private, this proxy downloads via Admin SDK and re-serves images
exports.imageProxy = onRequest({ cors: true }, async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const decodedUrl = decodeURIComponent(url);
    // Match Firebase Storage download URL pattern:
    //   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encodedPath>?alt=media&token=...
    const match = decodedUrl.match(/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]+)/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    const bucketName = match[1];
    const objectPath = decodeURIComponent(match[2]);
    console.log('imageProxy reading:', bucketName, objectPath);

    const bucket = admin.storage().bucket(bucketName);
    const file = bucket.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: 'File does not exist' });
    }

    const [metadata] = await file.getMetadata();
    const [buffer] = await file.download();

    res.setHeader('Content-Type', metadata.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('Image proxy error:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to proxy image', message: err.message });
  }
});

// 21. Feed Público para Meta Commerce Manager - Vehicles Catalog (Duran Fernandez Auto)
// Schema: https://developers.facebook.com/docs/marketing-api/catalog/reference/#automotive
exports.metaFeedDuran = onRequest({ cors: true }, async (req, res) => {
  const dealerId = '35594257-6176-4a79-a755-304179305938';
  const dealerSlug = 'dura-n-ferna-ndez-auto-srl';
  const catalogBaseUrl = `https://carbotsystem.com/inventario/${dealerSlug}/catalogo`;

  // Dirección del dealer (requerida por Meta Vehicles Catalog)
  const DEALER_ADDRESS = {
    addr1: 'Calle La Paz #14, Km 9 Autopista Duarte, Villa Marina',
    city: 'Santo Domingo',
    region: 'Distrito Nacional',
    country: 'DO',
    postal_code: '10608',
  };
  const DEALER_LAT = '18.4804326';
  const DEALER_LON = '-69.9718115';

  try {
    // 1. Lectura dual (Firestore prioridad, Supabase fallback/complemento) — igual al catálogo público.
    const firestoreSnap = await db.collection('Dealers').doc(dealerId).collection('vehiculos').get();

    // Normalización de marca
    const BRAND_MAP = {
      NISSA: 'Nissan', NISSAN: 'Nissan', TOYOTA: 'Toyota', HONDA: 'Honda',
      HYUNDAI: 'Hyundai', KIA: 'Kia', MAZDA: 'Mazda', CHEVROLET: 'Chevrolet',
      FORD: 'Ford', DODGE: 'Dodge', JEEP: 'Jeep', MITSUBISHI: 'Mitsubishi',
      SUBARU: 'Subaru', LEXUS: 'Lexus', INFINITI: 'Infiniti', ACURA: 'Acura',
      BMW: 'BMW', 'MERCEDES-BENZ': 'Mercedes-Benz', 'MERCEDES BENZ': 'Mercedes-Benz',
      MERCEDES: 'Mercedes-Benz', AUDI: 'Audi', VOLKSWAGEN: 'Volkswagen', VW: 'Volkswagen',
      VOLVO: 'Volvo', PORSCHE: 'Porsche', 'LAND ROVER': 'Land Rover',
      'RANGE ROVER': 'Land Rover', MINI: 'MINI', FIAT: 'Fiat', SUZUKI: 'Suzuki',
      TESLA: 'Tesla', CADILLAC: 'Cadillac', GMC: 'GMC', CHRYSLER: 'Chrysler',
      BUICK: 'Buick', LINCOLN: 'Lincoln', JAGUAR: 'Jaguar',
    };
    const normalizeBrand = (raw) => {
      const key = String(raw || '').trim().toUpperCase();
      if (!key) return '';
      return BRAND_MAP[key] || key.charAt(0) + key.slice(1).toLowerCase();
    };
    const cleanSpaces = (s) => String(s || '').replace(/\s+/g, ' ').trim();

    // Enum body_style válido de Meta: CONVERTIBLE, COUPE, HATCHBACK, MINIVAN,
    // TRUCK, SUV, SEDAN, VAN, WAGON, CROSSOVER, SMALL_CAR, OTHER
    const inferBodyStyle = (data) => {
      const raw = String(data.body_style || data.bodyStyle || data.tipo || data.tipo_vehiculo || '').toUpperCase().trim();
      const map = {
        SEDAN: 'SEDAN', SEDÁN: 'SEDAN', SUV: 'SUV', COUPE: 'COUPE', COUPÉ: 'COUPE',
        HATCHBACK: 'HATCHBACK', CONVERTIBLE: 'CONVERTIBLE', PICKUP: 'TRUCK',
        TRUCK: 'TRUCK', CAMIONETA: 'TRUCK', VAN: 'VAN', MINIVAN: 'MINIVAN',
        WAGON: 'WAGON', CROSSOVER: 'CROSSOVER', JEEPETA: 'SUV',
      };
      if (map[raw]) return map[raw];
      // Inferir por modelo/edicion si no hay campo directo
      const model = String(data.model || '').toUpperCase();
      const edition = String(data.edition || '').toUpperCase();
      const hint = `${model} ${edition}`;
      if (/ROGUE|TUCSON|CR-V|CRV|RAV4|EQUINOX|TRAX|CX-5|CX5|SANTA FE|PILOT|HIGHLANDER|PATHFINDER|EXPLORER|SORENTO|TELLURIDE|PALISADE/.test(hint)) return 'SUV';
      if (/SILVERADO|F-150|F150|TACOMA|TUNDRA|RANGER|RAM|FRONTIER/.test(hint)) return 'TRUCK';
      if (/CIVIC|COROLLA|SENTRA|ACCORD|CAMRY|ALTIMA|ELANTRA|SONATA|CLASE C|CLASE E|SERIE 3|SERIE 5|530E/.test(hint)) return 'SEDAN';
      return 'OTHER';
    };

    // Meta exige lowercase: new | used | cpo
    const STATE_MAP = {
      NUEVO: 'new', NEW: 'new',
      USADO: 'used', USED: 'used',
      'USADO IMPORTADO': 'used',
      'USADO LOCAL': 'used',
      'RECIEN IMPORTADO': 'used',
      'CERTIFIED PRE-OWNED': 'cpo', CPO: 'cpo',
    };
    const inferState = (data) => {
      const raw = String(data.condition || data.condicion || 'USED').toUpperCase().trim()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');
      return STATE_MAP[raw] || (raw.includes('NUEVO') || raw === 'NEW' ? 'new' : 'used');
    };

    const allowed = ['available', 'disponible', 'quoted', 'cotizado'];
    const inventoryMap = new Map();

    firestoreSnap.forEach((doc) => {
      const data = doc.data();
      const s = (data.status || data.estado || '').toLowerCase().trim();
      if (!allowed.includes(s)) return;
      if (data.is_trash || data._deleted || data._deleted_at) return;
      inventoryMap.set(doc.id, { id: doc.id, ...data });
    });

    // Supabase como complemento (misma lógica del catálogo público)
    try {
      const { data: sbVehicles } = await supabase
        .from('vehiculos')
        .select('*')
        .eq('dealer_id', dealerId);

      (sbVehicles || []).forEach((v) => {
        const d = v.detalles || {};
        const s = (v.estado || '').toLowerCase().trim();
        if (!allowed.includes(s)) return;
        if (v.deleted_at || v.is_trash || d._deleted || d._deleted_at || d.is_trash) return;
        if (inventoryMap.has(v.id)) return; // Firestore gana

        // Mapear Supabase → shape Firestore-like
        inventoryMap.set(v.id, {
          id: v.id,
          make: v.marca || d.make || d.marca,
          model: v.modelo || d.model || d.modelo,
          year: v.anio || d.year || d.anio,
          edition: v.edicion || d.edition || d.edicion,
          color: v.color || d.color || d.exteriorColor,
          transmission: v.transmision || d.transmission,
          fuel: v.combustible || d.fuel,
          engine: d.engine || d.motor,
          traction: v.traccion || d.traction || d.drivetrain,
          mileage: v.millas || d.mileage || 0,
          mileage_unit: d.mileage_unit || d.unit || 'KM',
          vin: v.chasis || d.vin || d.chassis,
          price: v.precio || d.price || d.price_dop || 0,
          price_dop: d.price_dop,
          currency: v.moneda_precio || d.currency || 'USD',
          condition: v.condicion || d.condition || 'USED',
          clean_carfax: v.condicion_carfax || d.clean_carfax,
          body_style: d.body_style || d.bodyStyle || d.tipo || d.tipo_vehiculo,
          images: [
            ...(Array.isArray(v.fotos) ? v.fotos : []),
            ...(Array.isArray(d.images) ? d.images : []),
            ...(Array.isArray(d.fotos) ? d.fotos : []),
          ],
          image: d.image || d.imagen || d.main_image,
          estado: v.estado,
        });
      });
    } catch (e) {
      console.error('Meta feed Supabase error (non-fatal):', e.message);
    }

    const inventory = Array.from(inventoryMap.values());

    // Escape estricto RFC 4180
    const esc = (text) => `"${String(text == null ? '' : text).replace(/"/g, '""')}"`;

    const rows = inventory.flatMap((data) => {
      const priceCheck = Number(String(data.price || data.price_dop || 0).replace(/,/g, '')) || 0;
      // Excluir vehículos sin precio, sin imagen principal, o sin make/model/year
      if (priceCheck <= 0) return [];
      if (!data.make || !data.model || !data.year) return [];

      const brandClean = normalizeBrand(data.make);
      const model = cleanSpaces(data.model) || 'N/A';
      const year = parseInt(data.year) || new Date().getFullYear();
      const trim = cleanSpaces(data.edition || data.version || '');
      const bodyStyle = inferBodyStyle(data);
      const stateOfVehicle = inferState(data);

      // Título legible
      const title = cleanSpaces(`${year} ${brandClean} ${model} ${trim}`);

      // Descripción con nuevo formato: Precio | Inicial | Millaje | Estado | Características
      const priceNum = Number(String(data.price || data.price_dop || 0).replace(/,/g, '')) || 0;
      const currency = data.currency === 'RD$' ? 'RD$'
                       : data.currency === 'US$' ? 'US$'
                       : (data.price_dop > 0 ? 'RD$' : 'US$');

      // Información de precio e inicial
      const priceFormatted = `${priceNum.toLocaleString('es-DO', { maximumFractionDigits: 0 })}`;
      const initialPrice = data.initial_payment || data.inicial || priceNum * 0.25; // Por defecto 25% del precio
      const initialFormatted = `${Number(initialPrice).toLocaleString('es-DO', { maximumFractionDigits: 0 })}`;

      // Millaje formateado — Meta exige MI o KM (uppercase)
      const mileageVal = parseInt(String(data.mileage || 0).replace(/[^\d]/g, '')) || 0;
      const unitRaw = String(data.mileage_unit || data.unit || 'KM').toUpperCase();
      const mileageUnit = unitRaw.startsWith('MI') ? 'MI' : 'KM';
      const mileageFormatted = `${mileageVal.toLocaleString('es-DO')} ${mileageUnit}`;

      // Estado del vehículo
      const cleanCarfax = (data.clean_carfax === 'Sí' || data.clean_carfax === 'Si' || data.clean_carfax === true);
      const isNewImport = (data.recently_imported === 'Sí' || data.recently_imported === 'Si' || data.recently_imported === true ||
                          data.recien_importada === 'Sí' || data.recien_importada === 'Si' || data.recien_importada === true);
      const firstOwnerRD = (data.first_owner_rd === 'Sí' || data.first_owner_rd === 'Si' || data.first_owner_rd === true ||
                           data.primer_dueno === 'Sí' || data.primer_dueno === 'Si' || data.primer_dueno === true);

      // Construir estado
      let stateDesc = '';
      if (isNewImport) {
        stateDesc = 'Recién importada';
        if (cleanCarfax) stateDesc += ' | Clean Carfax';
        if (firstOwnerRD) stateDesc += ' | Primer dueño en RD';
      } else {
        stateDesc = 'Usado en el País';
      }

      // Características principales (features)
      const features = [];
      if (data.features) {
        const featuresArray = Array.isArray(data.features) ? data.features : String(data.features).split(',');
        features.push(...featuresArray.map(f => f.trim()).filter(f => f));
      }
      // Agregar características comunes si existen como campos
      if (data.rear_camera === true || data.rear_camera === 'Sí' || data.rear_camera === 'Si') features.push('Cámara de reversa');
      if (data.sunroof === true || data.sunroof === 'Sí' || data.sunroof === 'Si') features.push('Techo panorámico');
      if (data.leather_seats === true || data.leather_seats === 'Sí' || data.leather_seats === 'Si') features.push('Asientos en piel');
      if (data.four_wheel === true || data.four_wheel === '4x4' || data.traction?.includes('4x4')) features.push('Tracción 4x4');
      if (data.apple_carplay === true || data.apple_carplay === 'Sí' || data.apple_carplay === 'Si') features.push('Apple CarPlay y Android Auto');
      if (data.air_suspension === true || data.air_suspension === 'Sí' || data.air_suspension === 'Si') features.push('Suspensión de aire');

      // Construir descripción final
      const descriptionParts = [
        `Precio: ${currency} ${priceFormatted}`,
        `Inicial: ${currency} ${initialFormatted}`,
        `Millaje: ${mileageFormatted}`,
        '',
        stateDesc,
      ];

      if (features.length > 0) {
        descriptionParts.push('');
        features.forEach(f => descriptionParts.push(`• ${f}`));
      }

      const description = descriptionParts.join('\n') || `${title} disponible en Durán Fernández Auto.`;

      // Precio formateado para Meta (numérico)
      // Nota: Currency arriba ya está en formato local (RD$ o US$)
      // Para Meta, necesitamos el número puro
      const priceStr = `${priceNum.toFixed(2)}`;

      // Imágenes: consolidar desde todas las fuentes posibles, deduplicar y filtrar incompatibles con Meta.
      // Meta soporta: jpg, jpeg, png, webp, bmp, gif. NO soporta: heic, heif, tiff, raw.
      const rawSources = [
        data.images,
        data.fotos,
        data.photos,
        data.gallery,
        data.image,
        data.photo,
        data.main_image,
        data.imagen,
      ];
      const flat = [];
      rawSources.forEach((src) => {
        if (Array.isArray(src)) flat.push(...src);
        else if (typeof src === 'string') flat.push(src);
      });
      const seen = new Set();
      const compat = [];
      for (const u of flat) {
        if (!u || typeof u !== 'string') continue;
        if (!u.startsWith('https://')) continue;
        const base = u.split('?')[0].toLowerCase();
        // Excluir formatos no soportados por Meta
        if (/\.(heic|heif|tiff|tif|raw|bmp)$/.test(base)) continue;
        // Aceptar extensiones válidas
        if (!/\.(jpg|jpeg|png|webp|gif)$/.test(base)) continue;
        // Deduplicar por URL base (sin query params)
        if (seen.has(base)) continue;
        seen.add(base);
        compat.push(u);
      }
      // Convert all Firebase Storage URLs to public downloadable URLs (no token expiration)
      const publicCompat = compat.map(url => {
        const converted = getPublicImageUrl(url);
        if (url !== converted) {
          console.log(`✓ Converted image URL from Firebase token-based to public CDN`);
        }
        return converted;
      });
      if (publicCompat.length === 0) {
        console.warn(`⚠️ Vehicle ${data.id}: No images found after filtering`);
      } else {
        console.log(`✓ Vehicle ${data.id}: ${publicCompat.length} images converted to public URLs`);
      }
      const mainImage = publicCompat[0] || 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=1200';
      // Meta permite hasta 20 additional_image_link
      const additionalImages = publicCompat.slice(1, 21).join(',');

      // URL al detalle en el catálogo público (canonical)
      const url = `https://carbotsystem.com/inventario/${dealerSlug}/vehiculo/${data.id}`;

      // Color exterior
      const exteriorColor = cleanSpaces(data.color || '');

      // VIN (opcional pero recomendado)
      const vin = cleanSpaces(data.vin || data.chassis || '').toUpperCase();

      // Transmission enum: AUTOMATIC | MANUAL | OTHER
      const txRaw = String(data.transmission || data.transmision || '').toUpperCase();
      const transmission = txRaw.includes('AUTO') ? 'AUTOMATIC'
                          : txRaw.includes('MANU') ? 'MANUAL'
                          : 'OTHER';

      // Fuel type enum: DIESEL | ELECTRIC | FLEX | GASOLINE | HYBRID | OTHER
      const fuelRaw = String(data.fuel || data.combustible || '').toUpperCase();
      const fuelType = fuelRaw.includes('DIESEL') ? 'DIESEL'
                      : fuelRaw.includes('ELECTR') ? 'ELECTRIC'
                      : fuelRaw.includes('HIBR') || fuelRaw.includes('HYBR') ? 'HYBRID'
                      : fuelRaw.includes('FLEX') ? 'FLEX'
                      : fuelRaw.includes('GAS') ? 'GASOLINE'
                      : 'OTHER';

      // Drivetrain enum: 4X2 | 4X4 | AWD | FWD | RWD | OTHER
      const drRaw = String(data.traction || data.drivetrain || data.traccion || '').toUpperCase();
      const drivetrain = drRaw.includes('4X4') ? '4X4'
                        : drRaw.includes('AWD') ? 'AWD'
                        : drRaw.includes('FWD') ? 'FWD'
                        : drRaw.includes('RWD') ? 'RWD'
                        : drRaw.includes('4X2') ? '4X2'
                        : 'OTHER';

      // vehicle_offer_id: stable unique ID derived from vehicle UUID — never changes
      const vehicleOfferId = `DURAN_${String(data.id).replace(/-/g, '').slice(0, 12).toUpperCase()}`;
      const availability = 'in stock';

      // ── Required-field gate (Meta spec) ──────────────────────────────
      const vehicleId = data.id;
      if (!vehicleId || !vehicleOfferId || !title || priceNum <= 0 || !availability) {
        console.warn(`⚠️ Skipping vehicle ${vehicleId || 'unknown'}: missing required Meta field`);
        return [];
      }

      return [
        esc(vehicleId),                   // vehicle_id
        esc(vehicleOfferId),              // vehicle_offer_id
        esc(title),                       // title
        esc(description),                 // description
        esc(url),                         // url
        esc(mainImage),                   // image[0].url
        esc(additionalImages),            // additional_image_link
        esc(brandClean),                  // make
        esc(model),                       // model
        esc(year),                        // year
        esc(trim),                        // trim
        esc(bodyStyle),                   // body_style
        esc(stateOfVehicle),              // state_of_vehicle
        esc(mileageVal),                  // mileage.value
        esc(mileageUnit),                 // mileage.unit
        esc(exteriorColor),               // exterior_color
        esc(transmission),                // transmission
        esc(fuelType),                    // fuel_type
        esc(drivetrain),                  // drivetrain
        esc(vin),                         // vin
        esc(priceStr),                    // price
        esc(availability),                // availability
        esc(DEALER_ADDRESS.addr1),        // address.addr1
        esc(DEALER_ADDRESS.city),         // address.city
        esc(DEALER_ADDRESS.region),       // address.region
        esc(DEALER_ADDRESS.country),      // address.country
        esc(DEALER_ADDRESS.postal_code),  // address.postal_code
        esc(DEALER_LAT),                  // latitude
        esc(DEALER_LON),                  // longitude
      ].join(',');
    });

    const headers = [
      'vehicle_id', 'vehicle_offer_id', 'title', 'description', 'url', 'image[0].url', 'additional_image_link',
      'make', 'model', 'year', 'trim', 'body_style', 'state_of_vehicle',
      'mileage.value', 'mileage.unit', 'exterior_color', 'transmission', 'fuel_type',
      'drivetrain', 'vin', 'price', 'availability',
      'address.addr1', 'address.city', 'address.region', 'address.country', 'address.postal_code',
      'latitude', 'longitude',
    ].map((h) => `"${h}"`).join(',');

    const csvContent = [headers, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=meta_feed_duran.csv');
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('Meta Feed Error:', err);
    return res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────
// 💱 Recálculo diario del inicial automático con la tasa del día
// ──────────────────────────────────────────────────────────────────
// Solo toca dealers con `tasa_auto_diaria = true`. Para los demás la tasa está
// congelada y sus iniciales no se mueven hasta que el dealer los cambie.
// Solo se recalculan los vehículos con `inicial_automatico = true`: un inicial
// escrito por el dealer nunca se sobreescribe.
const { onSchedule } = require("firebase-functions/v2/scheduler");

exports.recalcInicialesDiario = onSchedule(
  {
    schedule: "0 8 * * *",
    timeZone: "America/Santo_Domingo",
    secrets: [supabaseServiceKey],
    region: "us-central1",
  },
  async () => {
    const supa = createClient(SUPABASE_URL, supabaseServiceKey.value());

    // Tasa del día desde la fuente compartida (?force=1 salta la caché de 2h
    // para que la corrida diaria siempre traiga la cotización fresca).
    let perUsd = null;
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/exchange-rate?force=1`);
      const d = await r.json();
      perUsd = d?.perUsd?.USD ? d.perUsd : null;
    } catch (e) {
      console.error("recalcInicialesDiario: no se pudo leer la tasa", e);
    }
    if (!perUsd) {
      console.error("recalcInicialesDiario: sin tasa, se aborta sin tocar datos");
      return;
    }

    const { data: dealers, error: dErr } = await supa
      .from("dealers")
      .select("id, nombre, moneda_principal, moneda_secundaria, porcentaje_inicial_auto")
      .eq("tasa_auto_diaria", true);
    if (dErr) {
      console.error("recalcInicialesDiario: error leyendo dealers", dErr);
      return;
    }
    if (!dealers?.length) {
      console.log("recalcInicialesDiario: ningún dealer con tasa automática");
      return;
    }

    for (const dealer of dealers) {
      const primary = dealer.moneda_principal || "DOP";
      const pct = (dealer.porcentaje_inicial_auto > 0 ? Number(dealer.porcentaje_inicial_auto) : 30) / 100;
      if (!(perUsd[primary] > 0)) {
        console.warn(`recalcInicialesDiario: sin tasa para ${primary}, se salta ${dealer.nombre}`);
        continue;
      }

      const { data: rows, error: vErr } = await supa
        .from("vehiculos")
        .select("id, precio, moneda_precio, porcentaje_inicial")
        .eq("dealer_id", dealer.id)
        .eq("inicial_automatico", true)
        .is("deleted_at", null)
        .gt("precio", 0);
      if (vErr) {
        console.error(`recalcInicialesDiario: error leyendo vehículos de ${dealer.nombre}`, vErr);
        continue;
      }
      if (!rows?.length) continue;

      let ok = 0;
      for (const v of rows) {
        const from = perUsd[v.moneda_precio] || perUsd[primary];
        // amount * (primary por USD) / (moneda origen por USD) = amount en primary
        const priceInPrimary = (Number(v.precio) * perUsd[primary]) / from;
        if (!(priceInPrimary > 0)) continue;
        // Un vehículo con % propio sigue siguiendo la tasa del día (si no, su
        // inicial quedaría congelado), pero con SU porcentaje, no el global.
        const vehiclePct = v.porcentaje_inicial === null || v.porcentaje_inicial === undefined
          ? pct
          : Number(v.porcentaje_inicial) / 100;
        const { error: uErr } = await supa
          .from("vehiculos")
          .update({ inicial: Math.round(priceInPrimary * vehiclePct), moneda_inicial: primary })
          .eq("id", v.id);
        if (!uErr) ok++;
      }
      console.log(`recalcInicialesDiario: ${dealer.nombre} → ${ok}/${rows.length} actualizados (1 USD = ${perUsd[primary]} ${primary}, ${pct * 100}%)`);
    }
  }
);
