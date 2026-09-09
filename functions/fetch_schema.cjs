const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const dbUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function fetchSchema() {
    console.log("🔍 Fetching vehiculos table schema...");
    const query = `
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'vehiculos'
        ORDER BY ordinal_position;
    `;

    try {
        const res = await fetch(dbUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${adminKey}`,
                "Content-Type": "application/json",
                "User-Agent": "antigravity-agent/1.0"
            },
            body: JSON.stringify({ query })
        });

        const data = await res.json();
        console.log("Schema:", JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error:", err);
    }
}

fetchSchema().then(() => process.exit(0));
