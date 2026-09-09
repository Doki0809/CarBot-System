import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://lpiwkennlavpzisdvnnh.supabase.co';
const SUPABASE_ADMIN = process.env.SUPABASE_ACCESS_TOKEN;

const supabase = createClient(SUPABASE_URL, SUPABASE_ADMIN);

async function run() {
    const dataToSave = {
        dealer_id: 'bb355d0c-7537-44ed-aba9-fecb9e8a3880',
        titulo_vehiculo: 'HONDA ERROR TEST',
        estado: 'Disponible',
        color: null,
        condicion_carfax: null,
        chasis_vin: null,
        traccion: null,
        transmision: null,
        motor: null,
        techo: null,
        combustible: null,
        llave: null,
        camara: null,
        material_asientos: null,
        precio: 0,
        inicial: 0,
        millas: 0,
        cantidad_asientos: null,
        baul_electrico: false,
        sensores: false,
        carplay: false,
        vidrios_electricos: false,
        fotos: ["https://firebasestorage.googleapis.com/v0/b/carbot-5d709.appspot.com/o/dealer%20-%20DURAN_FERNANDEZ_AUTO_S_R_L%20%2FMarcas%2F2022%20HONDA%20CIVIC%200000%20%2F123456_image.jpg?alt=media"],
        documentos: []
    };

    const { data, error } = await supabase.from('vehiculos').insert([dataToSave]).select();
    console.log("Error:", error);
    console.log("Data:", data);
}
run();
