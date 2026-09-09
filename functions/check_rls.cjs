const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const dbUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function checkRLS() {
    // 1. Check if RLS is enabled
    const query = `
        SELECT tablename, rowsecurity 
        FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'vehiculos';
    `;

    let res = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    let data = await res.json();
    console.log("RLS status:", JSON.stringify(data, null, 2));

    // 2. Check RLS policies
    const query2 = `
        SELECT polname, polcmd, polroles::regrole[], polqual
        FROM pg_policy
        WHERE polrelid = 'vehiculos'::regclass;
    `;

    res = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query2 })
    });
    data = await res.json();
    console.log("RLS policies:", JSON.stringify(data, null, 2));
}

checkRLS().catch(console.error);
