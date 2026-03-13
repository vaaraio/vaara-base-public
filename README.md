# Vaara Base Public Surface

Public-safe repository snapshot for Vaara's live Base product surfaces.

## Live URLs
- Company: https://vaara.io
- Product: https://base.vaara.io
- Public demo: https://base.vaara.io/demo

## What Vaara is
Vaara is execution-aware decision infrastructure for high-noise systems, with Base as the first live wedge.

The product layer shown here is the public-facing part of that system:
- company narrative surface
- Base product surface
- delayed, read-only public demo

## Why this repo exists
Some funding and ecosystem applications require a code repository, but Vaara's private pilot surface and execution internals are intentionally not public. This repository is the review-safe package: enough to inspect the product layer, architecture direction, and frontend quality without exposing private logic or credentials.

## What this repo contains
- Public-facing HTML/CSS/JS for the company and Base product surfaces
- Brand assets used by the live deployment
- Public architecture and security notes

## What this repo intentionally excludes
- Private pilot surface implementation
- Execution logic and policy internals
- API keys, secrets, credentials, and environment files
- Internal runtime, logs, and research artifacts
- Wallet, signing, and infrastructure credentials

## Repository layout
- `public/` - public-safe frontend files
- `assets/` - brand assets and hero image
- `docs/` - high-level public architecture notes

## Reviewer note
This repository is meant to show the live public product layer, not to reproduce the full private runtime. Some frontend files still reference deployment paths used by the live service.

## Contact
hello@vaara.io
