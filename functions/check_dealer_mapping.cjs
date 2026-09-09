const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const dbUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function checkDealerMapping() {
    // 1. Check what dealer IDs exist in vehiculos table
    const query1 = `
        SELECT DISTINCT dealer_id, count(*) as vehicle_count, 
               min(estado) as sample_estado
        FROM vehiculos 
        GROUP BY dealer_id;
    `;

    let res = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query1 })
    });
    let data = await res.json();
    console.log("Dealer IDs in vehiculos table:", JSON.stringify(data, null, 2));

    // 2. Check if the UUID from the URL matches any dealer
    const urlDealerId = "33723933-7372-4557-a143-447167b47a78";
    const query2 = `
        SELECT id, titulo_vehiculo, estado, color, detalles->>'make' as make, detalles->>'model' as model
        FROM vehiculos 
        WHERE dealer_id = '${urlDealerId}'
        ORDER BY created_at DESC
        LIMIT 10;
    `;

    res = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query2 })
    });
    data = await res.json();
    console.log(`\nVehicles for dealer ${urlDealerId}:`, JSON.stringify(data, null, 2));
}

checkDealerMapping().catch(console.error);
