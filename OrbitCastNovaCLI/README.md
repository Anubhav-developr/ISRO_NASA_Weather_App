# OrbitCast Nova Lite (React Native CLI)

React Native CLI version of OrbitCast Nova (Expo-free) optimized for smaller Android release size.

## Included Features

- Earth weather by city or Indian pincode
- Current device location weather
- Temperature, humidity, wind, sunrise/sunset
- Rainy/cloudy/clear day outlook
- Mars weather + North/South/East estimates
- Moon conditions
- NASA APOD + ISRO snapshot
- Forecast PDF generate + share

## NASA API Key Setup

Edit this file and set your key:

`src/config/keys.js`

```js
export const USER_NASA_API_KEY = "YOUR_NASA_KEY";
```

If you keep `DEMO_KEY`, rate limits will be low.

## Install

```bash
npm install
```

## Run (Android)

```bash
npx react-native start
npx react-native run-android
```

## Smaller Release APK

The project already enables:

- Hermes
- R8/Proguard minification
- Resource shrinking
- ABI split APKs (`armeabi-v7a`, `arm64-v8a`)

Build release APKs:

```bash
cd android
gradlew assembleRelease
```

Or (recommended on this machine, auto-uses Java 21):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-release.ps1
```

Output:

`android/app/build/outputs/apk/release/`
