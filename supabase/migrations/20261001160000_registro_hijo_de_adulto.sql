-- ============================================================================
-- Registro público · el papá que ya es TITULAR no se duplica como acudiente (1-oct-2026)
-- ----------------------------------------------------------------------------
-- Laura recordó que la ficha de un adulto ahora admite "Agregar hijo" (commit
-- c306c4a): el niño entra como miembro no titular de la ficha del papá o la mamá.
-- `registro_aplicar_datos` ya lo hacía así (modo "hermano" = miembro no titular),
-- pero `registro_acudientes` además creaba una fila de acudiente para ese mismo
-- adulto dentro de su propia ficha. Sobra: él ES la ficha. Ahora, si la cédula
-- del acudiente es la del titular, no se crea la fila; sus datos de contacto se
-- aplican igual sobre `clientes` (celular, correo, dirección).
-- ============================================================================

create or replace function private.registro_acudientes(p_cliente bigint, p_acudientes jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  a        jsonb;
  v_rol    public.acudiente_rol;
  v_id     bigint;
  v_princ  bigint;
  v_doc_titular text;
begin
  select acudiente_id, documento into v_princ, v_doc_titular from public.clientes where id = p_cliente;

  for a in select * from jsonb_array_elements(coalesce(p_acudientes, '[]'::jsonb)) loop
    continue when nullif(trim(coalesce(a->>'nombre', '')), '') is null;
    -- El titular adulto que registra a su hijo no es "acudiente" de sí mismo.
    continue when v_doc_titular is not null and nullif(a->>'documento', '') = v_doc_titular;
    v_rol := coalesce(nullif(a->>'rol', ''), 'otro')::public.acudiente_rol;

    select id into v_id from public.acudientes
     where cliente_id = p_cliente
       and ((v_rol <> 'otro' and rol = v_rol)
         or (v_rol = 'otro' and rol = 'otro'
             and (documento = nullif(a->>'documento', '') or lower(nombre) = lower(a->>'nombre'))))
     order by (id = v_princ) desc, id
     limit 1;

    if v_id is null then
      insert into public.acudientes (cliente_id, rol, nombre, documento, telefono, email, parentesco)
      values (p_cliente, v_rol, a->>'nombre', nullif(a->>'documento', ''), nullif(a->>'telefono', ''),
              nullif(lower(a->>'email'), ''), nullif(a->>'parentesco', ''))
      returning id into v_id;
    else
      update public.acudientes
         set nombre = a->>'nombre', documento = nullif(a->>'documento', ''), telefono = nullif(a->>'telefono', ''),
             email = nullif(lower(a->>'email'), ''), parentesco = nullif(a->>'parentesco', '')
       where id = v_id;
    end if;

    if (a->>'principal')::boolean is true or v_princ is null then
      update public.clientes set acudiente_id = v_id where id = p_cliente;
      v_princ := v_id;
    end if;
  end loop;
end;
$$;
