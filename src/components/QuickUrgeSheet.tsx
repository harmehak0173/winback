import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmberButton } from '@/components/EmberButton';
import { LockCover, useLockCover } from '@/components/LockGate';
import { TriggerPicker } from '@/components/TriggerPicker';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useOverlayHold } from '@/lib/overlayHold';
import { colors, fonts, spacing } from '@/theme/tokens';

/**
 * "I just beat one" (hook 7): log an urge ridden out in two taps, without
 * opening the full panic screen. The link opens this sheet, "Log it" records
 * the win; what set it off is asked afterwards and is optional, so the win
 * never waits on an answer.
 *
 * Two taps rather than one on purpose: a stray tap on Home should not add a
 * win that did not happen. The count is a fact, so it has to stay true.
 *
 * An RN Modal draws above the app-lock cover, so it carries its own.
 */
export function QuickUrgeSheet({
  visible,
  total,
  onLog,
  onClose,
}: {
  visible: boolean;
  /** Lifetime urges ridden out, shown after logging. */
  total: number;
  onLog: () => void;
  onClose: () => void;
}) {
  const [logged, setLogged] = useState(false);
  // The count right after this tap. The store updates a moment later, and
  // until then `total` still held the old number ("That is 0 ridden out").
  const [loggedTotal, setLoggedTotal] = useState(0);
  const reduced = useReducedMotion();
  const { covered } = useLockCover();
  // A tapped reminder waits until this closes (see lib/overlayHold).
  useOverlayHold(visible);

  const close = () => {
    setLogged(false);
    onClose();
  };

  const log = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onLog();
    setLoggedTotal(total + 1);
    setLogged(true);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? 'none' : 'slide'}
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        {/* Under the app lock, hidden from TalkBack too: a Modal is its own
            window on Android, out of reach of LockGate's own hiding. */}
        <Pressable
          style={[StyleSheet.absoluteFill, styles.scrim]}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
          importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={covered}
        />
        <View
          style={styles.sheet}
          accessibilityViewIsModal={!covered}
          onAccessibilityEscape={covered ? undefined : close}
          importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={covered}
        >
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            {logged ? (
              <>
                <Text style={styles.title} accessibilityRole="header" accessibilityLiveRegion="polite">
                  Logged. That is {Math.max(total, loggedTotal)} ridden out.
                </Text>
                <Text style={styles.body}>It stays in your wins column. A slip never takes it off.</Text>
                <View style={styles.picker}>
                  <TriggerPicker kind="urge" label="What set it off?" />
                </View>
                <View style={styles.button}>
                  <EmberButton label="Done" onPress={close} />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.title} accessibilityRole="header">
                  Rode one out?
                </Text>
                <Text style={styles.body}>
                  Log it. It goes in your wins column and it never comes off.
                </Text>
                <View style={styles.button}>
                  <EmberButton label="Log it" onPress={log} />
                </View>
                <Pressable onPress={close} hitSlop={10} accessibilityRole="button" style={styles.cancel}>
                  <Text style={styles.cancelLabel}>Not now</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
        <LockCover />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: colors.bgDeep, opacity: 0.85 },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  content: { paddingTop: 26, paddingBottom: 40 },
  title: {
    fontFamily: fonts.display.extrabold,
    fontSize: 22,
    color: colors.text,
    paddingHorizontal: spacing.screenX,
  },
  body: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    lineHeight: 14 * 1.5,
    color: colors.textMuted,
    marginTop: 8,
    paddingHorizontal: spacing.screenX,
  },
  // TriggerPicker brings its own side padding and top margin.
  picker: { marginTop: -6 },
  button: { marginTop: 22, paddingHorizontal: spacing.screenX },
  cancel: { alignSelf: 'center', marginTop: 14, minHeight: 44, justifyContent: 'center' },
  cancelLabel: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
});
