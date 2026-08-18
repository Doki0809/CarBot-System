// src/ghl_integration/ghlService.js

export const prepararPayloadGHL = (cliente, vehiculo, locationId) => {
    // Helper para moneda con divisa textual — soporta DOP, USD, EUR, COP
    const formatCurrencyWithText = (monto, moneda) => {
        if (monto === undefined || monto === null || monto === "") return "";
        const val = Number(String(monto).replace(/[^0-9.-]+/g, ""));
        if (isNaN(val) || val === 0) return "";
        const formatted = val.toLocaleString('en-US');
        const map = {
            DOP: `RD$ ${formatted} Pesos`,
            'RD$': `RD$ ${formatted} Pesos`,
            USD: `US$ ${formatted} Dolares`,
            EUR: `€ ${formatted} Euros`,
            COP: `COP$ ${formatted} Pesos Colombianos`,
        };
        return map[moneda] || `US$ ${formatted} Dolares`;
    };

    const formatMillaje = () => {
        const m = vehiculo.mileage || vehiculo.kilometraje || vehiculo.millaje || vehiculo.millas;
        if (!m) return "";
        const val = Number(String(m).replace(/[^0-9.-]+/g, ""));
        if (isNaN(val)) return String(m);
        const unit = vehiculo.mileage_unit === 'MI' ? 'Millas' : 'Km';
        return `${val.toLocaleString('en-US')} ${unit}`;
    };

    // Helper para motor
    const formatMotor = () => {
        const parts = [];
        // 1. Cilindrada
        const ccRaw = vehiculo.engine_cc || vehiculo.cc || "";
        if (ccRaw && ccRaw !== "-") {
            const cc = String(ccRaw).toUpperCase().replace(/\s*L$/, "").replace(/\s*CC$/, "").trim();
            parts.push(`${cc} L`);
        }
        // 2. Cilindros
        const cylRaw = vehiculo.engine_cyl || vehiculo.cilindros || "";
        if (cylRaw && cylRaw !== "-") {
            const cyl = String(cylRaw).toUpperCase().replace(" CILINDROS", "").replace(" CIL", "").replace("CIL", "").trim();
            parts.push(`${cyl} Cilindros`);
        }
        // 3. Tipo / Turbo
        const typeStr = String(vehiculo.engine_type || vehiculo.turbo || vehiculo.motor || "").toLowerCase();
        if (typeStr.includes("turbo") || vehiculo.turbo === true || vehiculo.turbo === "Sí") {
            parts.push("Turbo");
        }
        return parts.join(', ');
    };

    // Helper para asientos
    const formatAsientos = () => {
        const qty = vehiculo.seats || vehiculo.filas_asientos || vehiculo.filas;
        return qty ? `${qty} Filas de asientos` : '';
    };

    // Helper general para booleanos Sí/No
    const formatBool = (v) => {
        if (v === null || v === undefined || v === "" || v === "-") return "No";
        const s = String(v).toLowerCase().trim();
        const truthy = ["true", "si", "sí", "yes", "s", "y", "1", "es clean carfax"];
        return truthy.includes(s) ? "Sí" : "No";
    };

    // Helper para carfax
    const formatCarfax = () => {
        const cf = String(vehiculo.carfax || vehiculo.clean_carfax || '').toLowerCase();
        if (cf === 'clean' || cf.includes('clean carfax') || cf === 'si' || cf === 'true' || cf === '1') {
            return 'Es clean CarFax';
        }
        return '-';
    };

    const payload = {
        // Datos Estándar (No necesitan ID especial)
        firstName: (cliente.nombre || "Cliente").toUpperCase(),
        lastName: (cliente.apellido || "CarBot").toUpperCase(),
        locationId: locationId,
        // CAMPOS PERSONALIZADOS (Mapeados según etiquetas e IDs de GHL)
        customFields: [
            // 1. Información Básica y Vehículo
            { id: "marca", key: "marca", value: (vehiculo.make || vehiculo.marca || "").toUpperCase() },
            { id: "modelo", key: "modelo", value: (vehiculo.model || vehiculo.modelo || "").toUpperCase() },
            { id: "ano", key: "ano", value: String(vehiculo.year || vehiculo.ano || "") },
            { id: "color", key: "color", value: (vehiculo.color || vehiculo.exteriorColor || "").toUpperCase() },
            { id: "edicion", key: "edicion", value: (vehiculo.trim || vehiculo.edition || vehiculo.edicion || "").toUpperCase() },
            { id: "chasis", key: "chasis", value: (vehiculo.vin || vehiculo.chasis_vin || vehiculo.chasis || "").toUpperCase() },
            { id: "kilometraje", key: "kilometraje", value: formatMillaje() },
            { id: "tipo", key: "tipo", value: vehiculo.type || vehiculo.tipo_vehiculo || "" },
            { id: "condicion", key: "condicion", value: vehiculo.condition || vehiculo.condicion || "" },
            { id: "carfax", key: "carfax", value: formatCarfax() },
            { id: "placa", key: "placa", value: (vehiculo.plate || vehiculo.placa || "").toUpperCase() },

            // 2. Mecánica y Técnica (Mapeo detallado solicitado)
            { id: "transmision", key: "transmision", value: vehiculo.transmision || vehiculo.transmission || "" },
            { id: "combustible", key: "combustible", value: vehiculo.combustible || vehiculo.fuel || "" },
            { id: "motor", key: "motor", value: formatMotor() },
            { id: "traccion", key: "traccion", value: vehiculo.traccion || vehiculo.traction || "" },
            { id: "cilindros", key: "cilindros", value: String(vehiculo.cilindros || vehiculo.engine_cyl || "") },

            // 3. Confort y Extras
            { id: "filas_asientos", key: "filas_asientos", value: formatAsientos() },
            { id: "interior", key: "interior", value: vehiculo.material_asientos || vehiculo.seat_material || "" },
            { id: "techo", key: "techo", value: vehiculo.techo || vehiculo.roof_type || "" },
            { id: "carplay", key: "carplay", value: formatBool(vehiculo.carplay) },
            { id: "camara", key: "camara", value: formatBool(vehiculo.camara || vehiculo.camera) },
            { id: "sensores", key: "sensores", value: formatBool(vehiculo.sensores || vehiculo.sensors) },
            { id: "baul_electrico", key: "baul_electrico", value: formatBool(vehiculo.baul_electrico || vehiculo.trunk) },
            { id: "cristales_electrico", key: "cristales_electrico", value: formatBool(vehiculo.vidrios_electricos || vehiculo.electric_windows) },
            { id: "llave", key: "llave", value: vehiculo.llave || vehiculo.key_type || "" },

            // 4. Financiamiento (CLAVES CONFIRMADAS)
            { id: "precio", key: "precio", value: formatCurrencyWithText(cliente.precioFinal, cliente.monedaVenta) },
            { id: "inicial", key: "inicial", value: formatCurrencyWithText(cliente.inicial, cliente.monedaInicial) },
            { id: "banco_o_financiera", key: "banco_o_financiera", value: (cliente.banco || "").toUpperCase() },
            { id: "tiempo_de_garanta", key: "tiempo_de_garanta", value: cliente.tiempoGarantia || "" },

            // 4.1 Ubicación (campos personalizados, no estándar de GHL)
            { id: "num_casaapartamento", key: "num_casaapartamento", value: (cliente.aptNumber || "").toUpperCase() },
            { id: "sector", key: "sector", value: (cliente.sector || "").toUpperCase() },

            // 5. Otros datos
            { id: "a_quien_va_dirigida", key: "a_quien_va_dirigida", value: `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim().toUpperCase() },
            { id: "cedula", key: "cedula", value: cliente.cedula || "" }
        ]
    };

    if (cliente.email && cliente.email.trim()) {
        payload.email = cliente.email.trim();
    }

    if (cliente.telefono) {
        // Normalizar teléfono: solo números (y + opcional al inicio)
        const normalizedPhone = cliente.telefono.replace(/[^\d+]/g, '');
        if (normalizedPhone.length >= 7) {
            payload.phone = normalizedPhone;
        }
    }

    // Dirección — campos estándar del contacto en GHL (no van en customFields)
    if (cliente.address1 && cliente.address1.trim()) payload.address1 = cliente.address1.trim();
    if (cliente.city && cliente.city.trim()) payload.city = cliente.city.trim();
    if (cliente.state && cliente.state.trim()) payload.state = cliente.state.trim();
    // El campo estándar "country" de GHL exige código ISO 3166-1 alpha-2 (ej. "DO"),
    // no acepta texto libre como "REPÚBLICA DOMINICANA" — GHL responde 400
    // "country must be valid" y no se genera el documento. Resolvemos el texto
    // que escribe el usuario (o el que trae Google Places) al código correcto.
    const COUNTRY_ISO_MAP = {
        'REPUBLICA DOMINICANA': 'DO', 'REPÚBLICA DOMINICANA': 'DO',
        'REP. DOM.': 'DO', 'REP DOM': 'DO', 'REP. DOM': 'DO',
        'DOMINICAN REPUBLIC': 'DO', 'DO': 'DO',
    };
    const countryInput = (cliente.country || '').trim().toUpperCase();
    payload.country = COUNTRY_ISO_MAP[countryInput] || 'DO';
    if (cliente.postalCode && String(cliente.postalCode).trim()) payload.postalCode = String(cliente.postalCode).trim();

    return payload;
};

export const generarContratoEnGHL = async (cliente, vehiculo, locationId, templateId, dealerId, accessToken, documentType) => {
    const payload = prepararPayloadGHL(cliente, vehiculo, locationId);
    try {
        const response = await fetch('/api/ghl/generar-contrato', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contactData: payload,
                templateId: templateId,
                ghl_access_token: accessToken,
                dealerId: dealerId,
                vehicleData: vehiculo,
                documentType: documentType || 'contrato',
                financialData: {
                    precio_venta: cliente.precioFinal,
                    moneda_venta: cliente.monedaVenta,
                    pago_inicial: cliente.inicial,
                    moneda_inicial: cliente.monedaInicial
                }
            })
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || "Error al comunicar con el backend");
        }
        const data = await response.json();
        return {
          documentUrl: data.documentUrl,
          ghlDocumentId: data.ghlDocumentId || null,
        };
    } catch (error) {
        console.error("Fallo la integración con GHL:", error);
        throw error;
    }
};
