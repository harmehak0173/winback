import { useState } from 'react';
import { Animated } from 'react-native';

/**
 * Stable Animated.Value created once per mount. React Native ships
 * useAnimatedValue, but react-native-web does not - and the useRef pattern
 * is unsafe under the React Compiler, so use lazy state instead.
 */
export function useAnimatedValue(initialValue: number): Animated.Value {
  const [value] = useState(() => new Animated.Value(initialValue));
  return value;
}
