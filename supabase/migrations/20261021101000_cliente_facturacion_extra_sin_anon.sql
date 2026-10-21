-- Supabase le da a toda tabla nueva todos los privilegios para `anon` (default privileges, ver
-- handoff §1). La RLS ya lo negaba (las políticas son `to authenticated`), pero los datos de
-- facturación no deben quedar defendidos por una sola capa.
revoke all on public.cliente_facturacion_extra from anon;
