import React from "react";
import { Text, View } from "react-native";

export const MetricCard = ({ styles, label, value, unit, accent = false }) => (
  <View style={[styles.metricCard, accent && styles.metricCardAccent]}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>
      {value}
      {unit ? <Text style={styles.metricUnit}> {unit}</Text> : null}
    </Text>
  </View>
);

export const SectionCard = ({ styles, title, subtitle, children }) => (
  <View style={styles.sectionCard}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    {children}
  </View>
);

export const TrendPill = ({ styles, label, value, unit }) => {
  const numeric = Number(value);
  const isPositive = Number.isFinite(numeric) && numeric > 0;
  const isNegative = Number.isFinite(numeric) && numeric < 0;
  return (
    <View
      style={[
        styles.trendPill,
        isPositive && styles.trendPositive,
        isNegative && styles.trendNegative,
      ]}
    >
      <Text style={styles.trendLabel}>{label}</Text>
      <Text style={styles.trendValue}>
        {Number.isFinite(numeric) ? `${numeric > 0 ? "+" : ""}${numeric.toFixed(1)} ${unit}` : "--"}
      </Text>
    </View>
  );
};
