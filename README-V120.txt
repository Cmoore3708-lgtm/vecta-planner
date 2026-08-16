VECTA Workshop Pro v120 — automatic service pricing

- Removed the customer engine-size selector.
- Vehicle lookup now retains DVLA engineCapacity and returns it as engineSize.
- Booking service prices calculate automatically from the registration lookup.
- DVSA engineSize remains available as a fallback if supplied.

Required Vercel environment variable:
  DVLA_API_KEY

The existing optional DVLA integration already used this key for vehicle tax.
This release also uses the same official response for engine capacity.
