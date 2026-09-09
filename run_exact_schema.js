import fs from 'fs';

const dbUrl = "https://api.supabase.com/v1/projects/lpiwkennlavpzisdvnnh/database/query";
const adminKey = process.env.SUPABASE_ACCESS_TOKEN;

const query = `
DROP VIEW IF EXISTS vista_inventario_disponible;
DROP VIEW IF EXISTS vista_inventario_vendido;
DROP TABLE IF EXISTS vehiculos CASCADE;

CREATE TABLE vehiculos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
    
    titulo_vehiculo TEXT,
    estado TEXT DEFAULT 'Disponible' CHECK (estado IN ('Disponible', 'Vendido')),
    
    color TEXT,
    condicion_carfax TEXT,
    chasis_vin TEXT,
    traccion TEXT,
    transmision TEXT,
    motor TEXT,
    techo TEXT,
    combustible TEXT,
    llave TEXT,
    camara TEXT,
    material_asientos TEXT,
    
    precio NUMERIC,
    inicial NUMERIC,
    millas NUMERIC,
    cantidad_asientos INT,
    
    baul_electrico BOOLEAN DEFAULT false,
    sensores BOOLEAN DEFAULT false,
    carplay BOOLEAN DEFAULT false,
    vidrios_electricos BOOLEAN DEFAULT false,
    
    fotos JSONB DEFAULT '[]'::jsonb,
    documentos JSONB DEFAULT '[]'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fecha_venta TIMESTAMP WITH TIME ZONE
);

CREATE VIEW vista_inventario_disponible AS
SELECT * FROM vehiculos WHERE estado = 'Disponible';

CREATE VIEW vista_inventario_vendido AS
SELECT * FROM vehiculos WHERE estado = 'Vendido';

ALTER TABLE vehiculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehiculos_dealer_policy" ON vehiculos
FOR ALL
USING (
    dealer_id IN (
        SELECT dealer_id FROM usuarios WHERE id = auth.uid()
    )
)
WITH CHECK (
    dealer_id IN (
        SELECT dealer_id FROM usuarios WHERE id = auth.uid()
    )
);

-- Note: storage schema objects might require full admin access via pgAdmin or separate logic if management API doesn't handle schema perfectly, but let's try.
INSERT INTO storage.buckets (id, name, public) VALUES ('fotos_vehiculos', 'fotos_vehiculos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public) VALUES ('documentos_vehiculos', 'documentos_vehiculos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Access fotos_vehiculos" ON storage.objects;
CREATE POLICY "Public Access fotos_vehiculos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'fotos_vehiculos');

DROP POLICY IF EXISTS "Auth Insert fotos_vehiculos" ON storage.objects;
CREATE POLICY "Auth Insert fotos_vehiculos"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'fotos_vehiculos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Public Access documentos_vehiculos" ON storage.objects;
CREATE POLICY "Public Access documentos_vehiculos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'documentos_vehiculos');

DROP POLICY IF EXISTS "Auth Insert documentos_vehiculos" ON storage.objects;
CREATE POLICY "Auth Insert documentos_vehiculos"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'documentos_vehiculos' AND auth.role() = 'authenticated');
`;

async function run() {
    const res = await fetch(dbUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${adminKey}`,
            "Content-Type": "application/json",
            "User-Agent": "curl/7.68.0"
        },
        body: JSON.stringify({ query })
    });
    console.log(res.status);
    console.log(await res.text());
}
run();
