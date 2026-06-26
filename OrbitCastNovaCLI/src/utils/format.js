const INVALID_READING = -999;

export const validReading = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric <= INVALID_READING) return null;
  return numeric;
};

export const average = (values) => {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
};

export const sum = (values) => values.reduce((total, value) => total + value, 0);

export const round = (value, digits = 1) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const displayNumber = (value, digits = 1, fallback = "--") => {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return round(value, digits).toFixed(digits);
};

export const timestampKeyToUtc = (key) => {
  if (!key || key.length < 10) return null;
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(4, 6)) - 1;
  const day = Number(key.slice(6, 8));
  const hour = Number(key.slice(8, 10));
  const date = new Date(Date.UTC(year, month, day, hour, 0, 0));
  if (!Number.isFinite(date.getTime())) return null;
  return date;
};

export const formatUtcDate = (date) => {
  if (!date) return "--";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
};

export const utcDateKey = (offsetDays = 0) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - offsetDays);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
};

export const moonPhaseLabel = (phaseValue) => {
  if (!Number.isFinite(phaseValue)) return "Unknown";
  if (phaseValue < 0.03 || phaseValue >= 0.97) return "New Moon";
  if (phaseValue < 0.22) return "Waxing Crescent";
  if (phaseValue < 0.28) return "First Quarter";
  if (phaseValue < 0.47) return "Waxing Gibbous";
  if (phaseValue < 0.53) return "Full Moon";
  if (phaseValue < 0.72) return "Waning Gibbous";
  if (phaseValue < 0.78) return "Last Quarter";
  return "Waning Crescent";
};
