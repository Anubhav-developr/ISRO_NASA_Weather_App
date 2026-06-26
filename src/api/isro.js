const ISRO_BASE = "https://isro.vercel.app/api";

const requestJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ISRO request failed (${response.status}): ${text || response.statusText}`);
  }
  return response.json();
};

const settledValue = (result) => (result.status === "fulfilled" ? result.value : null);

export const fetchIsroSnapshot = async () => {
  const [spacecraftsResult, launchersResult, centresResult, customerSatResult] =
    await Promise.allSettled([
      requestJson(`${ISRO_BASE}/spacecrafts`),
      requestJson(`${ISRO_BASE}/launchers`),
      requestJson(`${ISRO_BASE}/centres`),
      requestJson(`${ISRO_BASE}/customer_satellites`),
    ]);

  const spacecrafts = settledValue(spacecraftsResult)?.spacecrafts || [];
  const launchers = settledValue(launchersResult)?.launchers || [];
  const centres = settledValue(centresResult)?.centres || [];
  const customerSatellites = settledValue(customerSatResult)?.customer_satellites || [];

  const errors = [
    spacecraftsResult.status === "rejected" ? spacecraftsResult.reason?.message : null,
    launchersResult.status === "rejected" ? launchersResult.reason?.message : null,
    centresResult.status === "rejected" ? centresResult.reason?.message : null,
    customerSatResult.status === "rejected" ? customerSatResult.reason?.message : null,
  ].filter(Boolean);

  return {
    source: "Community endpoint (isro.vercel.app). Not an official ISRO-owned API.",
    updatedAt: new Date().toISOString(),
    totals: {
      spacecrafts: spacecrafts.length,
      launchers: launchers.length,
      centres: centres.length,
      customerSatellites: customerSatellites.length,
    },
    spotlight: {
      spacecrafts: spacecrafts.slice(0, 5),
      launchers: launchers.slice(0, 5),
      centres: centres.slice(0, 5),
    },
    partialErrors: errors,
  };
};
