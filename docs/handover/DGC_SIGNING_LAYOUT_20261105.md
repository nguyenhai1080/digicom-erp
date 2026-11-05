# DGC signing composite layout — 2026-11-05

Owner requested the seal and signature follow the supplied reference, with the signer title/name slightly lower. DGC_COMPOSITE_V2_COMPACT uses a transparent 900px canvas: seal on the left, signature crossing its middle, title/name centered below both with a 40px gap. Original uploaded images remain unchanged; no redrawing or background removal.

API build passed. Disposable PostgreSQL DGC integration passed 101 composition, source preservation, version/digest, tenant/permission, rollback and all-page signing checks; 85 financial characterization checks also passed. Authentic DGC originals were composed locally for visual inspection. No financial records or issued PDFs were changed by this work.

Host activation and deployment status are recorded after applying the new asset. Existing finalized reconciliations require the normal explicit restamp flow; do not automatically restamp or approve owner documents.

## Activated on DGC host

Digicom-Erp v19 is online from deployment commit `47d5c1667a2efbe6b761a86ce6a9704a33a5d9d5` (source `c3ce5ae027d4e6638dc610727275558987d8e9e2`). Native compositor created SIGNING_COMPOSITE v2 at 11:36:02, asset `776a79c1-44cf-4118-81af-5aabe624a03d`, replacing active v1 while preserving originals and previous versions. Live preview and downloaded active asset match the Windows/Linux-tested PNG exactly, SHA256 `4baa2d620e1c8c59feb10d010b9a7c9258086fa0ca2383d0b4e5f7063621399b`.

No owner reconciliation was approved or restamped. Refresh the reconciliation preview to select the new current composite. Private visual/byte proof is under ignored `artifacts/dgc-migration/20261105/company-assets/`; no authentic signing images are included in Git or the deployment package.

## Owner refinement: title close to seal

Owner subsequently requested the title nearer the seal. V3_CLOSE_TITLE raises the combined title/name by 64px on the 900px canvas; seal/signature coordinates remain unchanged. With the authentic DGC sources this leaves roughly 11px between visible seal and title marks (about 5px at the 400px preview). The transparent source margins remain intact. API build and visual inspection passed; V2's integration results above are prior coverage, not a rerun for V3.
