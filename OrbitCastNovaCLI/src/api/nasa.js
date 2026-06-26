import {
  average,
  sum,
  timestampKeyToUtc,
  utcDateKey,
  validReading,
} from "../utils/format";
import { USER_NASA_API_KEY } from "../config/keys";

const NASA_API_BASE = "https://api.nasa.gov";
const USNO_API_BASE = "https://aa.usno.navy.mil/api/rstt/oneday";
const OPEN_METEO_FORECAST_BASE = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_GEOCODE_BASE = "https://geocoding-api.open-meteo.com/v1/search";
const INDIA_PINCODE_BASE = "https://api.postalpincode.in/pincode";
const ZIPPOPOTAM_BASE = "https://api.zippopotam.us";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const DEFAULT_NASA_KEY = "DEMO_KEY";

const NASA_API_KEY = USER_NASA_API_KEY || DEFAULT_NASA_KEY;

const requestJson = async (url, init) => {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}): ${text || response.statusText}`);
  }
  return response.json();
};

const nasaKeyCandidates = () =>
  Array.from(new Set([NASA_API_KEY, DEFAULT_NASA_KEY].filter(Boolean)));

const buildNasaUrl = (path, params = {}, apiKey) => {
  const query = new URLSearchParams({
    ...params,
    api_key: apiKey,
  }).toString();

  return `${NASA_API_BASE}${path}?${query}`;
};

const requestNasaJson = async (path, params = {}) => {
  let lastError = null;

  for (const key of nasaKeyCandidates()) {
    try {
      const url = buildNasaUrl(path, params, key);
      return await requestJson(url);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("NASA API request failed.");
};

const compareDateAsc = (a, b) => a.getTime() - b.getTime();

const numberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const buildLocationLabel = (item) => {
  const pieces = [item?.name, item?.admin1, item?.country].filter(Boolean);
  return pieces.join(", ");
};

const mapGeocodeResult = (item, extra = {}) => ({
  id: String(item?.id || `${item?.latitude}-${item?.longitude}-${item?.name || "loc"}`),
  label: buildLocationLabel(item) || extra.fallbackLabel || "Unknown Location",
  latitude: numberOrNull(item?.latitude),
  longitude: numberOrNull(item?.longitude),
  timezone: item?.timezone || null,
  countryCode: item?.country_code || null,
  country: item?.country || null,
});

const dedupeLocations = (locations) => {
  const seen = new Set();
  const out = [];
  locations.forEach((location) => {
    if (!location) return;
    if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return;
    const key = `${location.latitude.toFixed(4)}|${location.longitude.toFixed(4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(location);
  });
  return out;
};

const geocodeByName = async (name, count = 5) => {
  const query = new URLSearchParams({
    name: String(name || "").trim(),
    count: String(count),
    language: "en",
    format: "json",
  }).toString();

  const url = `${OPEN_METEO_GEOCODE_BASE}?${query}`;
  const payload = await requestJson(url);
  const raw = Array.isArray(payload?.results) ? payload.results : [];

  const sorted = raw.sort((a, b) => {
    const indiaA = a?.country_code === "IN" ? 0 : 1;
    const indiaB = b?.country_code === "IN" ? 0 : 1;
    return indiaA - indiaB;
  });

  return dedupeLocations(sorted.map((item) => mapGeocodeResult(item))).slice(0, count);
};

const normalizeOfficeText = (office = {}) =>
  [office?.Name, office?.Block, office?.District, office?.State, office?.Country]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

const formatIndianLabel = ({ area, state, pincode }) => {
  const areaText = area || "Unknown";
  const stateText = state || "Unknown";
  return `${areaText}, ${stateText}, India (PIN ${pincode})`;
};

const geocodeByIndianPincodeNominatim = async (pincode) => {
  const query = new URLSearchParams({
    postalcode: String(pincode),
    country: "India",
    countrycodes: "in",
    format: "jsonv2",
    addressdetails: "1",
    limit: "6",
  }).toString();

  const url = `${NOMINATIM_BASE}?${query}`;
  const payload = await requestJson(url);
  const rows = Array.isArray(payload) ? payload : [];

  const mapped = rows.map((item, index) => {
    const address = item?.address || {};
    const area =
      address?.city ||
      address?.town ||
      address?.village ||
      address?.suburb ||
      address?.county ||
      item?.name ||
      "Unknown";
    const state = address?.state || address?.state_district || "Unknown";
    const code = address?.postcode || pincode;

    return {
      id: `nomi-pin-${pincode}-${index}`,
      label: formatIndianLabel({ area, state, pincode: code }),
      latitude: numberOrNull(item?.lat),
      longitude: numberOrNull(item?.lon),
      timezone: "Asia/Kolkata",
      countryCode: "IN",
      country: "India",
    };
  });

  return dedupeLocations(mapped).slice(0, 6);
};

