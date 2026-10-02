-- Garantías reutilizables por dealer.
--
-- El dealer arma una garantía una vez (título, duración y qué componentes
-- cubre) y la asigna a tantos vehículos como quiera. Los vehículos solo
-- guardan la referencia, así que editar la garantía actualiza todos los carros
-- que la usan.
--
-- `cubre` guarda claves estables (ej. 'motor', 'bateria'), no textos: las
-- etiquetas viven en el frontend y se pueden renombrar sin migrar datos.
CREATE TABLE IF NOT EXISTS public.dealer_garantias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  titulo text NOT NULL CHECK (length(btrim(titulo)) > 0),
  plazo_valor integer NOT NULL CHECK (plazo_valor > 0 AND plazo_valor <= 1000),
  plazo_unidad text NOT NULL CHECK (plazo_unidad IN ('dias', 'meses', 'anos')),
  cubre text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dealer_garantias_dealer ON public.dealer_garantias (dealer_id);

ALTER TABLE public.dealer_garantias ENABLE ROW LEVEL SECURITY;

-- Mismo modelo de acceso que dealer_financing_banks: el dueño (o admin de
-- plataforma) administra su propia lista.
CREATE POLICY dealer_garantias_dealer_manage ON public.dealer_garantias
  FOR ALL
  USING (
    (SELECT usuarios.rol FROM public.usuarios WHERE usuarios.id = auth.uid()) = 'admin'
    OR dealer_id IN (SELECT usuarios.dealer_id FROM public.usuarios WHERE usuarios.id = auth.uid())
  )
  WITH CHECK (
    (SELECT usuarios.rol FROM public.usuarios WHERE usuarios.id = auth.uid()) = 'admin'
    OR dealer_id IN (SELECT usuarios.dealer_id FROM public.usuarios WHERE usuarios.id = auth.uid())
  );

-- Borrar una garantía no borra vehículos: solo los deja sin garantía.
ALTER TABLE public.vehiculos ADD COLUMN IF NOT EXISTS garantia_id uuid
  REFERENCES public.dealer_garantias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehiculos_garantia ON public.vehiculos (garantia_id);

COMMENT ON TABLE public.dealer_garantias IS 'Garantías que el dealer define una vez y asigna a varios vehículos.';
COMMENT ON COLUMN public.vehiculos.garantia_id IS 'Garantía asignada a esta unidad. NULL = sin garantía.';
