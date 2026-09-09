const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const queryUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

const query = `
    UPDATE dealers 
    SET id_busqueda = 'GARY MOTORS'
    WHERE id = '33723933-7372-4557-a143-447167647a78';
    
    UPDATE dealers 
    SET id_busqueda = 'DURAN FERNANDEZ AUTO SRL'
    WHERE id = '35594257-6176-4a79-a755-304179305938';
`;

async function runFix() {
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
runFix().catch(console.error);
