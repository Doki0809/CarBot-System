
const adminKey = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "lpiwkennlavpzisdvnnh";
const queryUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function syncAdminName() {
    const newName = 'Jean Gomez';

    // Update all users who have the email jeancarlosgf13@gmail.com
    const query = `UPDATE usuarios SET nombre = '${newName}' WHERE correo = 'jeancarlosgf13@gmail.com' OR correo = 'jeancarlosgf1313@gmail.com';`;

    console.log(`Syncing name to "${newName}" in Supabase...`);

    const res = await fetch(queryUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${adminKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
    });

    if (res.ok) {
        console.log('Successfully updated Supabase.');
        const result = await res.json();
        console.log(JSON.stringify(result, null, 2));
    } else {
        const err = await res.text();
        console.error('Error updating Supabase:', err);
    }
}

syncAdminName().catch(console.error);