const geocodeByIndianPincode = async (pincode) => {
  const url = `${ZIPPOPOTAM_BASE}/in/${pincode}`;
  const payload = await requestJson(url);
  const places = Array.isArray(payload?.places) ? payload.places : [];

  const mapped = places.map((place, index) => ({
    id: `zip-${pincode}-${index}`,
    label: formatIndianLabel({
      area: place?.["place name"],
      state: place?.state,
      pincode,
    }),
    latitude: numberOrNull(place?.latitude),
    longitude: numberOrNull(place?.longitude),
    timezone: "Asia/Kolkata",
    countryCode: "IN",
    country: "India",
  }));

  return dedupeLocations(mapped).slice(0, 6);
};

const geocodeByIndianTextNominatim = async (text, count = 1) => {
  const query = new URLSearchParams({
    q: String(text || "").trim(),
    countrycodes: "in",
    format: "jsonv2",
    addressdetails: "1",
    limit: String(Math.max(1, Math.min(count, 10))),
  }).toString();

  const url = `${NOMINATIM_BASE}?${query}`;
  const payload = await requestJson(url);
  const rows = Array.isArray(payload) ? payload : [];

  const mapped = rows.map((item, index) => {
    const address = item?.address || {};
    const area =
      address?.city ||
      address?.town ||
      address?.village ||
      address?.suburb ||
      address?.county ||
      item?.name ||
      "Unknown";
    const state = address?.state || address?.state_district || "Unknown";
    const pincode = address?.postcode || "NA";

    return {
      id: `nomi-text-${index}-${item?.place_id || "x"}`,
      label: formatIndianLabel({ area, state, pincode }),
      latitude: numberOrNull(item?.lat),
      longitude: numberOrNull(item?.lon),
      timezone: "Asia/Kolkata",
      countryCode: "IN",
      country: "India",
    };
  });

  return dedupeLocations(mapped).slice(0, count);
};

const buildPincodeSearchTerms = (offices, pincode) => {
  const terms = new Set();
  const first = offices?.[0] || {};

  if (first?.District && first?.State) {
    terms.add(`${first.District} ${first.State} India`);
  }
  if (first?.Block && first?.District && first?.State) {
    terms.add(`${first.Block} ${first.District} ${first.State} India`);
  }

  offices.slice(0, 6).forEach((office) => {
    const composite = normalizeOfficeText(office);
    if (composite) terms.add(composite);
  });

  terms.add(`${pincode} India`);
  return Array.from(terms).map((item) => item.trim()).filter(Boolean).slice(0, 10);
};

export const searchEarthLocations = async (queryInput) => {
  const query = String(queryInput || "").trim();
  if (!query) return [];

  const isIndianPincode = /^\d{6}$/.test(query);
  if (isIndianPincode) {
    const pincodeMatches = [];

    try {
      pincodeMatches.push(...(await geocodeByIndianPincodeNominatim(query)));
    } catch {
      // Nominatim may reject from some clients; keep falling back.
    }

    try {
      pincodeMatches.push(...(await geocodeByIndianPincode(query)));
    } catch {
      // Continue to India Post + text geocode fallback below.
    }

    const directMatches = dedupeLocations(pincodeMatches).slice(0, 6);
    if (directMatches.length) return directMatches;

    let offices = [];
    try {
      const pincodeUrl = `${INDIA_PINCODE_BASE}/${query}`;
      const pincodePayload = await requestJson(pincodeUrl);
      offices = Array.isArray(pincodePayload?.[0]?.PostOffice)
        ? pincodePayload[0].PostOffice
        : [];
    } catch {
      offices = [];
    }

    if (!offices.length) return [];

    const terms = buildPincodeSearchTerms(offices, query);
    if (!terms.length) return [];

    const resolved = await Promise.allSettled(
      terms.map(async (term) => {
        const [nomi, meteo] = await Promise.allSettled([
          geocodeByIndianTextNominatim(term, 1),
          geocodeByName(term, 1),
        ]);
        const nomiValues = nomi.status === "fulfilled" ? nomi.value : [];
        const meteoValues = meteo.status === "fulfilled" ? meteo.value : [];
        return dedupeLocations([...nomiValues, ...meteoValues]);
      })
    );

    const merged = dedupeLocations(
      resolved
        .filter((item) => item.status === "fulfilled")
        .flatMap((item) => item.value)
    )
      .slice(0, 6)
      .map((item) => ({
        ...item,
        label: item.label.includes("(PIN") ? item.label : `${item.label} (PIN ${query})`,
      }));

    return merged;
  }

  const primaryMatches = await geocodeByName(query, 6);
  if (primaryMatches.length) return primaryMatches;

  try {
    const indiaMatches = await geocodeByIndianTextNominatim(query, 6);
    if (indiaMatches.length) return indiaMatches;
  } catch {
    // No-op fallback.
  }

  return [];
};

