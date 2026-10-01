-- ============================================================================
-- Registro público y consentimiento digital · enums (Fase 1 del plan, 1-oct-2026)
-- ----------------------------------------------------------------------------
-- Van SOLOS en esta migración: Postgres no deja USAR un valor de enum en la
-- misma transacción en que se crea el tipo si después se altera; y tenerlos
-- aparte permite que las tablas y funciones de las migraciones siguientes
-- fallen o se reapliquen sin arrastrar los tipos.
-- ============================================================================

-- Qué envió la página pública.
create type public.registro_tipo as enum ('datos', 'consentimiento');

-- Vida de una solicitud: llega, se aplica sola, o espera a un revisor.
create type public.registro_estado as enum ('recibida', 'aplicada', 'en_revision', 'rechazada', 'expirada');

-- Un dato de facturación distinto al que había, esperando aprobación (D1).
create type public.cambio_estado as enum ('pendiente', 'aprobado', 'rechazado');

-- La firma: con dueño claro, sin dueño claro (ficha duplicada, D3), o anulada con motivo.
create type public.firma_estado as enum ('asignada', 'pendiente_asignar', 'anulada');

-- Cómo se produjo la imagen de la firma.
create type public.firma_metodo as enum ('dibujada', 'escrita');

-- De dónde salió un documento de la ficha: lo subió el personal o lo generó una firma.
create type public.documento_origen as enum ('subido', 'firma_digital');
