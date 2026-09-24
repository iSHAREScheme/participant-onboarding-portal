# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
- Onboarding with Verifiable Credentials (VCs): applicants can present VCs
  they already hold (cross-device OID4VP via QR, or by pasting/uploading a
  presentation) and have their application pre-filled from what was proven.
  Accepted credential types, trusted issuers and claim-to-field mappings are
  admin-configurable; skipping admin review for VC-verified applications is
  overridable per onboarding flow.
- Identity verification methods are configurable: admins choose which of eIDAS,
  eHerkenning and VCs applicants may use, per deployment and per onboarding
  flow. The default (eIDAS + eHerkenning) matches earlier behaviour; VCs are
  off by default.
- The identity check is now the first onboarding step, before role selection
  and M2M. Applicants mid-onboarding when this is deployed restart at the first
  step; their form data is kept.
- `NEXT_PUBLIC_ALWAYS_EHERKENNING` no longer changes the identity step. Its
  behaviour depended on the M2M answer, which is not known yet now that the
  identity check comes first; use the identity verification methods setting.
- Initial open-source release.
