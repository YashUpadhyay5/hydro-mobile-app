import React from 'react';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

// 1. Camera SVG Icon (Geotagged Attendance Camera)
export function CameraSvgIcon({ size = 32, color = '#007AFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="6" width="20" height="14" rx="4" fill={color} fillOpacity={0.15} />
      <Path
        d="M23 19V7C23 5.89543 22.1046 5 21 5H16.8284C16.298 5 15.7893 4.78929 15.4142 4.41421L14.5858 3.58579C14.2107 3.21071 13.702 3 13.1716 3H10.8284C10.298 3 9.78929 3.21071 9.41421 3.58579L8.58579 4.41421C8.21071 4.78929 7.70201 5 7.17157 5H3C1.89543 5 1 5.89543 1 7V19C1 20.1046 1.89543 21 3 21H21C22.1046 21 23 20.1046 23 19Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="13" r="4" stroke={color} strokeWidth="2" />
      <Circle cx="12" cy="13" r="1.5" fill={color} />
      <Circle cx="18" cy="8.5" r="1" fill={color} />
    </Svg>
  );
}

// 2. Chat SVG Icon (Enterprise Employee Chat)
export function ChatSvgIcon({ size = 32, color = '#10b981' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 11.5C21 15.6421 17.1995 19 12.5 19C11.1645 19 9.90797 18.7279 8.8 18.2393L4 19.5L5.43202 15.9189C4.52737 14.6548 4 13.1368 4 11.5C4 7.35786 7.80051 4 12.5 4C17.1995 4 21 7.35786 21 11.5Z"
        fill={color}
        fillOpacity={0.15}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M8 11H16" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Path d="M8 14H13" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Circle cx="18.5" cy="5.5" r="3" fill="#10b981" />
    </Svg>
  );
}

// 3. Bottom Navigation Communication Tab SVG Icon
export function CommunicationTabSvgIcon({ size = 26, color = '#007AFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z"
        fill={color}
        fillOpacity={0.2}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M7 8H17" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Path d="M7 12H13" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Circle cx="18" cy="5" r="2.5" fill="#10b981" />
    </Svg>
  );
}

// 4. Video Meeting SVG Icon (Enterprise HD Video & Calls)
export function VideoMeetingSvgIcon({ size = 32, color = '#6366f1' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="5" width="14" height="14" rx="3" fill={color} fillOpacity={0.15} stroke={color} strokeWidth="2" />
      <Path
        d="M16 10L21.3033 6.46447C21.8492 6.10054 22.5 6.49132 22.5 7.14321V16.8568C22.5 17.5087 21.8492 17.8995 21.3033 17.5355L16 14"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="9" cy="12" r="2.5" stroke={color} strokeWidth="1.5" />
    </Svg>
  );
}

// 5. Back Arrow SVG Icon
export function BackArrowSvgIcon({ size = 24, color = '#007AFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 18L9 12L15 6"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 6. Search SVG Icon
export function SearchSvgIcon({ size = 18, color = '#94a3b8' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="7" stroke={color} strokeWidth="2" />
      <Path d="M20 20L16 16" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

// 7. Send Paper Plane SVG Icon
export function SendSvgIcon({ size = 18, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22 2L11 13"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M22 2L15 22L11 13L2 9L22 2Z"
        fill={color}
        fillOpacity={0.2}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 8. Paperclip Attachment SVG Icon
export function AttachmentSvgIcon({ size = 22, color = '#007AFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21.4354 11.0623L12.243 20.2547C9.90001 22.5977 6.10001 22.5977 3.75701 20.2547C1.41401 17.9117 1.41401 14.1117 3.75701 11.7687L12.9494 2.57626C14.512 1.01366 17.045 1.01366 18.6076 2.57626C20.1702 4.13886 20.1702 6.67186 18.6076 8.23446L9.41521 17.4269C8.63401 18.2081 7.36701 18.2081 6.58581 17.4269C5.80461 16.6457 5.80461 15.3787 6.58581 14.5975L15.071 6.11226"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 9. Double Tick SVG Icon (Read/Delivered Status)
export function DoubleTickSvgIcon({ size = 16, color = '#94a3b8' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12.5 7.5L21.5 16.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// 10. Calendar SVG Icon (Month & Year Selector)
export function CalendarSvgIcon({ size = 24, color = '#6366f1' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="18" rx="4" fill={color} fillOpacity={0.12} stroke={color} strokeWidth="2" />
      <Path d="M16 2V6" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Path d="M8 2V6" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Path d="M3 9H21" stroke={color} strokeWidth="2" />
      <Circle cx="8" cy="13" r="1.2" fill={color} />
      <Circle cx="12" cy="13" r="1.2" fill={color} />
      <Circle cx="16" cy="13" r="1.2" fill={color} />
      <Circle cx="8" cy="17" r="1.2" fill={color} />
      <Circle cx="12" cy="17" r="1.2" fill={color} />
      <Circle cx="16" cy="17" r="1.2" fill={color} />
    </Svg>
  );
}
