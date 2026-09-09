const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const dbUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function checkAll() {
    // Check ALL vehicles, all statuses
    const query = `
        SELECT id, titulo_vehiculo, estado, dealer_id, 
               detalles->>'make' as make, detalles->>'model' as model
        FROM vehiculos
        ORDER BY created_at DESC;
    `;

    const res = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    const data = await res.json();
    console.log("ALL vehicles in Supabase:");
    if (Array.isArray(data)) {
        data.forEach(v => {
            console.log(`  [${v.estado}] ${v.titulo_vehiculo} | dealer: ${v.dealer_id} | make: ${v.make}, model: ${v.model}`);
        });
        console.log(`\nTotal: ${data.length}`);
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}

checkAll().catch(console.error);