const regionEstimate = (label, base, modifier) => {
  if (!base) {
    return {
      label,
      note: "No valid station data available for estimate.",
    };
  }

  const temp = base.temp !== null ? base.temp + modifier.tempOffset : null;
  const wind = base.wind !== null ? base.wind * modifier.windFactor : null;
  const pressure = base.pressure !== null ? base.pressure + modifier.pressureOffset : null;

  return {
    label,
    temp,
    wind,
    pressure,
    note: modifier.note,
  };
};

export const fetchApod = async () => {
  const payload = await requestNasaJson("/planetary/apod");

  if (!payload?.url && !payload?.hdurl) {
    throw new Error("APOD response missing image/video URL.");
  }

  return {
    date: payload.date,
    title: payload.title,
    explanation: payload.explanation,
    mediaType: payload.media_type,
    imageUrl: payload.url,
    hdImageUrl: payload.hdurl || null,
    copyright: payload.copyright || null,
  };
};

export const fetchMarsWeather = async () => {
  const payload = await requestNasaJson("/insight_weather/", {
    feedtype: "json",
    ver: "1.0",
  });

  const inferredSolKeys = Object.keys(payload || {}).filter((key) => /^\d+$/.test(key));
  const solKeys = Array.isArray(payload?.sol_keys) && payload.sol_keys.length
    ? payload.sol_keys
    : inferredSolKeys.sort((a, b) => Number(a) - Number(b));

  if (!Array.isArray(solKeys) || solKeys.length === 0) {
    return {
      available: false,
      note: "No fresh official Mars weather station data available right now. InSight mission data is historical/limited.",
      regions: [],
      latest: null,
    };
  }

  const latestSol = solKeys[solKeys.length - 1];
  const latest = payload?.[latestSol] || {};
  const base = {
    temp: validReading(latest?.AT?.av),
    tempMin: validReading(latest?.AT?.mn),
    tempMax: validReading(latest?.AT?.mx),
    pressure: validReading(latest?.PRE?.av),
    wind: validReading(latest?.HWS?.av),
    windDirection:
      latest?.WD?.most_common?.compass_point ||
      latest?.WD?.most_common?.compass_degrees ||
      null,
    season: latest?.Season || latest?.season || null,
    firstUtc: latest?.First_UTC || null,
    lastUtc: latest?.Last_UTC || null,
  };

  const regionalEstimates = [
    regionEstimate("Northern Region (estimated)", base, {
      tempOffset: -8,
      windFactor: 0.9,
      pressureOffset: -0.2,
      note: "Estimated cooler due to higher-latitude effect.",
    }),
    regionEstimate("Southern Region (estimated)", base, {
      tempOffset: -16,
      windFactor: 1.1,
      pressureOffset: -0.4,
      note: "Estimated colder with stronger wind variability.",
    }),
    regionEstimate("Eastern Region (estimated)", base, {
      tempOffset: -4,
      windFactor: 1.2,
      pressureOffset: -0.1,
      note: "Estimated moderate temperature with elevated winds.",
    }),
  ];

  return {
    available: true,
    source: "NASA InSight (single station)",
    latestSol,
    latest: base,
    regions: regionalEstimates,
    note: "Regional cards are model-based estimates from one station and are not direct live sensors.",
  };
};

const valuesFromKey = (parameter = {}, key) =>
  Object.entries(parameter[key] || {})
    .map(([timestamp, value]) => ({
      timestamp,
      value: validReading(value),
      utc: timestampKeyToUtc(timestamp),
    }))
    .filter((item) => item.value !== null && item.utc !== null)
    .sort((a, b) => compareDateAsc(a.utc, b.utc));

const averageOfLast = (series, count) => {
  if (!series.length) return null;
  return average(series.slice(-count).map((item) => item.value));
};

