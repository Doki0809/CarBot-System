import urllib.request, json, ssl

import os

# La credencial se lee del entorno: este script vivía con un token de
# Supabase en texto plano dentro de un repo publico.
ADMIN_TOKEN = os.environ['SUPABASE_ACCESS_TOKEN']


ctx = ssl.create_default_context()

sql = """
DROP POLICY IF EXISTS "usuarios_select_same_dealer" ON public.usuarios;

-- Use a safer subquery strategy avoiding recursion in RLS
CREATE POLICY "usuarios_select_same_dealer" ON public.usuarios FOR SELECT
  USING (
    dealer_id IN (
       SELECT d.id FROM public.dealers d 
       INNER JOIN public.usuarios u ON u.dealer_id = d.id 
       WHERE u.id = auth.uid()
    )
  );
"""

payload = json.dumps({'query': sql}).encode('utf-8')
req = urllib.request.Request(
    'https://api.supabase.com/v1/projects/lpiwkennlavpzisdvnnh/database/query',
    data=payload,
    method='POST'
)
req.add_header('Authorization', f'Bearer {ADMIN_TOKEN}')
req.add_header('Content-Type', 'application/json')
req.add_header('Accept', 'application/json')

try:
    with urllib.request.urlopen(req, context=ctx) as r:
        print("OK:", r.read().decode())
except urllib.error.HTTPError as e:
    print("ERR:", e.code, e.read().decode())
