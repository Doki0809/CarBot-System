-- La ficha pública del vehículo (Cloud Function, llave anónima) necesita leer
-- la garantía asignada para mostrarla al cliente. La escritura sigue limitada
-- al dealer dueño (política dealer_garantias_dealer_manage).
--
-- Una garantía es información comercial que el dealer quiere mostrar: título,
-- plazo y qué cubre. No contiene datos de clientes ni de contacto.
CREATE POLICY dealer_garantias_public_read ON public.dealer_garantias
  FOR SELECT
  USING (true);
