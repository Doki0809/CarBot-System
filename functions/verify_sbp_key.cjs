const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const dbUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function verifyKey() {
    console.log("🔍 Verifying Supabase Management API key...");
    const query = "SELECT COUNT(*) FROM vehiculos;";

    try {
        const res = await fetch(dbUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${adminKey}`,
                "Content-Type": "application/json",
                "User-Agent": "antigravity-agent/1.0"
            },
            body: JSON.stringify({ query })
        });

        console.log("Status:", res.status);
        const text = await res.text();
        console.log("Response:", text);

        if (res.ok) {
            console.log("✅ Key is valid and can execute SQL!");
        } else {
            console.log("❌ Key verification failed.");
        }
    } catch (err) {
        console.error("Error:", err);
    }
}

verifyKey().then(() => process.exit(0));
