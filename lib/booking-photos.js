export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 300000;

export function bookingPhotos(value) {
  if (value === undefined) return [];
  const invalid = () => Object.assign(new Error('Choose up to three photos. Please remove the photo and try again.'), {code:'BOOKING_INPUT'});
  if (!Array.isArray(value) || value.length > MAX_PHOTOS) throw invalid();
  return value.map(photo => {
    if (!photo || typeof photo.image !== 'string' || photo.image.length > 400023 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo.image)) throw invalid();
    const encoded = photo.image.slice(23), bytes = Buffer.from(encoded, 'base64');
    if (bytes.length < 4 || bytes.length > MAX_PHOTO_BYTES || bytes.toString('base64') !== encoded || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw invalid();
    // The client re-encodes to JPEG, removing original file metadata and filenames.
    return {image:photo.image};
  });
}
