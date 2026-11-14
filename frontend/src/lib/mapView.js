// Decide o que o mapa enquadra.
//  - Com hidrantes da estação: enquadra os hidrantes. A posição do GPS só entra se estiver perto (até
//    GPS_NEAR_KM do hidrante mais próximo); longe, o marcador do GPS aparece, mas não afasta o mapa.
//  - Sem hidrantes ainda: centraliza na posição do GPS. Sem GPS, o mapa fica no centro de São Paulo.

export const SP_CENTER = [-23.5612, -46.6558];
export const GPS_NEAR_KM = 10;
export const GPS_ZOOM = 13;

export function haversineKm([lat1, lon1], [lat2, lon2]) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/**
 * @param {Array<[number, number]>} hydrantPoints [lat, lon] dos hidrantes no mapa
 * @param {{lat: number, lon: number} | null} gps
 * @returns {{bounds: Array<[number, number]>} | {center: [number, number], zoom: number} | null}
 *   null = manter a vista atual (centro de São Paulo na abertura).
 */
export function mapView(hydrantPoints, gps) {
  const gpsPoint = gps ? [gps.lat, gps.lon] : null;
  if (hydrantPoints.length > 0) {
    const near = gpsPoint && Math.min(...hydrantPoints.map((p) => haversineKm(p, gpsPoint))) <= GPS_NEAR_KM;
    return { bounds: near ? [...hydrantPoints, gpsPoint] : hydrantPoints };
  }
  if (gpsPoint) return { center: gpsPoint, zoom: GPS_ZOOM };
  return null;
}
