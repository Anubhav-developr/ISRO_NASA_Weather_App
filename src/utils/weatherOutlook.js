const RAIN_CODES = new Set([
  51, 53, 55, 56, 57,
  61, 63, 65, 66, 67,
  71, 73, 75, 77,
  80, 81, 82, 85, 86,
  95, 96, 99,
]);

export const weatherCodeLabel = (code) => {
  const key = Number(code);
  const labels = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snowfall",
    73: "Moderate snowfall",
    75: "Heavy snowfall",
    77: "Snow grains",
    80: "Rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Severe thunderstorm",
  };
  return labels[key] || "Mixed weather";
};

export const getDayOutlook = ({
  weatherCode,
  precipitationProbabilityMax,
  precipitationMm,
  cloudCoverMean,
}) => {
  const code = Number(weatherCode);
  const rainProb = Number(precipitationProbabilityMax);
  const rainMm = Number(precipitationMm);
  const cloud = Number(cloudCoverMean);

  const isRainCode = RAIN_CODES.has(code);
  const rainyLikely = isRainCode || rainProb >= 55 || rainMm >= 2;
  const rainyPossible = rainProb >= 30 || rainMm >= 0.5;
  const cloudy = cloud >= 65 || code === 3 || code === 2;

  if (rainyLikely) {
    return {
      label: "Rainy Day",
      tone: "rain",
      details: `${Math.max(0, Math.round(rainProb))}% rain chance`,
    };
  }

  if (cloudy) {
    return {
      label: "Cloudy Day",
      tone: "cloud",
      details: `${Math.max(0, Math.round(cloud))}% cloud cover`,
    };
  }

  if (rainyPossible) {
    return {
      label: "Clouds + Showers",
      tone: "mixed",
      details: `${Math.max(0, Math.round(rainProb))}% rain chance`,
    };
  }

  return {
    label: "Mostly Clear",
    tone: "clear",
    details: "Comfortable sky conditions",
  };
};
