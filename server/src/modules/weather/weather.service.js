import ApiError from '../../utils/ApiError.js';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const REQUEST_TIMEOUT_MS = 8_000;

const WEATHER_CODES = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail',
};

async function fetchJson(fetchImpl, url, signal) {
  let response;
  try {
    response = await fetchImpl(url, {
      signal: signal
        ? AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), signal])
        : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw ApiError.gatewayTimeout('WEATHER_TIMEOUT', 'The weather service did not respond in time.', { cause: error });
    }
    throw ApiError.serviceUnavailable('WEATHER_UNAVAILABLE', 'Could not reach the weather service.', { cause: error });
  }
  if (!response.ok) {
    throw ApiError.serviceUnavailable('WEATHER_UNAVAILABLE', 'The weather service is temporarily unavailable.');
  }
  try {
    return await response.json();
  } catch (error) {
    throw ApiError.badGateway('WEATHER_INVALID_RESPONSE', 'The weather service returned an unreadable response.', { cause: error });
  }
}

export function createWeatherService({ fetchImpl = globalThis.fetch } = {}) {
  async function getWeather(location, { signal } = {}) {
    const geocodingUrl = new URL(GEOCODING_URL);
    geocodingUrl.search = new URLSearchParams({
      name: location,
      count: '1',
      language: 'en',
      format: 'json',
    }).toString();
    const places = await fetchJson(fetchImpl, geocodingUrl, signal);
    const place = places?.results?.[0];
    if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) {
      throw ApiError.notFound('WEATHER_LOCATION_NOT_FOUND', 'The weather service could not find that location.');
    }

    const forecastUrl = new URL(FORECAST_URL);
    forecastUrl.search = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
      timezone: 'auto',
    }).toString();
    const forecast = await fetchJson(fetchImpl, forecastUrl, signal);
    const current = forecast?.current;
    if (
      !current
      || !Number.isFinite(current.temperature_2m)
      || !Number.isFinite(current.weather_code)
    ) {
      throw ApiError.badGateway('WEATHER_INVALID_RESPONSE', 'The weather service returned invalid forecast data.');
    }
    return {
      location: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
      observedAt: current.time,
      temperature: current.temperature_2m,
      temperatureUnit: forecast.current_units?.temperature_2m ?? '°C',
      feelsLike: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m,
      conditions: WEATHER_CODES[current.weather_code] ?? 'Unknown conditions',
      source: 'Open-Meteo',
    };
  }

  return { getWeather };
}

export default createWeatherService;
