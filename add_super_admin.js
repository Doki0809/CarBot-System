const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const queryUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function addSuperAdmin() {
    const email = "jeancarlosgf13@gmail.com";
    const uid = "17584189-310e-4d87-8f5e-fbed045fce29";
    const dealerId = "33723933-7372-4557-a143-447167647a78"; // Gary Motors

    console.log(`🚀 Agregando Super Admin ${email} con UID ${uid} a Supabase...`);

    // El constraint 'usuarios_rol_check' requiere: 'admin', 'vendedor', 'gerente'
    const query = `
        INSERT INTO usuarios (id, correo, nombre, rol, dealer_id, nombre_dealer, role_en_ghl)
        VALUES ('${uid}', '${email}', 'Jean Carlos', 'admin', '${dealerId}', 'Gary Motors', 'admin')
        ON CONFLICT (id) 
        DO UPDATE SET 
            correo = '${email}',
            rol = 'admin',
            dealer_id = '${dealerId}',
            nombre_dealer = 'Gary Motors',
            role_en_ghl = 'admin',
            updated_at = NOW();
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
    console.log("✅ Resultado:", JSON.stringify(data, null, 2));
}

addSuperAdmin().catch(console.error);
