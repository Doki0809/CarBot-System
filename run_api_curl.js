import fs from 'fs';
const dbUrl = "https://api.supabase.com/v1/projects/lpiwkennlavpzisdvnnh/database/query";
const adminKey = process.env.SUPABASE_ACCESS_TOKEN;

async function run() {
    const res = await fetch(dbUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${adminKey}`,
            "Content-Type": "application/json",
            "User-Agent": "curl/7.68.0"
        },
        body: JSON.stringify({
            query: `ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS detalles JSONB DEFAULT '{}'::jsonb;`
        })
    });
    console.log(await res.text());
}
run();
