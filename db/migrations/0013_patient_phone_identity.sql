CREATE UNIQUE INDEX IF NOT EXISTS patients_tenant_phone_digits_unique
  ON patients (
    tenant_id,
    regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')
  )
  WHERE phone IS NOT NULL;
