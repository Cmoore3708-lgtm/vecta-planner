VECTA combined update

Replace these files in GitHub, keeping their existing locations:
/index.html
/booking.html
/public/booking.html
/dist/booking.html

Changes:
- Wider Diagnostics / warning light button so the text remains on one line.
- All work options remain on exactly two rows.
- Website request deletion now verifies the Supabase record is actually gone.
- Deleting a website request also removes any linked planner job and linked records.
- The website booking list is refreshed from Supabase after deletion.
