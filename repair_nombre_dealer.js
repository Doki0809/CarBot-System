const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const queryUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function repairNombreDealer() {
    console.log("🛠️ Starting nombre_dealer repair...");

    // SQL query to update usuarios with dealer name from dealers table
    const query = `
        UPDATE usuarios 
        SET nombre_dealer = d.nombre 
        FROM dealers d 
        WHERE usuarios.dealer_id = d.id 
        AND (usuarios.nombre_dealer IS NULL OR usuarios.nombre_dealer = '');
    `;

    const res = await fetch(queryUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });

    if (!res.ok) {
        const err = await res.text();
        console.error("❌ Repair failed:", err);
        return;
    }

    const data = await res.json();
    console.log("✅ Repair successful:", JSON.stringify(data, null, 2));
}

repairNombreDealer().catch(console.error);
