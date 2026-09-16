-- M03-T05: Additive society address and contact fields.
-- Reuses public.societies. Does not create a second society table.
-- Does not change society_code, status, tenancy identifiers, or RLS.

alter table public.societies
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists pin_code text,
  add column if not exists contact_number text,
  add column if not exists email text;

comment on column public.societies.address is
  'Optional society street address. Maintained by society Admin.';

comment on column public.societies.city is
  'Optional city. Maintained by society Admin.';

comment on column public.societies.state is
  'Optional state. Maintained by society Admin.';

comment on column public.societies.pin_code is
  'Optional 6-digit Indian PIN code. Null when not supplied.';

comment on column public.societies.contact_number is
  'Optional society contact number. Mobile or landline.';

comment on column public.societies.email is
  'Optional society email. Null when not supplied.';

alter table public.societies
  drop constraint if exists societies_pin_code_format;

alter table public.societies
  add constraint societies_pin_code_format
  check (pin_code is null or pin_code ~ '^[0-9]{6}$');
