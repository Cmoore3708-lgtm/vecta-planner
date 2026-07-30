VECTA website booking deletion schema fix

Replace these files in GitHub, keeping the same locations:

/index.html
/booking.html
/public/booking.html
/dist/booking.html

The key correction is in index.html: Website Booking requests are now marked Booked or Deleted using only the existing status column. The missing updated_at column is no longer sent to Supabase.
