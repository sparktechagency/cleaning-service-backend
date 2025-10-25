/**
 *
 * @param lat1 user latitude
 * @param lon1 user longitude
 * @param lat2 post latitude
 * @param lon2 post longitude
 * @returns Haversine distance in kilometers
 */
const haversineDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) => {
  const toRad = (deg: number) => deg * (Math.PI / 180);
  const R = 6371; // Radius of Earth in KM

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export default haversineDistance;
