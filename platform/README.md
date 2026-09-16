# Platform Operator Tooling

**Internal use only — not part of the society mobile application.**

This directory contains CLI scripts and runbooks for **Platform Super Admin** (operator-level) tasks:

- Society onboarding (create society, society code, initial authorized Admin)
- Platform-level administration

## Security

- **Never** embed service-role credentials in the mobile app.
- Operator secrets (`SUPABASE_SERVICE_ROLE_KEY`) belong only on operator machines or CI secret stores.
- See root `.env.example` for variable naming.

## Status

M00 placeholder — onboarding scripts are implemented in **M18**.

See `docs/architecture/overview.md` for architecture context.
