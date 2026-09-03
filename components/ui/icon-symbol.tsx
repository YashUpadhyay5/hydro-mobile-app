// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';


/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
export type IconSymbolName =
  | 'house.fill'
  | 'paperplane.fill'
  | 'chevron.left.forwardslash.chevron.right'
  | 'chevron.right'
  | 'chevron.left'
  | 'camera.fill'
  | 'photo.on.rectangle.fill'
  | 'creditcard.fill'
  | 'calendar.badge.plus'
  | 'doc.text.fill'
  | 'plus'
  | 'person.fill.badge.plus'
  | 'trash.fill'
  | 'location.fill'
  | 'photo.fill'
  | 'tablecells.fill'
  | 'archivebox.fill'
  | 'doc.fill'
  | 'xmark.circle.fill'
  | 'xmark'
  | 'arrow.down.circle.fill'
  | 'arrowshape.turn.up.left.fill'
  | 'doc.on.doc.fill'
  | 'person.2.fill'
  | 'clock.arrow.circlepath';

const MAPPING: Record<IconSymbolName, ComponentProps<typeof MaterialIcons>['name']> = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'camera.fill': 'photo-camera',
  'photo.on.rectangle.fill': 'photo-library',
  'creditcard.fill': 'credit-card',
  'calendar.badge.plus': 'calendar-today',
  'doc.text.fill': 'description',
  'plus': 'add',
  'person.fill.badge.plus': 'person-add',
  'trash.fill': 'delete',
  'location.fill': 'location-on',
  'photo.fill': 'image',
  'tablecells.fill': 'table-chart',
  'archivebox.fill': 'archive',
  'doc.fill': 'insert-drive-file',
  'xmark.circle.fill': 'cancel',
  'xmark': 'close',
  'arrow.down.circle.fill': 'file-download',
  'arrowshape.turn.up.left.fill': 'reply',
  'doc.on.doc.fill': 'content-copy',
  'person.2.fill': 'people',
  'clock.arrow.circlepath': 'history',
};

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
