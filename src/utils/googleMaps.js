// Loader singleton para Google Maps JS API (Places) — evita inyectar el
// script más de una vez cuando el modal de documentos se abre repetidas veces.
let googleMapsPromise = null;

export const loadGoogleMaps = (apiKey) => {
  if (typeof window === 'undefined') return Promise.reject(new Error('No hay window'));
  if (window.google?.maps?.places) return Promise.resolve(window.google);
  if (!apiKey) return Promise.reject(new Error('Falta la API key de Google Maps'));

  if (!googleMapsPromise) {
    googleMapsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-google-maps-loader]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.google));
        existing.addEventListener('error', reject);
        return;
      }
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=es&region=DO`;
      script.async = true;
      script.defer = true;
      script.dataset.googleMapsLoader = 'true';
      script.onload = () => resolve(window.google);
      script.onerror = () => {
        googleMapsPromise = null;
        reject(new Error('No se pudo cargar Google Maps'));
      };
      document.head.appendChild(script);
    });
  }
  return googleMapsPromise;
};

// Extrae los componentes de dirección relevantes de un google.maps.places.PlaceResult
export const parseGooglePlace = (place) => {
  const components = place?.address_components || [];
  const find = (type) => components.find((c) => c.types.includes(type));

  const streetNumber = find('street_number')?.long_name || '';
  const route = find('route')?.long_name || '';
  const sector = find('sublocality') || find('sublocality_level_1') || find('neighborhood');
  const city = find('locality') || find('administrative_area_level_2');
  const state = find('administrative_area_level_1');
  const country = find('country');
  const postalCode = find('postal_code');

  return {
    address1: `${route}${streetNumber ? ' ' + streetNumber : ''}`.trim(),
    sector: sector?.long_name || '',
    city: city?.long_name || '',
    state: state?.long_name || '',
    country: country?.long_name || '',
    postalCode: postalCode?.long_name || '',
  };
};
