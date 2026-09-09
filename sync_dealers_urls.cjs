const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const queryUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function syncDealersConfig() {
    // 1. Get all dealers from Supabase
    const getDealersQuery = "SELECT id, nombre FROM dealers WHERE activo = true;";
    const resDealers = await fetch(queryUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${adminKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: getDealersQuery })
    });
    const dealers = await resDealers.json();
    console.log(`Found ${dealers.length} active dealers in Supabase.`);

    for (const dealer of dealers) {
        console.log(`Processing ${dealer.nombre} (${dealer.id})...`);

        // 2. Try to find config in Firestore using the UUID
        const configSnap = await db.collection('Dealers').doc(dealer.id).collection(':DATA BOT RN').doc('CONFIG').get();
        if (configSnap.exists) {
            const config = configSnap.data();
            const catalogoUrl = config.LINK_TIENDA || null;
            const iaUrl = config.LINK_INVENTARIO_GHL || null;

            if (catalogoUrl || iaUrl) {
                console.log(`  Updating Supabase with Catalogo: ${catalogoUrl}, IA: ${iaUrl}`);
                const updateQuery = `
                    UPDATE dealers 
                    SET catalogo_url = ${catalogoUrl ? `'${catalogoUrl}'` : 'NULL'}, 
                        ia_url = ${iaUrl ? `'${iaUrl}'` : 'NULL'} 
                    WHERE id = '${dealer.id}';
                `;
                const resUpdate = await fetch(queryUrl, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${adminKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ query: updateQuery })
                });
                console.log(`  Update status: ${resUpdate.status}`);
            } else {
                console.log(`  No URLs found in Firestore config.`);
            }
        } else {
            console.log(`  No Firestore config found for UUID ${dealer.id}.`);
        }
    }
}

syncDealersConfig().catch(console.error);
