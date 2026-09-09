const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const queryUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

const query = `
    -- 1. Enable unaccent if not already
    CREATE EXTENSION IF NOT EXISTS unaccent;

    -- 2. Clean and Populate id_busqueda for ALL dealers
    -- Using the same logic as in the app's JS
    UPDATE dealers 
    SET id_busqueda = UPPER(regexp_replace(unaccent(TRIM(nombre)), '[^A-Za-z0-9 ]', '', 'g')),
        location_id = ghl_location_id -- Sync these just in case
    WHERE nombre IS NOT NULL;

    -- 3. Fix RLS: Allow any authenticated user to read dealer info
    -- (Essential for profile enrichment when jumping between dealers)
    DROP POLICY IF EXISTS "allow_auth_read_all_dealers" ON dealers;
    CREATE POLICY "allow_auth_read_all_dealers" 
    ON dealers FOR SELECT 
    TO authenticated 
    USING (activo = true);

    -- 4. Ensure public/anon can also read it (useful for landing pages)
    DROP POLICY IF EXISTS "public_read_dealer_info" ON dealers;
    CREATE POLICY "public_read_dealer_info" 
    ON dealers FOR SELECT 
    TO anon 
    USING (activo = true);
`;

async function applyFix() {
    console.log("Applying RLS and Data Fix...");
    const res = await fetch(queryUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${adminKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ query })
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text);
}
applyFix().catch(console.error);
