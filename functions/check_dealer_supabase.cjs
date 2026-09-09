const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const dbUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function checkDealerLogo() {
    const query = `SELECT * FROM dealers LIMIT 5;`;
    const res = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    const data = await res.json();
    console.log("Dealers in Supabase:");
    if (Array.isArray(data)) {
        data.forEach(d => {
            console.log(`\n  ID: ${d.id}`);
            for (const [k, v] of Object.entries(d)) {
                const val = typeof v === 'string' ? v.substring(0, 300) : v;
                console.log(`    ${k}: ${JSON.stringify(val)}`);
            }
        });
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}
checkDealerLogo().catch(console.error);
