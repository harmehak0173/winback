import { Stack } from 'expo-router';
import { colors } from '@/theme/tokens';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'fade',
        // No swipe-back through the funnel; the quiz has its own back chevron.
        gestureEnabled: false,
      }}
    />
  );
}
