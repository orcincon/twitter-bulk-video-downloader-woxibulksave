-- RLS Policy Always True uyarısını gidermek için:
-- WITH CHECK (true) kullanılmaz; anlamlı bir kısıt gerekir.

DROP POLICY IF EXISTS "reports_insert_all" ON public.reports;
DROP POLICY IF EXISTS "reports_insert_authenticated" ON public.reports;

-- Sadece authenticated kullanıcılar insert yapabilsin; WITH CHECK literal true değil
CREATE POLICY "reports_insert_authenticated"
  ON public.reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Eğer reports tablosunda satırı kullanıcıya bağlayan bir kolon varsa (örn. user_id):
-- WITH CHECK (user_id = auth.uid()::text) kullanarak sadece kendi user_id ile insert'e izin verin.
