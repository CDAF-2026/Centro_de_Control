-- ============================================================================
-- Consentimiento de menores 2026-10-v6 (Laura, 18-oct-2026): numeral 9 sin la palabra "abajo".
-- "Solo si lo autorizo abajo, el centro podrá…" → "Solo si lo autorizo, el centro podrá…".
-- El resto es idéntico a 2026-10-v5. Nadie había firmado la v5; igual se versiona (nunca se edita un texto
-- que estuvo publicado). Se abre aquí mismo: no hay código que cambiar. La v5 se abrió hoy, así que se cierra
-- con `vigente_hasta = current_date` y el desempate de `consentimiento_version_vigente` hace ganar la v6.
-- ============================================================================
do $$
declare
  v_viejo text;
  v_nuevo text;
begin
  select texto into strict v_viejo from public.consentimiento_version where codigo = '2026-10-v5';
  v_nuevo := replace(v_viejo, 'Solo si lo autorizo abajo, el centro podrá', 'Solo si lo autorizo, el centro podrá');
  if v_nuevo = v_viejo then
    raise exception 'El numeral 9 de 2026-10-v5 no tiene la frase esperada';
  end if;
  insert into public.consentimiento_version (codigo, publico, titulo, texto, texto_sha256, vigente_desde)
  select '2026-10-v6', publico, titulo, v_nuevo, '', null
    from public.consentimiento_version where codigo = '2026-10-v5';

  update public.consentimiento_version
     set vigente_hasta = current_date
   where codigo = '2026-10-v5' and vigente_hasta is null;
  update public.consentimiento_version
     set vigente_desde = current_date
   where codigo = '2026-10-v6' and vigente_desde is null;
end;
$$;
