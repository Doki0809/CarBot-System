const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const queryUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

const GARY_MOTORS_ID = '33723933-7372-4557-a143-447167647a78';

const query = `
    -- 1. Update Jean's profiles to point to Gary Motors
    UPDATE usuarios 
    SET dealer_id = '${GARY_MOTORS_ID}'
    WHERE correo IN ('jeancarlosgf13@gmail.com', 'jeancarlosgf1313@gmail.com');

    -- 2. Upgrade vehiculos RLS policy for Admins
    -- We allow ALL operations if the user is an admin, or if they belong to the dealer.
    DROP POLICY IF EXISTS "vehiculos_dealer_policy" ON vehiculos;
    CREATE POLICY "vehiculos_dealer_policy" 
    ON vehiculos FOR ALL 
    TO authenticated 
    USING (
        (SELECT rol FROM usuarios WHERE id = auth.uid()) = 'admin'
        OR 
        dealer_id IN (SELECT dealer_id FROM usuarios WHERE id = auth.uid())
    )
    WITH CHECK (
        (SELECT rol FROM usuarios WHERE id = auth.uid()) = 'admin'
        OR 
        dealer_id IN (SELECT dealer_id FROM usuarios WHERE id = auth.uid())
    );
`;

async function applyFix() {
    console.log("Applying User Profile and RLS Policy Upgrade...");
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