export const fetchEarthWeatherAnalysis = async ({ latitude, longitude, days = 3 }) => {
  const end = utcDateKey(0);
  const start = utcDateKey(Math.max(0, days - 1));
  const parameters = [
    "T2M",
    "RH2M",
    "WS10M",
    "WD10M",
    "PS",
    "PRECTOTCORR",
    "ALLSKY_SFC_SW_DWN",
  ].join(",");

  const query = new URLSearchParams({
    parameters,
    community: "RE",
    longitude: String(longitude),
    latitude: String(latitude),
    start,
    end,
    format: "JSON",
    "time-standard": "UTC",
  }).toString();

  const url = `https://power.larc.nasa.gov/api/temporal/hourly/point?${query}`;
  const payload = await requestJson(url);
  const parameter = payload?.properties?.parameter;

  if (!parameter || typeof parameter !== "object") {
    throw new Error("NASA POWER response missing weather parameter payload.");
  }

  const tempSeries = valuesFromKey(parameter, "T2M");
  const humiditySeries = valuesFromKey(parameter, "RH2M");
  const windSeries = valuesFromKey(parameter, "WS10M");
  const windDirSeries = valuesFromKey(parameter, "WD10M");
  const pressureSeries = valuesFromKey(parameter, "PS");
  const rainSeries = valuesFromKey(parameter, "PRECTOTCORR");
  const solarSeries = valuesFromKey(parameter, "ALLSKY_SFC_SW_DWN");

  const latestTemp = tempSeries.at(-1) || null;
  const latestHumidity = humiditySeries.at(-1) || null;
  const latestWind = windSeries.at(-1) || null;
  const latestWindDir = windDirSeries.at(-1) || null;
  const latestPressure = pressureSeries.at(-1) || null;
  const latestRain = rainSeries.at(-1) || null;
  const latestSolar = solarSeries.at(-1) || null;

  const tempValues = tempSeries.map((entry) => entry.value);
  const humidityValues = humiditySeries.map((entry) => entry.value);
  const windValues = windSeries.map((entry) => entry.value);
  const pressureValues = pressureSeries.map((entry) => entry.value);
  const rainValues = rainSeries.map((entry) => entry.value);
  const solarValues = solarSeries.map((entry) => entry.value);

  const tempTrendCurrent = averageOfLast(tempSeries, 6);
  const tempTrendPrevious = average(
    tempSeries.slice(-12, -6).map((entry) => entry.value)
  );

  const humidityTrendCurrent = averageOfLast(humiditySeries, 6);
  const humidityTrendPrevious = average(
    humiditySeries.slice(-12, -6).map((entry) => entry.value)
  );

  const windTrendCurrent = averageOfLast(windSeries, 6);
  const windTrendPrevious = average(windSeries.slice(-12, -6).map((entry) => entry.value));

  const insights = [];
  if (latestTemp?.value !== null && latestTemp?.value > 35) {
    insights.push("High heat stress likely right now.");
  }
  if (latestHumidity?.value !== null && latestHumidity?.value > 75) {
    insights.push("Humidity is high, discomfort risk increases.");
  }
  if (latestWind?.value !== null && latestWind?.value > 10) {
    insights.push("Surface wind speed is elevated.");
  }
  if (!insights.length) {
    insights.push("Conditions look relatively stable in the latest window.");
  }

  return {
    location: {
      latitude,
      longitude,
    },
    meta: {
      start,
      end,
      source: "NASA POWER",
    },
    latest: {
      tempC: latestTemp?.value ?? null,
      humidityPct: latestHumidity?.value ?? null,
      windMs: latestWind?.value ?? null,
      windDirDeg: latestWindDir?.value ?? null,
      pressureKpa: latestPressure?.value ?? null,
      rainMmHr: latestRain?.value ?? null,
      solarFlux: latestSolar?.value ?? null,
      updatedUtc: latestTemp?.utc || latestHumidity?.utc || latestWind?.utc || null,
    },
    stats: {
      tempMin: tempValues.length ? Math.min(...tempValues) : null,
      tempMax: tempValues.length ? Math.max(...tempValues) : null,
      tempAvg: average(tempValues),
      humidityAvg: average(humidityValues),
      windAvg: average(windValues),
      pressureAvg: average(pressureValues),
      rainTotal: sum(rainValues),
      solarAvg: average(solarValues),
    },
    trend: {
      tempDelta: tempTrendCurrent !== null && tempTrendPrevious !== null ? tempTrendCurrent - tempTrendPrevious : null,
      humidityDelta:
        humidityTrendCurrent !== null && humidityTrendPrevious !== null
          ? humidityTrendCurrent - humidityTrendPrevious
          : null,
      windDelta: windTrendCurrent !== null && windTrendPrevious !== null ? windTrendCurrent - windTrendPrevious : null,
    },
    insights,
  };
};

