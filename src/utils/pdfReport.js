import { displayNumber } from "./format";
import { getDayOutlook } from "./weatherOutlook";

const toClock = (value) => {
  if (!value) return "--";
  const asText = String(value);
  const pieces = asText.split("T");
  return pieces.length > 1 ? pieces[1] : asText;
};

const toDayLabel = (value) => {
  if (!value) return "--";
  const parts = String(value).split("-");
  if (parts.length !== 3) return String(value);
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const buildForecastPdfHtml = ({
  locationName,
  coords,
  generatedAt,
  forecast,
  analysis,
}) => {
  const current = forecast?.current || {};
  const today = forecast?.today || {};
  const dailyRows = (forecast?.daily || [])
    .map((day) => {
      const outlook = getDayOutlook({
        weatherCode: day.weatherCode,
        precipitationProbabilityMax: day.precipitationProbabilityMax,
        precipitationMm: day.precipitationMm,
        cloudCoverMean: day.cloudCoverMean,
      });

      return `
        <tr>
          <td>${escapeHtml(toDayLabel(day.date))}</td>
          <td>${escapeHtml(displayNumber(day.minC, 1))} C</td>
          <td>${escapeHtml(displayNumber(day.maxC, 1))} C</td>
          <td>${escapeHtml(displayNumber(day.precipitationMm, 1))} mm</td>
          <td>${escapeHtml(toClock(day.sunrise))}</td>
          <td>${escapeHtml(toClock(day.sunset))}</td>
          <td>${escapeHtml(outlook.label)}</td>
        </tr>
      `;
    })
    .join("");

  const hourlyRows = (forecast?.nextHours || [])
    .map(
      (hour) => `
        <tr>
          <td>${escapeHtml(toClock(hour.time))}</td>
          <td>${escapeHtml(displayNumber(hour.tempC, 1))} C</td>
          <td>${escapeHtml(displayNumber(hour.humidityPct, 0))}%</td>
          <td>${escapeHtml(displayNumber(hour.windKmh, 1))} km/h</td>
          <td>${escapeHtml(displayNumber(hour.precipProbPct, 0))}%</td>
        </tr>
      `
    )
    .join("");

  const insightBlocks = (analysis?.insights || [])
    .map((insight) => `<li>${escapeHtml(insight)}</li>`)
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>OrbitCast Forecast Report</title>
    <style>
      body {
        margin: 0;
        padding: 26px;
        font-family: "Trebuchet MS", "Segoe UI", sans-serif;
        color: #0e2333;
        background: linear-gradient(160deg, #f6fbff 0%, #e7f4ff 55%, #eef8ff 100%);
      }
      .wrap {
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 8px 24px rgba(7, 40, 70, 0.14);
        padding: 20px 22px;
        border: 1px solid #d6e6f5;
      }
      .title {
        font-size: 26px;
        font-weight: 800;
        color: #0a3a58;
        margin: 0;
      }
      .sub {
        margin-top: 6px;
        font-size: 12px;
        color: #4d667a;
      }
      .pill {
        margin-top: 12px;
        display: inline-block;
        background: #0e4f78;
        color: #ffffff;
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
      }
      .grid {
        margin-top: 14px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
      }
      .card {
        background: #f3f9ff;
        border: 1px solid #cfe4f6;
        border-radius: 12px;
        padding: 10px;
      }
      .card h4 {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        color: #39607a;
      }
      .card p {
        margin: 6px 0 0;
        font-size: 18px;
        font-weight: 800;
        color: #0d3148;
      }
      h3 {
        margin: 18px 0 8px;
        color: #0c3a57;
        font-size: 15px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 6px;
        font-size: 11px;
      }
      th {
        text-align: left;
        background: #0f4f78;
        color: #ffffff;
        font-size: 11px;
        padding: 8px;
      }
      td {
        border-bottom: 1px solid #dbeaf8;
        padding: 7px 8px;
      }
      tr:nth-child(even) td {
        background: #f7fbff;
      }
      .footer {
        margin-top: 14px;
        color: #5a7388;
        font-size: 10px;
      }
      ul {
        margin-top: 6px;
      }
      li {
        margin: 4px 0;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1 class="title">OrbitCast Nova Forecast Report</h1>
      <div class="sub">Generated: ${escapeHtml(generatedAt)}</div>
      <div class="sub">Location: ${escapeHtml(locationName)}</div>
      <div class="sub">Coordinates: ${escapeHtml(displayNumber(coords?.latitude, 4))}, ${escapeHtml(displayNumber(coords?.longitude, 4))}</div>
      <div class="pill">Timezone: ${escapeHtml(forecast?.meta?.timezone || "Local")}</div>

      <div class="grid">
        <div class="card">
          <h4>Current Temp</h4>
          <p>${escapeHtml(displayNumber(current.tempC, 1))} C</p>
        </div>
        <div class="card">
          <h4>Current Humidity</h4>
          <p>${escapeHtml(displayNumber(current.humidityPct, 0))}%</p>
        </div>
        <div class="card">
          <h4>Current Wind</h4>
          <p>${escapeHtml(displayNumber(current.windKmh, 1))} km/h</p>
        </div>
        <div class="card">
          <h4>Pressure</h4>
          <p>${escapeHtml(displayNumber(current.pressureHpa, 1))} hPa</p>
        </div>
        <div class="card">
          <h4>Rain Chance</h4>
          <p>${escapeHtml(displayNumber(current.precipProbPct, 0))}%</p>
        </div>
        <div class="card">
          <h4>Sunrise / Sunset</h4>
          <p>${escapeHtml(toClock(today.sunrise))} / ${escapeHtml(toClock(today.sunset))}</p>
        </div>
      </div>

      <h3>3-Day Forecast</h3>
      <table>
        <thead>
          <tr>
            <th>Day</th>
            <th>Min</th>
            <th>Max</th>
            <th>Rain</th>
            <th>Sunrise</th>
            <th>Sunset</th>
            <th>Outlook</th>
          </tr>
        </thead>
        <tbody>${dailyRows}</tbody>
      </table>

      <h3>Next Hours Snapshot</h3>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Temp</th>
            <th>Humidity</th>
            <th>Wind</th>
            <th>Rain Chance</th>
          </tr>
        </thead>
        <tbody>${hourlyRows}</tbody>
      </table>

      <h3>Weather Insights</h3>
      <ul>${insightBlocks || "<li>No additional insight available.</li>"}</ul>

      <div class="footer">
        This report is generated for information purposes. Forecast values can change with updated model runs.
      </div>
    </div>
  </body>
</html>`;
};
