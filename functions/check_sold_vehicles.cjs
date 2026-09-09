const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const dbUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function checkSoldVehicles() {
    const query = `
        SELECT id, titulo_vehiculo, estado, color, chasis_vin, transmision, motor, combustible, 
               traccion, techo, millas, precio, detalles
        FROM vehiculos 
        WHERE estado = 'Vendido'
        ORDER BY created_at DESC NULLS LAST
        LIMIT 5;
    `;

    const res = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    const data = await res.json();

    if (Array.isArray(data)) {
        data.forEach(v => {
            console.log(`\n📋 Vehicle: ${v.id}`);
            console.log(`  titulo: ${v.titulo_vehiculo}`);
            console.log(`  estado: ${v.estado}`);
            console.log(`  color: ${v.color}`);
            console.log(`  chasis_vin: ${v.chasis_vin}`);
            console.log(`  transmision: ${v.transmision}`);
            console.log(`  motor: ${v.motor}`);
            console.log(`  combustible: ${v.combustible}`);
            console.log(`  traccion: ${v.traccion}`);
            console.log(`  millas: ${v.millas}`);
            console.log(`  precio: ${v.precio}`);
            console.log(`  detalles (keys): ${v.detalles ? Object.keys(v.detalles).join(', ') : 'NULL'}`);
            if (v.detalles) {
                console.log(`  detalles.make: ${v.detalles.make}`);
                console.log(`  detalles.model: ${v.detalles.model}`);
                console.log(`  detalles.year: ${v.detalles.year}`);
                console.log(`  detalles.color: ${v.detalles.color}`);
            }
        });
    } else {
        console.log("Error or no results:", JSON.stringify(data));
    }

    // Also check ALL vehicles to find the one from the screenshot (Hyundai Elantra 2020)
    console.log("\n\n🔍 Searching for Hyundai Elantra...");
    const query2 = `
        SELECT id, titulo_vehiculo, estado, color, chasis_vin, precio, detalles
        FROM vehiculos 
        WHERE titulo_vehiculo ILIKE '%HYUNDAI%' OR titulo_vehiculo ILIKE '%ELANTRA%'
        ORDER BY created_at DESC
        LIMIT 5;
    `;

    const res2 = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query2 })
    });
    const data2 = await res2.json();
    if (Array.isArray(data2)) {
        data2.forEach(v => {
            console.log(`\n📋 ${v.titulo_vehiculo} [${v.estado}] ID: ${v.id}`);
            console.log(`  color: ${v.color} | vin: ${v.chasis_vin} | precio: ${v.precio}`);
            if (v.detalles) {
                console.log(`  detalles: make=${v.detalles.make}, model=${v.detalles.model}, year=${v.detalles.year}, color=${v.detalles.color}`);
            }
        });
    } else {
        console.log("Result:", JSON.stringify(data2));
    }
}

checkSoldVehicles().catch(console.error);
