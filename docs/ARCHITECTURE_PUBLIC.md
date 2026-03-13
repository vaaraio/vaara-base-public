# Public Architecture Summary

Vaara converts high-noise live inputs into operator-ready decision surfaces.

## Public layer
- Company narrative surface (`/`)
- Product surface (`/product`)
- Public-safe demo (`/demo`)

## Private layer (not published here)
- Pilot app and deeper operator controls
- Execution and policy internals
- Operational telemetry beyond public-safe exposure

## Design boundary
This repository covers the public presentation layer only. It is intentionally separated from:
- execution paths
- private access controls
- internal monitoring
- runtime state and environment configuration

## Security posture for public repo
- No secrets committed
- No private endpoints documented
- No execution credentials or wallet material
- No customer or runtime sensitive data
