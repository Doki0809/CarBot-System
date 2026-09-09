const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const dbUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function checkVehicleData() {
    const query = `
        SELECT id, titulo_vehiculo, estado, color, condicion_carfax, chasis_vin, 
               traccion, transmision, motor, techo, combustible, llave, camara,
               material_asientos, precio, inicial, millas, cantidad_asientos,
               baul_electrico, sensores, carplay, vidrios_electricos,
               detalles
        FROM vehiculos 
        WHERE estado IN ('Disponible', 'Cotizado')
        ORDER BY created_at DESC
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
            console.log(`\n📋 ${v.titulo_vehiculo} [${v.estado}] ID: ${v.id}`);
            console.log(`  === TOP-LEVEL COLUMNS ===`);
            console.log(`  color: "${v.color}"`);
            console.log(`  condicion_carfax: "${v.condicion_carfax}"`);
            console.log(`  traccion: "${v.traccion}"`);
            console.log(`  transmision: "${v.transmision}"`);
            console.log(`  motor: "${v.motor}"`);
            console.log(`  techo: "${v.techo}"`);
            console.log(`  combustible: "${v.combustible}"`);
            console.log(`  llave: "${v.llave}"`);
            console.log(`  camara: "${v.camara}"`);
            console.log(`  material_asientos: "${v.material_asientos}"`);
            console.log(`  cantidad_asientos: ${v.cantidad_asientos}`);
            console.log(`  baul_electrico: ${v.baul_electrico}`);
            console.log(`  sensores: ${v.sensores}`);
            console.log(`  carplay: ${v.carplay}`);
            console.log(`  vidrios_electricos: ${v.vidrios_electricos}`);
            console.log(`  === DETALLES (relevant keys) ===`);
            if (v.detalles) {
                const d = v.detalles;
                console.log(`  engine_type: "${d.engine_type}"`);
                console.log(`  engine_cc/liters: "${d.engine_cc}" / "${d.engine_liters}"`);
                console.log(`  engine_cyl: "${d.engine_cyl}"`);
                console.log(`  engine_turbo/turbo: "${d.engine_turbo}" / "${d.turbo}"`);
                console.log(`  fuel: "${d.fuel}"`);
                console.log(`  traction: "${d.traction}"`);
                console.log(`  roof_type: "${d.roof_type}"`);
                console.log(`  key_type: "${d.key_type}"`);
                console.log(`  seat_material: "${d.seat_material}"`);
                console.log(`  seats: "${d.seats}"`);
                console.log(`  condition: "${d.condition}"`);
                console.log(`  clean_carfax: "${d.clean_carfax}"`);
                console.log(`  trunk: "${d.trunk}"`);
                console.log(`  sensors: "${d.sensors}"`);
                console.log(`  camera: "${d.camera}"`);
                console.log(`  carplay: "${d.carplay}"`);
                console.log(`  electric_windows: "${d.electric_windows}"`);
                console.log(`  mileage_unit: "${d.mileage_unit}"`);
                console.log(`  currency: "${d.currency}"`);
                console.log(`  edition: "${d.edition}"`);
            }
        });
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}

checkVehicleData().catch(console.error);
