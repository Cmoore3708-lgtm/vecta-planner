# Customer progress scenes

The initial release used three complete generated scenes for CM14 KEL, but separate workshop, vehicle, number plate, bonnet and mechanic layers for everyone else. Chris rejected that result because it did not match the approved previews: plate and mechanic placement were wrong and tyres were not flat.

YD72 OMH is a grey Nissan Leaf ZE1, confirmed against its saved vehicle identity, artwork and colour. Its replacement uses three complete generated photographs based on the approved Vecta scenes:

- Waiting: muddy grey Leaf facing left, both visible tyres collapsed, crooked front plate attached to the bumper.
- Underway: bonnet open, electric power electronics compartment, mechanic's hands in the front bay and toolbox beside him.
- Ready: clean grey Leaf facing right, inflated tyres and straight front plate.

The complete images include all vehicle elements. The renderer must not fetch or display the older separate car/plate/mechanic overlays for these registrations. The live green border and current-stage badge remain HTML/CSS, so the status can change independently of the pictures.

## Current limit

This amendment corrects YD72 OMH specifically. It does **not** implement automatic generation for arbitrary registrations. Other registrations still use the older layered illustration. Do not describe the whole feature as fixed or imply that new cars automatically receive these complete scenes.

A general solution needs an authenticated generation queue triggered before the booking, three images keyed to the actual registration/model/colour, durable image storage, cost limits, retries, and visual validation. No paid generation service is activated by this amendment. Customer lookups should only read cached completed images, never trigger unbounded generation costs.
