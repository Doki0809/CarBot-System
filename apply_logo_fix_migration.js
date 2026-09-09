const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const queryUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

const query = `
    -- Enable unaccent extension
    CREATE EXTENSION IF NOT EXISTS unaccent;

    -- Add id_busqueda column
    ALTER TABLE dealers ADD COLUMN IF NOT EXISTS id_busqueda TEXT;

    -- Update existing dealers
    -- We use unaccent to normalize 'nombre'
    UPDATE dealers 
    SET id_busqueda = UPPER(regexp_replace(unaccent(nombre), '[^A-Za-z0-9 ]', '', 'g'));

    -- Add index for lookups
    CREATE INDEX IF NOT EXISTS idx_dealers_id_busqueda ON dealers(id_busqueda);
`;

async function runMigration() {
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
runMigration().catch(console.error);
