// Custom entry: boot the Expo Router app, then (Android only) register the
// home-screen widget task handler. The widget module is required lazily so it
// never loads on iOS or web, and a missing native module (Expo Go, or a build
// without the widget plugin) must never stop the app itself from starting.
import 'expo-router/entry';
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./src/widgets/handler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch {
    // No widget support in this binary - the app works without it.
  }
}