export const fetchEarthForecast = async ({ latitude, longitude, days = 3 }) => {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      "temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,precipitation_probability",
    hourly:
      "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation_probability",
    daily:
      "sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,precipitation_probability_max,cloud_cover_mean",
    forecast_days: String(Math.max(1, Math.min(days, 7))),
    timezone: "auto",
  }).toString();

  const url = `${OPEN_METEO_FORECAST_BASE}?${query}`;
  const payload = await requestJson(url);
  const current = payload?.current || {};
  const hourly = payload?.hourly || {};
  const daily = payload?.daily || {};

  const dailyTime = Array.isArray(daily?.time) ? daily.time : [];
  const dailyForecast = dailyTime.map((date, index) => ({
    date,
    minC: numberOrNull(daily?.temperature_2m_min?.[index]),
    maxC: numberOrNull(daily?.temperature_2m_max?.[index]),
    precipitationMm: numberOrNull(daily?.precipitation_sum?.[index]),
    weatherCode: numberOrNull(daily?.weather_code?.[index]),
    precipitationProbabilityMax: numberOrNull(daily?.precipitation_probability_max?.[index]),
    cloudCoverMean: numberOrNull(daily?.cloud_cover_mean?.[index]),
    sunrise: daily?.sunrise?.[index] || null,
    sunset: daily?.sunset?.[index] || null,
  }));

  const hourlyTime = Array.isArray(hourly?.time) ? hourly.time : [];
  const currentTime = current?.time || null;
  const currentIndex = currentTime ? hourlyTime.indexOf(currentTime) : -1;
  const startIndex = currentIndex >= 0 ? currentIndex : 0;

  const nextHours = hourlyTime.slice(startIndex, startIndex + 8).map((time, index) => {
    const i = startIndex + index;
    return {
      time,
      tempC: numberOrNull(hourly?.temperature_2m?.[i]),
      humidityPct: numberOrNull(hourly?.relative_humidity_2m?.[i]),
      windKmh: numberOrNull(hourly?.wind_speed_10m?.[i]),
      precipProbPct: numberOrNull(hourly?.precipitation_probability?.[i]),
    };
  });

  return {
    meta: {
      source: "Open-Meteo Forecast",
      timezone: payload?.timezone || "Unknown",
    },
    current: {
      time: currentTime,
      tempC: numberOrNull(current?.temperature_2m),
      humidityPct: numberOrNull(current?.relative_humidity_2m),
      pressureHpa: numberOrNull(current?.surface_pressure),
      windKmh: numberOrNull(current?.wind_speed_10m),
      precipProbPct: numberOrNull(current?.precipitation_probability),
    },
    today: {
      sunrise: dailyForecast?.[0]?.sunrise || null,
      sunset: dailyForecast?.[0]?.sunset || null,
    },
    daily: dailyForecast,
    nextHours,
  };
};

export const fetchMoonConditions = async ({ latitude, longitude }) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const date = `${year}-${month}-${day}`;
  const timezoneHours = (-now.getTimezoneOffset() / 60).toString();

  const query = new URLSearchParams({
    date,
    coords: `${latitude},${longitude}`,
    tz: timezoneHours,
  }).toString();

  const url = `${USNO_API_BASE}?${query}`;
  const payload = await requestJson(url);
  const dayData = payload?.properties?.data || {};
  const moonEvents = Array.isArray(dayData?.moondata) ? dayData.moondata : [];

  const moonrise = moonEvents.find((event) => event?.phen === "Rise")?.time || null;
  const moonset = moonEvents.find((event) => event?.phen === "Set")?.time || null;
  const phaseLabel = dayData?.curphase || "Unknown";
  const illumination = dayData?.fracillum || null;

  return {
    atmosphericWeather: false,
    phaseValue: null,
    phaseLabel,
    illumination,
    moonrise,
    moonset,
    estimatedSurfaceTemp: {
      dayC: 127,
      nightC: -173,
    },
    note: "Moon has almost no atmosphere, so Earth-like weather does not occur there. These are lunar condition indicators.",
    source: "USNO Astronomical Applications API + NASA lunar environment constants",
  };
};

export const nasaKeyInUse = NASA_API_KEY;
