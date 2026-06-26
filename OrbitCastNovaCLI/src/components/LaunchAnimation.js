import React, { useEffect, useRef } from "react";
import { Animated, Easing, Text } from "react-native";

export default function LaunchAnimation({
  visible,
  title,
  subtitle,
  onDone,
  styles,
}) {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;
  const rise = useRef(new Animated.Value(24)).current;
  const glow = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!visible) return undefined;

    const sequence = Animated.sequence([
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 1,
          duration: 450,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.back(1.3)),
          useNativeDriver: true,
        }),
        Animated.timing(rise, {
          toValue: 0,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(glow, {
        toValue: 1,
        duration: 650,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.delay(260),
      Animated.timing(fade, {
        toValue: 0,
        duration: 420,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    sequence.start(({ finished }) => {
      if (finished && onDone) onDone();
    });

    return () => {
      sequence.stop();
    };
  }, [fade, glow, onDone, rise, scale, visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.launchOverlay, { opacity: fade }]}>
      <Animated.View
        style={[
          styles.launchOrb,
          {
            opacity: glow,
            transform: [{ scale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.launchCard,
          {
            transform: [{ translateY: rise }, { scale }],
          },
        ]}
      >
        <Text style={styles.launchTitle}>{title}</Text>
        <Text style={styles.launchSubtitle}>{subtitle}</Text>
      </Animated.View>
    </Animated.View>
  );
}
