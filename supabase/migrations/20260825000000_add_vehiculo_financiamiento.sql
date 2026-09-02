-- Opción de financiamiento preferida por vehículo.
--
-- El simulador de cuotas de la ficha ya calculaba en pantalla, pero no dejaba
-- rastro: la API no tenía forma de saber con qué banco/plazo quiere el dealer
-- que se ofrezca ESA unidad. Estas columnas guardan esa elección para que la
-- API la exponga como "opción recomendada", y además calcule el resto de
-- plazos para que el bot pueda responder "¿y a 36 meses?".
--
-- Todo nullable: sin elección guardada, la API cae al primer banco activo del
-- dealer, que es el comportamiento que ya tenía el simulador.
ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS financiamiento_banco_id uuid
  REFERENCES public.dealer_financing_banks(id) ON DELETE SET NULL;
ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS financiamiento_plazo_meses integer
  CHECK (financiamiento_plazo_meses IS NULL OR financiamiento_plazo_meses > 0);
ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS financiamiento_tasa_manual numeric(5,2)
  CHECK (financiamiento_tasa_manual IS NULL OR (financiamiento_tasa_manual >= 0 AND financiamiento_tasa_manual < 100));

COMMENT ON COLUMN vehiculos.financiamiento_banco_id IS 'Banco preferido para esta unidad (dealer_financing_banks). NULL = usar el primer banco activo del dealer.';
COMMENT ON COLUMN vehiculos.financiamiento_plazo_meses IS 'Plazo en meses de la opción recomendada. NULL = plazo por defecto del banco.';
COMMENT ON COLUMN vehiculos.financiamiento_tasa_manual IS 'Tasa anual escrita a mano para esta unidad. NULL = usar la tasa del banco.';

-- La vista lista columnas explícitamente, así que sin esto la API nunca vería
-- los campos nuevos. Se agregan al final para no alterar el orden existente.
CREATE OR REPLACE VIEW public.public_inventory_view AS
 SELECT v.id,
    v.dealer_id,
    v.titulo_vehiculo AS titulo,
    v.marca,
    v.modelo,
    v.anio,
    v.edicion,
    v.precio,
    v.moneda_precio,
    v.inicial,
    v.moneda_inicial,
    v.color,
    v.transmision,
    v.traccion,
    v.combustible,
    v.motor,
    v.millas,
    v.tipo_vehiculo,
    v.fotos,
    v.link_externo,
    v.created_at,
    d.catalogo_url AS dealer_catalogo_url,
    v.cantidad_asientos,
    v.llave,
    v.camara,
    v.carplay,
    v.sensores,
    v.vidrios_electricos,
    v.baul_electrico,
    v.techo,
    v.material_asientos,
    v.condicion,
    v.condicion_carfax,
    v.detalles,
    v.estado,
    v.updated_at,
    v.financiamiento_banco_id,
    v.financiamiento_plazo_meses,
    v.financiamiento_tasa_manual
   FROM vehiculos v
     JOIN dealers d ON d.id = v.dealer_id
  WHERE (v.estado = ANY (ARRAY['Disponible'::text, 'Cotizado'::text])) AND d.activo = true AND v.deleted_at IS NULL;
