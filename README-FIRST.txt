VECTA booking page DVSA confirmation amendment

Replace the matching files in the GitHub project, preserving the folder structure.

Changes:
- Automatic DVSA lookup after registration entry pauses.
- Populates vehicle make/model, Last MOT Mileage and MOT due date.
- Displays a Vehicle Found panel with latest advisories.
- Saves mot_due with the website booking request.
- Allows manual entry if DVSA cannot find the vehicle.

The Supabase column must be named mot_due (lowercase, unquoted).
