import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Geolocation from "@react-native-community/geolocation";
import RNHTMLtoPDF from "react-native-html-to-pdf";
import Share from "react-native-share";
import {
  fetchApod,
  fetchEarthForecast,
  fetchEarthWeatherAnalysis,
  fetchMarsWeather,
  fetchMoonConditions,
  nasaKeyInUse,
  searchEarthLocations,
} from "../api/nasa";
import { fetchIsroSnapshot } from "../api/isro";
import { APP_IDENTITY, DELTA_LABELS, QUICK_LOCATIONS, TABS } from "../constants/ui";
import { MetricCard, SectionCard, TrendPill } from "../components/common/Cards";
import LaunchAnimation from "../components/LaunchAnimation";
import { displayNumber, formatUtcDate } from "../utils/format";
import { buildForecastPdfHtml } from "../utils/pdfReport";
import { getDayOutlook, weatherCodeLabel } from "../utils/weatherOutlook";

const toLocalDateTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

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

const requestLocationPermission = async () => {
  if (Platform.OS !== "android") {
    Geolocation.requestAuthorization?.("whenInUse");
    return true;
  }

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: "Location Permission",
      message: "Current location weather dikhane ke liye location access allow karo.",
      buttonPositive: "Allow",
      buttonNegative: "Deny",
    }
  );

  return granted === PermissionsAndroid.RESULTS.GRANTED;
};

const getCurrentPosition = () =>
  new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000,
    });
  });

