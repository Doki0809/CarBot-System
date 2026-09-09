const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const queryUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function verifyLookup() {
    const legacyId = "GARY MOTORS";
    // This is the same logic as in App.jsx
    const queryVal = legacyId.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "");

    console.log("Searching for id_busqueda:", queryVal);

    const query = `SELECT id, nombre, id_busqueda FROM dealers WHERE id_busqueda = '${queryVal}';`;
    const res = await fetch(queryUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    const data = await res.json();
    console.log("Result:", JSON.stringify(data, null, 2));
}
verifyLookup().catch(console.error);
