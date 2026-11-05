import React from 'react';
import { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * 2px-stroke line icons drawn inline, paths taken from the design prototype.
 * Decorative only: every icon-only control labels its own Pressable
 * (accessibilityLabel), so the drawings themselves carry no text.
 */
interface IconProps {
  size?: number;
  color: ColorValue;
  strokeWidth?: number;
}

export const CheckIcon = ({ size = 12, color, strokeWidth = 3.5 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 13l4 4L19 7" stroke={color} strokeWidth={strokeWidth} />
  </Svg>
);

export const ChevronLeftIcon = ({ size = 22, color, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={strokeWidth} />
  </Svg>
);

export const XIcon = ({ size = 15, color, strokeWidth = 2.4 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth={strokeWidth} />
  </Svg>
);

export const ShieldIcon = ({ size = 22, color, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" stroke={color} strokeWidth={strokeWidth} />
  </Svg>
);

export const PhoneIcon = ({ size = 20, color, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M2 6a2 2 0 0 1 2-2h3l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 2 6z"
      stroke={color}
      strokeWidth={strokeWidth}
    />
  </Svg>
);

/** Speech bubble, for helplines you text rather than call. */
export const MessageIcon = ({ size = 20, color, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z"
      stroke={color}
      strokeWidth={strokeWidth}
    />
  </Svg>
);

export const ShareIcon = ({ size = 17, color, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" stroke={color} strokeWidth={strokeWidth} />
    <Path d="M12 3v13M7 8l5-5 5 5" stroke={color} strokeWidth={strokeWidth} />
  </Svg>
);

export const GearIcon = ({ size = 16, color, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={strokeWidth} />
    <Path
      d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"
      stroke={color}
      strokeWidth={strokeWidth}
    />
  </Svg>
);

export const HomeIcon = ({ size = 20, color, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 11l9-8 9 8" stroke={color} strokeWidth={strokeWidth} />
    <Path d="M5 10v10h14V10" stroke={color} strokeWidth={strokeWidth} />
  </Svg>
);

export const FlameIcon = ({ size = 20, color, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 3c2 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-5 1 2 2 2 3 1z"
      stroke={color}
      strokeWidth={strokeWidth}
    />
  </Svg>
);

export const BarsIcon = ({ size = 20, color, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke={color} strokeWidth={strokeWidth} />
  </Svg>
);

export const UserIcon = ({ size = 20, color, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={strokeWidth} />
    <Path d="M4 21c0-4 4-6 8-6s8 2 8 6" stroke={color} strokeWidth={strokeWidth} />
  </Svg>
);
