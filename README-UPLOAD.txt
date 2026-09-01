V290 FINANCE INTEGRITY UPDATE — 01 SEP 2026

Replace these files in the ROOT of the GitHub vecta-planner repository:

1. index.html
2. service-worker.js
3. public/service-worker.js  (inside the existing public folder)

IMPORTANT
- Do not upload these into a new subfolder.
- Vercel must build from the main branch after the files are replaced.
- After deployment, the lower-left sidebar must visibly say: V290 Finance Integrity
  If it does not, the corrected production build is NOT the version being displayed.

This build:
- makes Vehicle Tax the single tax description going forward;
- recognises legacy TAX / Tax / Road Tax / Pool Car Tax / VED / Vehicle Excise Duty / Road Fund Licence records as tax-only legacy data;
- excludes tax-only records from workshop Staff / NMUK / contractor revenue;
- renders legacy tax rows as Vehicle Tax;
- migrates confidently recognised legacy tax jobs to Vehicle Tax when cloud data loads;
- locks current Fleet Manager Nissan ownership and raw NMUK/MVOS job evidence ahead of stale finance corrections;
- adds a final Staff-list firewall so a source-confirmed NMUK job cannot survive in Staff.
