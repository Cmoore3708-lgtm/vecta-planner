# Vecta Planner v40.41 Stable Master

This release is a clean Vite + React master build based on `vecta-source-v1-7-planner-tile-clean`.

## Fixed
- Settings now correctly feed into the Add/Edit Job dialog.
- Custom job templates now work from Settings instead of falling back to the hard-coded default list.
- Custom mechanic names now appear in the job form without causing a runtime crash.
- Custom ramp labels and capacities now feed the ramp utilisation strip.
- Vercel configuration added so the project builds from source and outputs `dist`.

## Included
- Workshop planner board.
- Unallocated and waiting jobs.
- Technician columns.
- Ramp utilisation.
- Job cards.
- Quick job templates.
- Vehicle lookup placeholder display.
- MOT/tax status display.
- Notes and tasks.
- Workshop settings.
- Availability finder.
- Vehicle history.
- Invoice screen with print/email workflow.
- Supabase-ready schema and localStorage fallback.

## Deployment
Upload the complete project folder to GitHub/Vercel. Do not upload just `index.html`.
