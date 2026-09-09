const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

// Firebase Init
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Supabase Config
const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const dbUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function executeSql(query) {
    const res = await fetch(dbUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${adminKey}`,
            "Content-Type": "application/json",
            "User-Agent": "carbot-recovery-script/1.0"
        },
        body: JSON.stringify({ query })
    });
    const status = res.status;
    const text = await res.text();
    return { status, text };
}

function esc(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "''");
}

function isUUID(str) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(str));
}

async function runRecovery() {
    console.log("🚀 Starting Data Recovery...");

    const recoveryMap = new Map(); // vehicleId -> metadata

    const groupNames = ['items', 'contracts', 'quotes'];
    console.log(`Scanning collection groups: ${groupNames.join(', ')}`);

    for (const groupName of groupNames) {
        try {
            const snap = await db.collectionGroup(groupName).get();
            if (snap.empty) continue;

            console.log(`  - Group [${groupName}]: Found ${snap.size} documents.`);
            for (const doc of snap.docs) {
                const data = doc.data();
                const vId = data.vehicleId || data.vehiculo_id || data.idVehiculo;

                if (vId && typeof vId === 'string' && vId.length > 5) {
                    const nested = (data.vehicle && typeof data.vehicle === 'object' && !Array.isArray(data.vehicle)) ? data.vehicle :
                        (data.vehiculo && typeof data.vehiculo === 'object' && !Array.isArray(data.vehiculo)) ? data.vehiculo : {};

                    if (vId.includes('cee7b7bb') || vId.includes('674f2e6c')) {
                        console.log(`    🔍 DEBUG [${vId}]:`);
                        console.log(`      data keys: ${Object.keys(data).join(', ')}`);
                        console.log(`      nested keys: ${Object.keys(nested).join(', ')}`);
                        if (data.vehicle) console.log(`      vehicle type: ${typeof data.vehicle} (Array? ${Array.isArray(data.vehicle)})`);
                    }

                    // Normalize fields from any level
                    const meta = {
                        make: nested.make || nested.marca || data.make || data.marca || '',
                        model: nested.model || nested.modelo || data.model || data.modelo || '',
                        year: nested.year || nested.anio || data.year || data.anio || null,
                        vin: nested.vin || nested.chasis || nested.chasis_vin || data.vin || data.chasis || data.chasis_vin || '',
                        color: nested.color || data.color || '',
                        transmission: nested.transmission || nested.transmision || data.transmission || data.transmision || '',
                        traction: nested.traction || nested.traccion || data.traction || data.traccion || '',
                        engine: nested.engine || nested.motor || data.engine || data.motor || '',
                        fuel: nested.fuel || nested.combustible || data.fuel || data.combustible || '',
                        mileage: nested.mileage || nested.millas || data.mileage || data.millas || 0,
                        price: nested.price || nested.precio || data.price || data.precio || 0
                    };

                    const hasContent = meta.vin || meta.make || meta.model || meta.color;

                    if (hasContent) {
                        if (!isUUID(vId)) {
                            // console.log(`      ⚠️ Identificado ID no-UUID (${vId}) en ${doc.ref.path}. Omitiendo para actualización directa.`);
                            continue;
                        }

                        if (!recoveryMap.has(vId)) {
                            console.log(`      ✅ ADDED candidate ${vId} from ${doc.ref.path}`);
                        }
                        const existing = recoveryMap.get(vId) || {};
                        recoveryMap.set(vId, { ...existing, ...meta });
                    } else {
                        // console.log(`      ℹ️ Doc ${doc.ref.path} tiene VehicleID ${vId} pero no metadatos útiles.`);
                    }
                }
            }
        } catch (e) {
            console.error(`Error scanning group ${groupName}:`, e.message);
        }
    }

    console.log(`\n✅ Identified ${recoveryMap.size} recovery candidates.`);

    // 2. Execute Updates in Supabase
    let successCount = 0;
    let failCount = 0;

    for (const [vId, meta] of recoveryMap.entries()) {
        console.log(`\nRestoring Vehicle ${vId}...`);

        // Map fields
        const brand = esc(meta.make || meta.marca || '');
        const model = esc(meta.model || meta.modelo || '');
        const year = parseInt(meta.year || meta.anio) || null;
        const vin = esc(meta.vin || meta.chasis || meta.chasis_vin || '');
        const color = esc(meta.color || '');
        const trans = esc(meta.transmission || meta.transmision || '');
        const traction = esc(meta.traction || meta.traccion || '');
        const engine = esc(meta.engine || meta.motor || '');
        const fuel = esc(meta.fuel || meta.combustible || '');
        const miles = parseFloat(meta.mileage || meta.millas) || 0;
        const price = parseFloat(meta.price || meta.precio) || 0;

        // Prepare Details JSON
        const details = {
            chasis_vin: vin,
            anio: year,
            marca: brand,
            modelo: model,
            color: color,
            transmision: trans,
            traccion: traction,
            motor: engine,
            combustible: fuel,
            millas: miles,
            precio: price,
            _recovered_at: new Date().toISOString()
        };

        const sql = `
            UPDATE vehiculos 
            SET 
                chasis_vin = COALESCE(NULLIF('${vin}', ''), chasis_vin),
                marca = COALESCE(NULLIF('${brand}', ''), marca),
                modelo = COALESCE(NULLIF('${model}', ''), modelo),
                anio = COALESCE(${year}, anio),
                color = COALESCE(NULLIF('${color}', ''), color),
                transmision = COALESCE(NULLIF('${trans}', ''), transmision),
                traccion = COALESCE(NULLIF('${traction}', ''), traccion),
                motor = COALESCE(NULLIF('${engine}', ''), motor),
                combustible = COALESCE(NULLIF('${fuel}', ''), combustible),
                millas = COALESCE(${miles}, millas),
                precio = COALESCE(${price}, precio),
                detalles = detalles || '${JSON.stringify(details)}'::jsonb
            WHERE id = '${vId}';
        `;

        const { status, text } = await executeSql(sql);
        if (status === 201 || status === 200) {
            console.log(`  ✅ Success: ${brand} ${model} (${vId})`);
            successCount++;
        } else {
            console.error(`  ❌ Failed: ${vId} | Status: ${status} | Error: ${text}`);
            failCount++;
        }
    }

    console.log(`\n--- Recovery Finished ---`);
    console.log(`Total Success: ${successCount}`);
    console.log(`Total Failed: ${failCount}`);
}

runRecovery().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
