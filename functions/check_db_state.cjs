const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const dbUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function checkDBState() {
    // 1. Check for triggers on vehiculos table
    console.log("🔍 Checking for triggers on vehiculos table...");
    const triggerQuery = `
        SELECT trigger_name, event_manipulation, action_statement, action_timing
        FROM information_schema.triggers
        WHERE event_object_table = 'vehiculos';
    `;

    let res = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: triggerQuery })
    });
    let data = await res.json();
    console.log("Triggers:", JSON.stringify(data, null, 2));

    // 2. Check a recently sold vehicle to see what data remains
    console.log("\n🔍 Checking recently sold vehicles...");
    const soldQuery = `
        SELECT id, titulo_vehiculo, estado, color, chasis_vin, transmision, motor, combustible, 
               traccion, techo, millas, precio, detalles->>'make' as make, detalles->>'model' as model, 
               detalles->>'year' as year
        FROM vehiculos 
        WHERE estado = 'Vendido'
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 5;
    `;

    res = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: soldQuery })
    });
    data = await res.json();
    console.log("Sold vehicles:", JSON.stringify(data, null, 2));

    // 3. Check column defaults
    console.log("\n🔍 Checking column defaults...");
    const defaultsQuery = `
        SELECT column_name, column_default, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'vehiculos'
        ORDER BY ordinal_position;
    `;

    res = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: defaultsQuery })
    });
    data = await res.json();
    console.log("Column info:", JSON.stringify(data, null, 2));
}

checkDBState().catch(console.error);
