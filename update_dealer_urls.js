import fs from 'fs';

const dbUrl = "https://api.supabase.com/v1/projects/lpiwkennlavpzisdvnnh/database/query";
const adminKey = process.env.SUPABASE_ACCESS_TOKEN;

async function run() {
    const querySelect = "SELECT id, nombre FROM dealers;";

    const selectRes = await fetch(dbUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${adminKey}`,
            "Content-Type": "application/json",
            "User-Agent": "curl/7.68.0"
        },
        body: JSON.stringify({ query: querySelect })
    });

    const dealers = await selectRes.json();
    if (!Array.isArray(dealers)) {
        console.error("Failed to select dealers:", dealers);
        return;
    }

    let updateQuery = "";
    for (const dealer of dealers) {
        if (!dealer.nombre) continue;
        const encodedName = encodeURIComponent(dealer.nombre).replace(/'/g, "''");
        const catalogo_url = `https://inventarioia-gzhz2ynksa-uc.a.run.app/catalogo?dealerID=${encodedName}`;
        const ia_url = `https://inventarioia-gzhz2ynksa-uc.a.run.app/?dealer=${encodedName}`;

        updateQuery += `UPDATE dealers SET catalogo_url = '${catalogo_url}', ia_url = '${ia_url}' WHERE id = '${dealer.id}';\n`;
    }

    if (updateQuery) {
        console.log("Applying updates...");
        const updateRes = await fetch(dbUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${adminKey}`,
                "Content-Type": "application/json",
                "User-Agent": "curl/7.68.0"
            },
            body: JSON.stringify({ query: updateQuery })
        });
        console.log("Update status:", updateRes.status);
        console.log("Migration complete!");
    } else {
        console.log("No dealers to update.");
    }
}

run();
