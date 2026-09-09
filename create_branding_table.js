const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const queryUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

const query = `
-- Create branding_subaccounts table
CREATE TABLE IF NOT EXISTS branding_subaccounts (
    location_id TEXT PRIMARY KEY,
    agency_id TEXT,
    app_installed BOOLEAN DEFAULT FALSE,
    brand_id TEXT NOT NULL,
    brand_name TEXT NOT NULL,
    theme_name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    installed_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_branding_location_id ON branding_subaccounts(location_id);

-- Enable RLS
ALTER TABLE branding_subaccounts ENABLE ROW LEVEL SECURITY;

-- Policy: Public read access for the dynamic loader
DROP POLICY IF EXISTS "Allow public read by location_id" ON branding_subaccounts;
CREATE POLICY "Allow public read by location_id" 
ON branding_subaccounts 
FOR SELECT 
USING (true);

-- Policy: Service role all access
DROP POLICY IF EXISTS "Allow service role all access" ON branding_subaccounts;
CREATE POLICY "Allow service role all access" 
ON branding_subaccounts 
FOR ALL 
USING (true) 
WITH CHECK (true);
`;

async function applyFix() {
    console.log("Applying Branding Table creation via Management API...");
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
    if (res.status === 201 || res.status === 200) {
        console.log("✅ Table branding_subaccounts created successfully!");
    } else {
        console.error("❌ Failed to create table.");
    }
}
applyFix().catch(console.error);
