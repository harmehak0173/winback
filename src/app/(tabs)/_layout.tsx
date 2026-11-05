import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { BarsIcon, FlameIcon, HomeIcon, UserIcon } from '@/components/icons';
import { useAppState } from '@/state/AppState';
import { colors, fonts } from '@/theme/tokens';

/** Four-item tab bar: Home / Streak / Insights / You. Active item ember. */
export default function TabsLayout() {
  const { ready, quitDate } = useAppState();
  if (!ready) return null;
  // Home's counters are meaningless without a quit date - whatever route
  // brought us here, an uncommitted user goes through onboarding first.
  if (!quitDate) return <Redirect href="/onboarding/welcome" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: 'rgba(10,11,13,0.94)',
          borderTopColor: colors.hairlineDim,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.body.semibold,
          fontSize: 10.5,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <HomeIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="streak"
        options={{
          title: 'Streak',
          tabBarIcon: ({ color }) => <FlameIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color }) => <BarsIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarIcon: ({ color }) => <UserIcon color={color} />,
        }}
      />
    </Tabs>
  );
}
