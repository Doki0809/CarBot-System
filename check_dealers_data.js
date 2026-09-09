const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const queryUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function checkDealersData() {
    try {
        const query = "SELECT id, nombre, ghl_location_id, location_id, id_busqueda FROM dealers ORDER BY created_at DESC LIMIT 5;";
        const res = await fetch(queryUrl, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${adminKey}`, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ query })
        });
        const text = await res.text();
        console.log("Raw Response:", text);
        const data = JSON.parse(text);
        console.log("Data:", JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error:", err);
    }
}
checkDealersData();
