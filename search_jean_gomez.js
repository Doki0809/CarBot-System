const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const queryUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function searchUser() {
    const query = `
        SELECT * 
        FROM usuarios 
        WHERE nombre ILIKE '%Jean Gomez%' OR correo ILIKE '%jeancarlosgf13%';
    `;

    const res = await fetch(queryUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${adminKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
    });

    const data = await res.json();
    console.log("✅ Resultados:", JSON.stringify(data, null, 2));
}

searchUser().catch(console.error);
