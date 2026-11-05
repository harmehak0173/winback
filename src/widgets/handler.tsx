import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { StreakWidget } from './StreakWidget';
import { parseWidgetSnapshot, widgetView, WIDGET_KEY, type WidgetSnapshot } from './update';

/**
 * Runs in a headless JS context when Android renders/updates the widget.
 * Reads the small snapshot the app writes to AsyncStorage (quitDate,
 * dailyRate, discreet...) and computes the live-ish day count and money won
 * back.
 */
async function readSnapshot(): Promise<WidgetSnapshot> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(WIDGET_KEY);
  } catch {}
  return parseWidgetSnapshot(raw);
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
    // Taps use OPEN_URI / OPEN_APP, which Android handles natively without
    // calling us. Any other click that arrives here just gets a fresh render,
    // so a stale "open" state corrects itself on the next touch.
    case 'WIDGET_CLICK':
      props.renderWidget(<StreakWidget {...widgetView(await readSnapshot())} />);
      return;
    case 'WIDGET_DELETED':
    default:
      // The widget is gone (or the action is unknown): nothing to draw.
      return;
  }
}
