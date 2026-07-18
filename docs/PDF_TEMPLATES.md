# Printing and PDF generation

## Current implementation

Receipts and medical reports render as print-optimized HTML pages in the web app (browser print / print-to-PDF): branded header, patient/test details, totals, QR code (generated client-side with the `qrcode` package pointing at `/verify/<token>`), and `@media print` styling. RTL and Noto Kufi Arabic apply automatically from the active locale.

Employee contracts are stored as immutable JSON snapshots (`employee_agreements.termsSnapshot`) of exactly what the employee accepted, viewable/downloadable by the employee and admins.

## Server-side PDF (recommended next step)

Spec §33 calls for Playwright-based server PDF generation. The intended design: a `pdf` package rendering the same HTML templates in headless Chromium (`playwright-core`, executable path via env) and storing the result through `FilesService` as `CONTRACT_PDF` / `REPORT_PDF` / `RECEIPT_PDF`. This is **not yet implemented**; browser printing is the current path and the limitation is recorded in the final implementation report. When implementing, verify Arabic/Kurdish shaping and RTL page flow in the generated PDFs (Noto Kufi Arabic must be installed in the rendering container).
