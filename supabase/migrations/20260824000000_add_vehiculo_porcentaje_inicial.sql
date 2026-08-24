-- % de inicial propio por vehículo.
--
-- `porcentaje_inicial` decide con qué porcentaje se autocalcula el inicial de
-- ESTE vehículo:
--   NULL   -> usa el % global del dealer (dealers.porcentaje_inicial_auto).
--             Es el comportamiento actual y el único que el recálculo masivo
--             de Ajustes puede tocar.
--   número -> el dealer le puso un % propio a esta unidad. El recálculo masivo
--             que dispara el % global DEBE saltárselo, para que cambiar el %
--             general nunca pise un vehículo personalizado.
--
-- Default NULL a propósito: los vehículos existentes siguen atados al % global.
ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS porcentaje_inicial numeric;

COMMENT ON COLUMN vehiculos.porcentaje_inicial IS
  'Porcentaje de inicial propio de esta unidad (0-100). NULL = hereda el % global del dealer.';
