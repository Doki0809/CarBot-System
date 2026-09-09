const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const dbUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function addPublicReadPolicy() {
    // Add a public SELECT policy so unauthenticated (anon) users can read available vehicles
    // This is needed for the public catalog/bot link
    const query = `
        CREATE POLICY "public_read_available_vehicles" ON vehiculos
        FOR SELECT
        TO anon
        USING (estado IN ('Disponible', 'Cotizado'));
    `;

    const res = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    const data = await res.json();
    console.log("Result:", JSON.stringify(data, null, 2));
}

addPublicReadPolicy().catch(console.error);