const reverseGeocodeLabel = async ({ latitude, longitude }) => {
  const query = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: "jsonv2",
    addressdetails: "1",
  }).toString();

  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "OrbitCastNovaCLI/1.0",
    },
  });
  if (!response.ok) return null;

  const payload = await response.json();
  const address = payload?.address || {};
  const area =
    address?.city ||
    address?.town ||
    address?.village ||
    address?.suburb ||
    address?.county ||
    null;
  const state = address?.state || address?.state_district || null;
  const country = address?.country || null;
  const parts = [area, state, country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
};

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState("earth");
  const [showLaunch, setShowLaunch] = useState(true);
  const [locationQuery, setLocationQuery] = useState(QUICK_LOCATIONS[0].label);
  const [latitudeInput, setLatitudeInput] = useState(String(QUICK_LOCATIONS[0].latitude));
  const [longitudeInput, setLongitudeInput] = useState(String(QUICK_LOCATIONS[0].longitude));
  const [selectedLabel, setSelectedLabel] = useState(QUICK_LOCATIONS[0].label);
  const [earthLocationName, setEarthLocationName] = useState(`${QUICK_LOCATIONS[0].label}, India`);
  const [searchResults, setSearchResults] = useState([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [locatingDevice, setLocatingDevice] = useState(false);
  const [sharingForecast, setSharingForecast] = useState(false);
  const [coords, setCoords] = useState({
    latitude: QUICK_LOCATIONS[0].latitude,
    longitude: QUICK_LOCATIONS[0].longitude,
  });

  const [earthData, setEarthData] = useState(null);
  const [earthForecastData, setEarthForecastData] = useState(null);
  const [marsData, setMarsData] = useState(null);
  const [moonData, setMoonData] = useState(null);
  const [apodData, setApodData] = useState(null);
  const [isroData, setIsroData] = useState(null);

  const [sectionErrors, setSectionErrors] = useState({});
  const [uiError, setUiError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const bootstrapRef = useRef(false);
  const screenLoadSeq = useRef(0);
  const locationFetchSeq = useRef(0);
  const spaceFetchSeq = useRef(0);

  const mergeSectionErrors = useCallback((patch) => {
    setSectionErrors((prev) => {
      const next = { ...prev };
      Object.entries(patch).forEach(([key, value]) => {
        if (value) {
          next[key] = value;
        } else {
          delete next[key];
        }
      });
      return next;
    });
  }, []);

  const loadLocationData = useCallback(
    async (targetCoords) => {
      const fetchId = ++locationFetchSeq.current;
      const [earthAnalysisResult, earthForecastResult, moonResult] = await Promise.allSettled([
        fetchEarthWeatherAnalysis(targetCoords),
        fetchEarthForecast(targetCoords),
        fetchMoonConditions(targetCoords),
      ]);

      if (fetchId !== locationFetchSeq.current) {
        return;
      }

      const errorPatch = {};

      if (earthAnalysisResult.status === "fulfilled") {
        setEarthData(earthAnalysisResult.value);
        errorPatch.earth = null;
      } else {
        errorPatch.earth =
          earthAnalysisResult.reason?.message || "Earth weather analysis fetch failed.";
      }

      if (earthForecastResult.status === "fulfilled") {
        setEarthForecastData(earthForecastResult.value);
        errorPatch.earthForecast = null;
      } else {
        errorPatch.earthForecast =
          earthForecastResult.reason?.message || "Earth forecast fetch failed.";
      }

      if (moonResult.status === "fulfilled") {
        setMoonData(moonResult.value);
        errorPatch.moon = null;
      } else {
        errorPatch.moon = moonResult.reason?.message || "Moon conditions fetch failed.";
      }

      mergeSectionErrors(errorPatch);
    },
    [mergeSectionErrors]
  );

  const loadSpaceData = useCallback(
    async () => {
      const fetchId = ++spaceFetchSeq.current;
      const [marsResult, apodResult, isroResult] = await Promise.allSettled([
        fetchMarsWeather(),
        fetchApod(),
        fetchIsroSnapshot(),
      ]);

      if (fetchId !== spaceFetchSeq.current) {
        return;
      }

      const errorPatch = {};

      if (marsResult.status === "fulfilled") {
        setMarsData(marsResult.value);
        errorPatch.mars = null;
      } else {
        errorPatch.mars = marsResult.reason?.message || "Mars weather fetch failed.";
      }

      if (apodResult.status === "fulfilled") {
        setApodData(apodResult.value);
        errorPatch.apod = null;
      } else {
        errorPatch.apod = apodResult.reason?.message || "APOD fetch failed.";
      }

      if (isroResult.status === "fulfilled") {
        setIsroData(isroResult.value);
        errorPatch.isro = null;
      } else {
        errorPatch.isro = isroResult.reason?.message || "ISRO feed fetch failed.";
      }

      mergeSectionErrors(errorPatch);
    },
    [mergeSectionErrors]
  );

  useEffect(() => {
    let active = true;
    const loadId = ++screenLoadSeq.current;

    const runLoad = async () => {
      setLoading(true);
      setUiError("");

      if (!bootstrapRef.current) {
        bootstrapRef.current = true;
        await Promise.allSettled([loadLocationData(coords), loadSpaceData()]);
      } else {
        await loadLocationData(coords);
      }

      if (!active || screenLoadSeq.current !== loadId) {
        return;
      }

      setLoading(false);
    };

    runLoad();

    return () => {
      active = false;
    };
  }, [coords, loadLocationData, loadSpaceData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setUiError("");

    await Promise.allSettled([loadLocationData(coords), loadSpaceData()]);

    setRefreshing(false);
  }, [coords, loadLocationData, loadSpaceData]);

  const applyCoordinates = () => {
    const latitude = Number(latitudeInput);
    const longitude = Number(longitudeInput);
    const validLat = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
    const validLon = Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;

    if (!validLat || !validLon) {
      setUiError("Latitude/Longitude valid range me dalo. Lat: -90 to 90, Lon: -180 to 180.");
      return;
    }

    setUiError("");
    setSelectedLabel("Custom");
    setEarthLocationName(`Custom (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
    setSearchResults([]);
    setCoords({ latitude, longitude });
  };

  const applyPreset = (preset) => {
    setSelectedLabel(preset.label);
    setLocationQuery(preset.label);
    setLatitudeInput(String(preset.latitude));
    setLongitudeInput(String(preset.longitude));
    setEarthLocationName(`${preset.label}, India`);
    setUiError("");
    setSearchResults([]);
    setCoords({ latitude: preset.latitude, longitude: preset.longitude });
  };

  const applyResolvedLocation = useCallback((location, clearSearchList = true) => {
    if (!location) return;
    setSelectedLabel(location.label);
    setLocationQuery(location.label);
    setLatitudeInput(String(location.latitude));
    setLongitudeInput(String(location.longitude));
    setEarthLocationName(location.label);
    setUiError("");
    if (clearSearchList) {
      setSearchResults([]);
    }
    setCoords({ latitude: location.latitude, longitude: location.longitude });
  }, []);

  const searchLocation = useCallback(async () => {
    const query = locationQuery.trim();
    if (!query) {
      setUiError("City ya 6-digit pincode dalo, phir search karo.");
      return;
    }

    setSearchingLocation(true);
    setUiError("");

    try {
      const locations = await searchEarthLocations(query);
      if (!locations.length) {
        setSearchResults([]);
        setUiError("Location nahi mila. City name ya 6-digit pincode try karo.");
        return;
      }

      setSearchResults(locations);
      applyResolvedLocation(locations[0], false);
    } catch (error) {
      setSearchResults([]);
      setUiError(error?.message || "Location search fail ho gaya. Dobara try karo.");
    } finally {
      setSearchingLocation(false);
    }
  }, [locationQuery, applyResolvedLocation]);

  const useCurrentLocation = useCallback(async () => {
    setLocatingDevice(true);
    setUiError("");

    try {
      const granted = await requestLocationPermission();
      if (!granted) {
        setUiError("Location permission allow karo tabhi current location weather aa payega.");
        return;
      }

      const position = await getCurrentPosition();

      const latitude = Number(position.coords.latitude.toFixed(5));
      const longitude = Number(position.coords.longitude.toFixed(5));
      const fallbackLabel = `Current Location (${latitude}, ${longitude})`;

      setSelectedLabel("Current");
      setLocationQuery(`${latitude}, ${longitude}`);
      setEarthLocationName(fallbackLabel);
      setLatitudeInput(String(latitude));
      setLongitudeInput(String(longitude));
      setSearchResults([]);
      setCoords({ latitude, longitude });

      try {
        const humanLabel = await reverseGeocodeLabel({ latitude, longitude });
        if (humanLabel) {
          setEarthLocationName(`${humanLabel} (Current Location)`);
        }
      } catch {
        // Reverse geocoding can fail on some devices/networks; coordinate label is enough.
      }
    } catch (error) {
      setUiError(error?.message || "Current location fetch fail hua. Dobara try karo.");
    } finally {
      setLocatingDevice(false);
    }
  }, []);

  const createAndShareForecastPdf = useCallback(async () => {
    if (!earthForecastData) {
      setUiError("Forecast data ready hone do, phir PDF generate karo.");
      return;
    }

    if (Platform.OS === "web") {
      setUiError("RN CLI build me PDF share Android/iOS par supported hai.");
      return;
    }

    setSharingForecast(true);
    setUiError("");

    try {
      const generatedAt = new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date());

      const html = buildForecastPdfHtml({
        locationName: earthLocationName,
        coords,
        generatedAt,
        forecast: earthForecastData,
        analysis: earthData,
      });

      const file = await RNHTMLtoPDF.convert({
        html,
        fileName: `forecast-${Date.now()}`,
        directory: "Documents",
      });

      if (!file?.filePath) {
        throw new Error("PDF file path generate nahi hua.");
      }

      await Share.open({
        title: "Share Weather Forecast PDF",
        type: "application/pdf",
        url: `file://${file.filePath}`,
        failOnCancel: false,
      });
    } catch (error) {
      setUiError(error?.message || "PDF generate/share fail hua. Dobara try karo.");
    } finally {
      setSharingForecast(false);
    }
  }, [coords, earthData, earthForecastData, earthLocationName]);

  const earthInsights = useMemo(() => earthData?.insights || [], [earthData]);

  const renderEarth = () => (
    <>
      <SectionCard styles={styles}
        title="Location Setup"
        subtitle="City/PIN search karo. Forecast, sunrise/sunset, aur rainy/cloudy day outlook yahin milega."
      >
        <Text style={styles.inputLabel}>Search by City or Pincode</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={locationQuery}
            onChangeText={setLocationQuery}
            placeholder="Jaipur / Mumbai / 110001"
            placeholderTextColor="#7f94a8"
          />
          <Pressable style={styles.searchButton} onPress={searchLocation}>
            <Text style={styles.searchButtonText}>Search</Text>
          </Pressable>
        </View>
        <Pressable
          style={[styles.secondaryButton, locatingDevice && styles.disabledButton]}
          onPress={useCurrentLocation}
          disabled={locatingDevice}
        >
          <Text style={styles.secondaryButtonText}>Use My Current Location</Text>
        </Pressable>
        {locatingDevice ? (
          <Text style={styles.captionText}>Reading your device location...</Text>
        ) : null}
        {searchingLocation ? (
          <Text style={styles.captionText}>Searching location...</Text>
        ) : null}

        {searchResults.length ? (
          <View style={styles.searchResultList}>
            {searchResults.map((location) => (
              <Pressable
                key={location.id}
                style={[
                  styles.searchResultItem,
                  earthLocationName === location.label && styles.searchResultItemActive,
                ]}
                onPress={() => applyResolvedLocation(location)}
              >
                <Text style={styles.searchResultTitle}>{location.label}</Text>
                <Text style={styles.searchResultMeta}>
                  {displayNumber(location.latitude, 3)} , {displayNumber(location.longitude, 3)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={styles.captionText}>Selected: {earthLocationName}</Text>
        <View style={styles.inputRow}>
          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>Latitude</Text>
            <TextInput
              style={styles.input}
              value={latitudeInput}
              onChangeText={setLatitudeInput}
              keyboardType="numeric"
              placeholder="28.6139"
              placeholderTextColor="#7f94a8"
            />
          </View>
          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>Longitude</Text>
            <TextInput
              style={styles.input}
              value={longitudeInput}
              onChangeText={setLongitudeInput}
              keyboardType="numeric"
              placeholder="77.2090"
              placeholderTextColor="#7f94a8"
            />
          </View>
        </View>
        <Pressable style={styles.actionButton} onPress={applyCoordinates}>
          <Text style={styles.actionButtonText}>Apply Location</Text>
        </Pressable>
        <View style={styles.presetRow}>
          {QUICK_LOCATIONS.map((preset) => (
            <Pressable
              key={preset.label}
              style={[
                styles.presetChip,
                selectedLabel === preset.label && styles.presetChipActive,
              ]}
              onPress={() => applyPreset(preset)}
            >
              <Text
                style={[
                  styles.presetChipText,
                  selectedLabel === preset.label && styles.presetChipTextActive,
                ]}
              >
                {preset.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {uiError ? <Text style={styles.errorText}>{uiError}</Text> : null}
      </SectionCard>

      {earthForecastData ? (
        <SectionCard styles={styles}
          title="Forecast + Sunrise/Sunset"
          subtitle={`Source: ${earthForecastData.meta.source} | Timezone: ${earthForecastData.meta.timezone}`}
        >
          <Text style={styles.rowText}>Current Local Time: {(earthForecastData.current.time || "--").replace("T", " ")}</Text>
          <View style={styles.metricGrid}>
            <MetricCard styles={styles}
              label="Temperature"
              value={displayNumber(earthForecastData.current.tempC, 1)}
              unit="C"
              accent
            />
            <MetricCard styles={styles}
              label="Humidity"
              value={displayNumber(earthForecastData.current.humidityPct, 0)}
              unit="%"
            />
            <MetricCard styles={styles}
              label="Wind"
              value={displayNumber(earthForecastData.current.windKmh, 1)}
              unit="km/h"
            />
            <MetricCard styles={styles}
              label="Pressure"
              value={displayNumber(earthForecastData.current.pressureHpa, 1)}
              unit="hPa"
            />
            <MetricCard styles={styles}
              label="Rain Chance"
              value={displayNumber(earthForecastData.current.precipProbPct, 0)}
              unit="%"
            />
          </View>

          {earthForecastData.daily[0]
            ? (() => {
                const day = earthForecastData.daily[0];
                const outlook = getDayOutlook({
                  weatherCode: day.weatherCode,
                  precipitationProbabilityMax: day.precipitationProbabilityMax,
                  precipitationMm: day.precipitationMm,
                  cloudCoverMean: day.cloudCoverMean,
                });
                const toneStyle =
                  (outlook.tone === "rain" && styles.outlookRain) ||
                  (outlook.tone === "cloud" && styles.outlookCloud) ||
                  (outlook.tone === "clear" && styles.outlookClear) ||
                  styles.outlookMixed;

                return (
                  <View style={styles.todayOutlookCard}>
                    <Text style={styles.subtleHeading}>Today Daytime Outlook</Text>
                    <View style={[styles.outlookBadge, toneStyle, styles.outlookBadgeLarge]}>
                      <Text style={styles.outlookBadgeText}>{outlook.label}</Text>
                    </View>
                    <Text style={styles.rowText}>
                      {outlook.details} | {weatherCodeLabel(day.weatherCode)}
                    </Text>
                  </View>
                );
              })()
            : null}

          <Text style={styles.subtleHeading}>Today Sun Timings</Text>
          <View style={styles.metricGrid}>
            <MetricCard styles={styles} label="Sunrise" value={toClock(earthForecastData.today.sunrise)} />
            <MetricCard styles={styles} label="Sunset" value={toClock(earthForecastData.today.sunset)} />
          </View>

          <Text style={styles.subtleHeading}>3-Day Forecast + Day Outlook</Text>
          {earthForecastData.daily.map((day) => {
            const outlook = getDayOutlook({
              weatherCode: day.weatherCode,
              precipitationProbabilityMax: day.precipitationProbabilityMax,
              precipitationMm: day.precipitationMm,
              cloudCoverMean: day.cloudCoverMean,
            });

            const toneStyle =
              (outlook.tone === "rain" && styles.outlookRain) ||
              (outlook.tone === "cloud" && styles.outlookCloud) ||
              (outlook.tone === "clear" && styles.outlookClear) ||
              styles.outlookMixed;

            return (
              <View key={day.date} style={styles.forecastDayCard}>
                <View style={styles.outlookHeader}>
                  <Text style={styles.regionTitle}>{toDayLabel(day.date)}</Text>
                  <View style={[styles.outlookBadge, toneStyle]}>
                    <Text style={styles.outlookBadgeText}>{outlook.label}</Text>
                  </View>
                </View>
                <Text style={styles.rowText}>
                  Min/Max: {displayNumber(day.minC, 1)} C / {displayNumber(day.maxC, 1)} C
                </Text>
                <Text style={styles.rowText}>
                  Rain: {displayNumber(day.precipitationMm, 1)} mm | Rain chance:{" "}
                  {displayNumber(day.precipitationProbabilityMax, 0)}%
                </Text>
                <Text style={styles.rowText}>
                  Cloud cover: {displayNumber(day.cloudCoverMean, 0)}% | Code:{" "}
                  {weatherCodeLabel(day.weatherCode)}
                </Text>
                <Text style={styles.regionNote}>
                  Sunrise: {toClock(day.sunrise)} | Sunset: {toClock(day.sunset)} | {outlook.details}
                </Text>
              </View>
            );
          })}

          {earthForecastData.nextHours.length ? (
            <>
              <Text style={styles.subtleHeading}>Next Hours</Text>
              {earthForecastData.nextHours.map((hour) => (
                <View key={hour.time} style={styles.hourlyRow}>
                  <Text style={styles.hourlyTime}>{toClock(hour.time)}</Text>
                  <Text style={styles.hourlyStats}>
                    {displayNumber(hour.tempC, 1)} C | Hum {displayNumber(hour.humidityPct, 0)}% | Wind{" "}
                    {displayNumber(hour.windKmh, 1)} km/h | Rain {displayNumber(hour.precipProbPct, 0)}%
                  </Text>
                </View>
              ))}
            </>
          ) : null}
          <Pressable
            style={[styles.actionButton, sharingForecast && styles.disabledButton]}
            onPress={createAndShareForecastPdf}
            disabled={sharingForecast}
          >
            <Text style={styles.actionButtonText}>
              {sharingForecast ? "Preparing PDF..." : "Generate & Share Forecast PDF"}
            </Text>
          </Pressable>
        </SectionCard>
      ) : null}

      {earthData ? (
        <SectionCard styles={styles}
          title="In-Depth Earth Analysis"
          subtitle={`Source: ${earthData.meta.source} | Updated (UTC): ${formatUtcDate(
            earthData.latest.updatedUtc
          )}`}
        >
          <View style={styles.metricGrid}>
            <MetricCard styles={styles}
              label="Temperature"
              value={displayNumber(earthData.latest.tempC, 1)}
              unit="C"
              accent
            />
            <MetricCard styles={styles}
              label="Humidity"
              value={displayNumber(earthData.latest.humidityPct, 1)}
              unit="%"
            />
            <MetricCard styles={styles}
              label="Wind"
              value={displayNumber(earthData.latest.windMs, 1)}
              unit="m/s"
            />
            <MetricCard styles={styles}
              label="Pressure"
              value={displayNumber(earthData.latest.pressureKpa, 1)}
              unit="kPa"
            />
            <MetricCard styles={styles}
              label="Rain Rate"
              value={displayNumber(earthData.latest.rainMmHr, 2)}
              unit="mm/h"
            />
            <MetricCard styles={styles}
              label="Solar Flux"
              value={displayNumber(earthData.latest.solarFlux, 2)}
              unit="kWh/m2"
            />
          </View>

          <Text style={styles.subtleHeading}>Range Snapshot</Text>
          <View style={styles.metricGrid}>
            <MetricCard styles={styles}
              label="Temp Min"
              value={displayNumber(earthData.stats.tempMin, 1)}
              unit="C"
            />
            <MetricCard styles={styles}
              label="Temp Max"
              value={displayNumber(earthData.stats.tempMax, 1)}
              unit="C"
            />
            <MetricCard styles={styles}
              label="Temp Avg"
              value={displayNumber(earthData.stats.tempAvg, 1)}
              unit="C"
            />
            <MetricCard styles={styles}
              label="Humidity Avg"
              value={displayNumber(earthData.stats.humidityAvg, 1)}
              unit="%"
            />
            <MetricCard styles={styles}
              label="Wind Avg"
              value={displayNumber(earthData.stats.windAvg, 1)}
              unit="m/s"
            />
            <MetricCard styles={styles}
              label="Rain Total"
              value={displayNumber(earthData.stats.rainTotal, 1)}
              unit="mm"
            />
          </View>

          <Text style={styles.subtleHeading}>Trend (last 12h split in two windows)</Text>
          <View style={styles.trendRow}>
            <TrendPill styles={styles}
              label={DELTA_LABELS.tempDelta}
              value={earthData.trend.tempDelta}
              unit="C"
            />
            <TrendPill styles={styles}
              label={DELTA_LABELS.humidityDelta}
              value={earthData.trend.humidityDelta}
              unit="%"
            />
            <TrendPill styles={styles}
              label={DELTA_LABELS.windDelta}
              value={earthData.trend.windDelta}
              unit="m/s"
            />
          </View>

          <Text style={styles.subtleHeading}>AI-Lite Insights</Text>
          {earthInsights.map((line) => (
            <View key={line} style={styles.insightBox}>
              <Text style={styles.insightText}>{line}</Text>
            </View>
          ))}
        </SectionCard>
      ) : null}

      {sectionErrors.earth || sectionErrors.earthForecast ? (
        <SectionCard styles={styles} title="Earth API Error">
          {sectionErrors.earth ? <Text style={styles.errorText}>{sectionErrors.earth}</Text> : null}
          {sectionErrors.earthForecast ? (
            <Text style={styles.errorText}>{sectionErrors.earthForecast}</Text>
          ) : null}
        </SectionCard>
      ) : null}
    </>
  );

  const renderMars = () => (
    <>
      <SectionCard styles={styles}
        title="Mars Weather (NASA)"
        subtitle="Official Mars weather live stations limited hain. InSight ka data historical/limited ho sakta hai."
      >
        {marsData?.available ? (
          <>
            <Text style={styles.rowText}>Latest Sol: {marsData.latestSol}</Text>
            <Text style={styles.rowText}>Season: {marsData.latest.season || "Unknown"}</Text>
            <Text style={styles.rowText}>
              Temp Avg: {displayNumber(marsData.latest.temp, 1)} C | Min:{" "}
              {displayNumber(marsData.latest.tempMin, 1)} C | Max:{" "}
              {displayNumber(marsData.latest.tempMax, 1)} C
            </Text>
            <Text style={styles.rowText}>
              Wind Avg: {displayNumber(marsData.latest.wind, 1)} m/s | Direction:{" "}
              {marsData.latest.windDirection || "--"}
            </Text>
            <Text style={styles.rowText}>
              Pressure: {displayNumber(marsData.latest.pressure, 1)} Pa
            </Text>
            <Text style={styles.rowText}>
              First UTC: {toLocalDateTime(marsData.latest.firstUtc)}
            </Text>
            <Text style={styles.rowText}>
              Last UTC: {toLocalDateTime(marsData.latest.lastUtc)}
            </Text>
          </>
        ) : (
          <Text style={styles.rowText}>{marsData?.note || "No Mars weather data available."}</Text>
        )}
      </SectionCard>

      {marsData?.regions?.length ? (
        <SectionCard styles={styles}
          title="Mars Regional View (North/South/East)"
          subtitle="Ye cards direct regional sensors nahi hain, single-station model estimates hain."
        >
          {marsData.regions.map((region) => (
            <View key={region.label} style={styles.regionCard}>
              <Text style={styles.regionTitle}>{region.label}</Text>
              <Text style={styles.rowText}>
                Temp: {displayNumber(region.temp, 1)} C | Wind: {displayNumber(region.wind, 1)} m/s
              </Text>
              <Text style={styles.rowText}>
                Pressure: {displayNumber(region.pressure, 2)} Pa
              </Text>
              <Text style={styles.regionNote}>{region.note}</Text>
            </View>
          ))}
          <Text style={styles.warningText}>{marsData.note}</Text>
        </SectionCard>
      ) : null}

      {sectionErrors.mars ? (
        <SectionCard styles={styles} title="Mars API Error">
          <Text style={styles.errorText}>{sectionErrors.mars}</Text>
        </SectionCard>
      ) : null}
    </>
  );

  const renderMoon = () => (
    <>
      <SectionCard styles={styles}
        title="Moon Conditions"
        subtitle="Moon par Earth jaisa weather nahi hota, par useful lunar conditions dekh sakte ho."
      >
        {moonData ? (
          <>
            <MetricCard styles={styles} label="Moon Phase" value={moonData.phaseLabel} />
            <MetricCard styles={styles} label="Illumination" value={moonData.illumination || "--"} />
            <View style={styles.metricGrid}>
              <MetricCard styles={styles} label="Moonrise" value={toLocalDateTime(moonData.moonrise)} />
              <MetricCard styles={styles} label="Moonset" value={toLocalDateTime(moonData.moonset)} />
            </View>
            <View style={styles.metricGrid}>
              <MetricCard styles={styles}
                label="Surface Day"
                value={displayNumber(moonData.estimatedSurfaceTemp.dayC, 0)}
                unit="C"
              />
              <MetricCard styles={styles}
                label="Surface Night"
                value={displayNumber(moonData.estimatedSurfaceTemp.nightC, 0)}
                unit="C"
              />
            </View>
            <Text style={styles.rowText}>{moonData.note}</Text>
            <Text style={styles.captionText}>Source: {moonData.source}</Text>
          </>
        ) : (
          <Text style={styles.rowText}>Moon conditions loading failed.</Text>
        )}
      </SectionCard>

      {sectionErrors.moon ? (
        <SectionCard styles={styles} title="Moon API Error">
          <Text style={styles.errorText}>{sectionErrors.moon}</Text>
        </SectionCard>
      ) : null}
    </>
  );

  const renderApod = () => (
    <>
      <SectionCard styles={styles}
        title="Astronomy Picture of the Day"
        subtitle="NASA APOD endpoint se daily space image/video."
      >
        {apodData ? (
          <>
            <Text style={styles.apodTitle}>{apodData.title}</Text>
            <Text style={styles.captionText}>Date: {apodData.date}</Text>
            {apodData.mediaType === "image" ? (
              <Image source={{ uri: apodData.imageUrl }} style={styles.apodImage} />
            ) : (
              <Pressable
                style={styles.actionButton}
                onPress={() => Linking.openURL(apodData.imageUrl)}
              >
                <Text style={styles.actionButtonText}>Open APOD Video</Text>
              </Pressable>
            )}
            <Text style={styles.apodText}>{apodData.explanation}</Text>
            {apodData.copyright ? (
              <Text style={styles.captionText}>Copyright: {apodData.copyright}</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.rowText}>APOD data not available.</Text>
        )}
      </SectionCard>

      {sectionErrors.apod ? (
        <SectionCard styles={styles} title="APOD API Error">
          <Text style={styles.errorText}>{sectionErrors.apod}</Text>
        </SectionCard>
      ) : null}
    </>
  );

  const renderIsro = () => (
    <>
      <SectionCard styles={styles}
        title="ISRO Snapshot"
        subtitle="ISRO public info summary. Yeh source community maintained hai."
      >
        {isroData ? (
          <>
            <View style={styles.metricGrid}>
              <MetricCard styles={styles} label="Spacecrafts" value={String(isroData.totals.spacecrafts)} />
              <MetricCard styles={styles} label="Launchers" value={String(isroData.totals.launchers)} />
              <MetricCard styles={styles} label="Centres" value={String(isroData.totals.centres)} />
              <MetricCard styles={styles}
                label="Customer Sats"
                value={String(isroData.totals.customerSatellites)}
              />
            </View>
            <Text style={styles.subtleHeading}>Spotlight Spacecrafts</Text>
            {isroData.spotlight.spacecrafts.map((craft) => (
              <Text key={craft.id || craft.name} style={styles.rowText}>
                - {craft.name}
              </Text>
            ))}
            <Text style={styles.captionText}>{isroData.source}</Text>
            {isroData.partialErrors.length ? (
              <Text style={styles.warningText}>
                Partial feed issues: {isroData.partialErrors.join(" | ")}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.rowText}>ISRO feed unavailable.</Text>
        )}
      </SectionCard>

      {sectionErrors.isro ? (
        <SectionCard styles={styles} title="ISRO API Error">
          <Text style={styles.errorText}>{sectionErrors.isro}</Text>
        </SectionCard>
      ) : null}
    </>
  );

  const renderActiveTab = () => {
    if (activeTab === "earth") return renderEarth();
    if (activeTab === "mars") return renderMars();
    if (activeTab === "moon") return renderMoon();
    if (activeTab === "apod") return renderApod();
    return renderIsro();
  };

  return (
    <View style={styles.page}>
      <StatusBar barStyle="light-content" backgroundColor="#05111b" />
      <View style={styles.ambientOrbA} />
      <View style={styles.ambientOrbB} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.kicker}>{APP_IDENTITY.kicker}</Text>
        <Text style={styles.title}>{APP_IDENTITY.name}</Text>
        <Text style={styles.subtitle}>{APP_IDENTITY.subtitle}</Text>
        <Text style={styles.captionText}>
          NASA API Key in use: {nasaKeyInUse === "DEMO_KEY" ? "DEMO_KEY (rate limited)" : "Custom Key"}
        </Text>

        <View style={styles.tabRow}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text
                style={[styles.tabButtonText, activeTab === tab.key && styles.tabButtonTextActive]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#f4b400" />
            <Text style={styles.rowText}>Space data loading...</Text>
          </View>
        ) : (
          renderActiveTab()
        )}
      </ScrollView>
      <LaunchAnimation
        visible={showLaunch}
        title={APP_IDENTITY.name}
        subtitle="Calibrating weather models and orbital feeds..."
        onDone={() => setShowLaunch(false)}
        styles={styles}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#05111b",
  },
  launchOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(3, 12, 20, 0.94)",
    zIndex: 40,
  },
  launchOrb: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(83, 177, 250, 0.22)",
  },
  launchCard: {
    width: "84%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#2f6083",
    backgroundColor: "rgba(9, 35, 54, 0.95)",
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  launchTitle: {
    color: "#f6fbff",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  launchSubtitle: {
    color: "#9fc2dd",
    marginTop: 10,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  ambientOrbA: {
    position: "absolute",
    top: -60,
    right: -30,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(234, 133, 39, 0.18)",
  },
  ambientOrbB: {
    position: "absolute",
    bottom: 70,
    left: -70,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(63, 164, 255, 0.16)",
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingTop: 58,
    paddingBottom: 120,
    paddingHorizontal: 16,
  },
  kicker: {
    color: "#9cc6ea",
    fontSize: 12,
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  title: {
    color: "#f7fbff",
    fontSize: 32,
    fontWeight: "800",
    marginTop: 6,
  },
  subtitle: {
    color: "#a5c3de",
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  captionText: {
    color: "#87a4bf",
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
  },
  tabRow: {
    marginTop: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tabButton: {
    backgroundColor: "#0f2436",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#193c58",
  },
  tabButtonActive: {
    backgroundColor: "#f4b400",
    borderColor: "#f4b400",
  },
  tabButtonText: {
    color: "#d8e7f5",
    fontSize: 12,
    fontWeight: "700",
  },
  tabButtonTextActive: {
    color: "#1b1b1b",
  },
  sectionCard: {
    marginTop: 14,
    backgroundColor: "rgba(11, 30, 45, 0.95)",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#163c59",
  },
  sectionTitle: {
    color: "#f1f8ff",
    fontSize: 18,
    fontWeight: "700",
  },
  sectionSubtitle: {
    color: "#99b5cf",
    marginTop: 4,
    lineHeight: 19,
  },
  inputRow: {
    flexDirection: "row",
    marginTop: 14,
    gap: 12,
  },
  inputBlock: {
    flex: 1,
  },
  inputLabel: {
    color: "#aac7e1",
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    backgroundColor: "#071f32",
    color: "#e8f2fc",
    borderWidth: 1,
    borderColor: "#204863",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  searchRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    backgroundColor: "#071f32",
    color: "#e8f2fc",
    borderWidth: 1,
    borderColor: "#204863",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  searchButton: {
    backgroundColor: "#48b6ff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchButtonText: {
    color: "#082033",
    fontWeight: "800",
    fontSize: 12,
  },
  searchResultList: {
    marginTop: 10,
    gap: 8,
  },
  searchResultItem: {
    borderWidth: 1,
    borderColor: "#295674",
    borderRadius: 10,
    backgroundColor: "#09283c",
    padding: 10,
  },
  searchResultItemActive: {
    borderColor: "#62c5ff",
    backgroundColor: "#10344c",
  },
  searchResultTitle: {
    color: "#e4f2ff",
    fontWeight: "700",
  },
  searchResultMeta: {
    color: "#93b3cd",
    marginTop: 2,
    fontSize: 12,
  },
  actionButton: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: "#f4b400",
    paddingVertical: 11,
    alignItems: "center",
  },
  secondaryButton: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: "#1f6ea4",
    paddingVertical: 11,
    alignItems: "center",
  },
  actionButtonText: {
    color: "#121212",
    fontWeight: "800",
  },
  secondaryButtonText: {
    color: "#e7f4ff",
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.55,
  },
  presetRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetChip: {
    backgroundColor: "#0c2a42",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1f4f70",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  presetChipActive: {
    backgroundColor: "#16496b",
    borderColor: "#5ec0ff",
  },
  presetChipText: {
    color: "#b2cce3",
    fontSize: 12,
    fontWeight: "700",
  },
  presetChipTextActive: {
    color: "#e7f5ff",
  },
  metricGrid: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    flexBasis: "48%",
    backgroundColor: "#0d2739",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e4662",
    padding: 10,
  },
  metricCardAccent: {
    borderColor: "#f4b400",
    backgroundColor: "#2c2716",
  },
  metricLabel: {
    color: "#99b4cc",
    fontSize: 12,
  },
  metricValue: {
    color: "#f4fbff",
    marginTop: 6,
    fontSize: 17,
    fontWeight: "800",
  },
  metricUnit: {
    color: "#9fc2dd",
    fontSize: 12,
    fontWeight: "600",
  },
  subtleHeading: {
    marginTop: 14,
    color: "#d7e9f8",
    fontSize: 13,
    fontWeight: "700",
  },
  trendRow: {
    marginTop: 8,
    gap: 8,
  },
  trendPill: {
    backgroundColor: "#0c2f44",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1f5a7e",
    padding: 10,
  },
  trendPositive: {
    borderColor: "#e89e33",
    backgroundColor: "#33250f",
  },
  trendNegative: {
    borderColor: "#66d7d1",
    backgroundColor: "#0f2f31",
  },
  trendLabel: {
    color: "#a7c5dc",
    fontSize: 12,
  },
  trendValue: {
    color: "#f0f8ff",
    marginTop: 4,
    fontSize: 16,
    fontWeight: "700",
  },
  insightBox: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#355c78",
    padding: 10,
    backgroundColor: "#09293d",
  },
  insightText: {
    color: "#d0e5f5",
    lineHeight: 19,
  },
  rowText: {
    marginTop: 6,
    color: "#d8e9f8",
    lineHeight: 20,
  },
  regionCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#2c5a77",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#0a2639",
  },
  regionTitle: {
    color: "#f0f7ff",
    fontSize: 14,
    fontWeight: "700",
  },
  regionNote: {
    color: "#9bb6cd",
    marginTop: 4,
    fontSize: 12,
  },
  forecastDayCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#2c5a77",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#0a2639",
  },
  outlookHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  outlookBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  outlookBadgeLarge: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  outlookBadgeText: {
    color: "#e8f6ff",
    fontSize: 11,
    fontWeight: "800",
  },
  outlookRain: {
    backgroundColor: "#10344a",
    borderColor: "#49baf0",
  },
  outlookCloud: {
    backgroundColor: "#2d2f38",
    borderColor: "#9eafc5",
  },
  outlookClear: {
    backgroundColor: "#33280f",
    borderColor: "#f5b442",
  },
  outlookMixed: {
    backgroundColor: "#1f2f3e",
    borderColor: "#78b2df",
  },
  todayOutlookCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#316283",
    backgroundColor: "#0a2b41",
    borderRadius: 12,
    padding: 10,
  },
  hourlyRow: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#214a66",
    borderRadius: 10,
    backgroundColor: "#0a2233",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  hourlyTime: {
    color: "#f0f8ff",
    fontWeight: "700",
    fontSize: 12,
  },
  hourlyStats: {
    color: "#c4dced",
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
  },
  apodTitle: {
    marginTop: 6,
    color: "#f6fbff",
    fontSize: 19,
    fontWeight: "800",
  },
  apodImage: {
    marginTop: 10,
    width: "100%",
    height: 230,
    borderRadius: 12,
    backgroundColor: "#0a2438",
  },
  apodText: {
    marginTop: 10,
    color: "#d3e6f5",
    lineHeight: 21,
  },
  warningText: {
    marginTop: 8,
    color: "#f6cf88",
    lineHeight: 19,
  },
  errorText: {
    marginTop: 8,
    color: "#ff9f9f",
    lineHeight: 19,
  },
  loadingWrap: {
    marginTop: 20,
    alignItems: "center",
    gap: 10,
  },
});

