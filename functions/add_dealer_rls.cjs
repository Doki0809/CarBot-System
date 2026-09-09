const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const dbUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function addDealerReadPolicy() {
    // Check RLS on dealers
    const checkQuery = `
        SELECT tablename, rowsecurity 
        FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'dealers';
    `;
    let res = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: checkQuery })
    });
    let data = await res.json();
    console.log("Dealers RLS status:", JSON.stringify(data));

    if (data[0]?.rowsecurity) {
        // Add public SELECT policy for anon to read dealer info (logo, name)
        const query = `
            CREATE POLICY "public_read_dealer_info" ON dealers
            FOR SELECT
            TO anon
            USING (activo = true);
        `;
        res = await fetch(dbUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        data = await res.json();
        console.log("Policy result:", JSON.stringify(data));
    } else {
        console.log("RLS not enabled on dealers table, no policy needed");
    }
}
addDealerReadPolicy().catch(console.error);
