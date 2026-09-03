import { SymbolView, SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { StyleProp, ViewStyle } from 'react-native';

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
  | 'location.fill';

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = 'regular',
}: {
  name: IconSymbolName;
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  const sfName = name === 'photo.on.rectangle.fill' ? 'photo.fill.on.rectangle.fill' : name;
  return (
    <SymbolView
      weight={weight}
      tintColor={color}
      resizeMode="scaleAspectFit"
      name={sfName}
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}
