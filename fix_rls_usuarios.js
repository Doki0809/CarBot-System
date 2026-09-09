import fs from 'fs';

const dbUrl = "https://api.supabase.com/v1/projects/lpiwkennlavpzisdvnnh/database/query";
const adminKey = process.env.SUPABASE_ACCESS_TOKEN;

async function run() {
    const querySelect = `
    DROP POLICY IF EXISTS "Enable read access for users own row" ON usuarios;
    CREATE POLICY "Enable read access for users own row" ON usuarios
    FOR SELECT
    USING (id = auth.uid());
  `;

    const selectRes = await fetch(dbUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${adminKey}`,
            "Content-Type": "application/json",
            "User-Agent": "curl/7.68.0"
        },
        body: JSON.stringify({ query: querySelect })
    });

    const text = await selectRes.text();
    console.log("Create policy result:", text);
}

run();
