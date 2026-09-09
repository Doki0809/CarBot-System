import fs from 'fs';
const dbUrl = "https://api.supabase.com/v1/projects/lpiwkennlavpzisdvnnh/database/query";
const adminKey = process.env.SUPABASE_ACCESS_TOKEN;

const query = `
INSERT INTO vehiculos (
  dealer_id, titulo_vehiculo, estado, precio
) VALUES (
  (SELECT id FROM dealers LIMIT 1),
  'TEST VEHICLE',
  'Disponible',
  1000
) RETURNING *;
`;

async function run() {
    const res = await fetch(dbUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${adminKey}`,
            "Content-Type": "application/json",
            "User-Agent": "curl/7.68.0"
        },
        body: JSON.stringify({ query })
    });
    console.log("Status:", res.status);
    console.log("Response:", await res.text());
}
run();
