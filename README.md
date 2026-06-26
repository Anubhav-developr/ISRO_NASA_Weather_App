# OrbitCast Nova (React Native)

Easy-to-use React Native (Expo) app that combines:

- Earth weather analysis (NASA POWER API)
- Mars weather snapshot (NASA InSight API, historical/limited)
- Moon conditions (astronomy indicators + lunar environment context)
- Astronomy Picture of the Day (NASA APOD)
- ISRO public data snapshot (community feed)

## What this app includes

1. Earth tab  
   City name ya pincode se location search.  
   Forecast temperature, humidity, pressure, wind, rain chance, sunrise/sunset + 3-day outlook.  
   Har day card me clear `Rainy / Cloudy / Mostly Clear` outlook badge.  
   NASA POWER based in-depth trend analysis bhi included hai.  
   Device current location button se instant local weather fetch kar sakte ho.

2. Mars tab  
   NASA InSight station data (jab available ho).  
   North/South/East cards are clearly marked as model estimates (not live regional sensors).

3. Moon tab  
   Moon phase, moonrise/moonset, and lunar day/night surface extremes.  
   Note clearly shown: Moon par Earth jaisa weather system nahi hota.

4. Space Pic tab  
   NASA APOD daily image/video with explanation.

5. ISRO tab  
   Spacecraft/launcher/centre counts from `isro.vercel.app` with warning that it is community-maintained, not official ISRO-owned API.

6. Forecast PDF Share  
   Earth forecast ka beautiful PDF generate hota hai aur device share sheet se WhatsApp, Mail, etc. par share ho sakta hai.

7. Launch Animation  
   App open hote hi smooth startup animation aata hai for premium feel.

## Setup

1. Install dependencies:

```bash
npm install
```

2. (Recommended) NASA API key set karo:

```bash
EXPO_PUBLIC_NASA_API_KEY=your_nasa_api_key
```

On Windows PowerShell (current session):

```powershell
$env:EXPO_PUBLIC_NASA_API_KEY="your_nasa_api_key"
```

If key nahi set karte, app `DEMO_KEY` use karega (rate limits strict honge).

3. Start app:

```bash
npm run start
```

## Permissions

- Location permission required for "Use My Current Location" feature.
- Share sheet support platform/device par depend karta hai. Unsupported platform par PDF generate hoga but share action unavailable ho sakta hai.

## Optimized Folder Structure

```text
src/
  api/
  components/
    common/
  constants/
  screens/
  utils/
```

## API Sources

- NASA APOD: `https://api.nasa.gov/planetary/apod`
- NASA InSight: `https://api.nasa.gov/insight_weather`
- NASA POWER: `https://power.larc.nasa.gov/api/temporal/hourly/point`
- Open-Meteo forecast + geocoding: `https://api.open-meteo.com/v1/forecast`, `https://geocoding-api.open-meteo.com/v1/search`
- India pincode fallback lookup: `https://api.postalpincode.in/pincode/<PIN>`
- India pincode direct geocode: `https://api.zippopotam.us/in/<PIN>`
- India pincode geocode fallback: `https://nominatim.openstreetmap.org/search`
- Moon phase/moonrise: USNO Astronomical Applications API
- ISRO snapshot: `https://isro.vercel.app/api/*` (community project)

## Legal and data accuracy notes

- NASA endpoints are public APIs, but always follow NASA API usage terms and attribution guidance.
- Mars regional weather in this app is estimated from one station data point and should not be treated as scientific regional ground truth.
- Moon section is lunar condition guidance, not atmospheric weather forecasting.
- ISRO section uses a community endpoint; data freshness and official status can vary.
