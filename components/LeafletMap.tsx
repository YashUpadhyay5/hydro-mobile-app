import React, { useRef, useMemo, useEffect } from 'react';
import { View, Platform, StyleProp, ViewStyle } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

export interface MarkerData {
  latitude: number;
  longitude: number;
  title?: string;
  color?: string; // Standard HTML color (e.g. 'red', '#ff0000')
  opacity?: number;
  emoji?: string;
}

export interface CircleData {
  latitude: number;
  longitude: number;
  radius: number;
  color?: string;
}

export interface PolylineData {
  points: { latitude: number; longitude: number }[];
  color?: string;
  weight?: number;
}

export interface LeafletMapProps {
  initialRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta?: number;
    longitudeDelta?: number;
  };
  markers?: MarkerData[];
  circles?: CircleData[];
  polylines?: PolylineData[];
  onMapPress?: (coordinate: { latitude: number; longitude: number }) => void;
  style?: StyleProp<ViewStyle>;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  initialRegion = { latitude: 28.6692, longitude: 77.4538, latitudeDelta: 0.1, longitudeDelta: 0.1 },
  markers = [],
  circles = [],
  polylines = [],
  onMapPress,
  style
}) => {
  const webViewRef = useRef<WebView>(null);

  const htmlDependencies = Platform.OS === 'web' ? [initialRegion, markers, circles, polylines] : [];

  const htmlContent = useMemo(() => {
    const zoom = initialRegion.latitudeDelta && initialRegion.latitudeDelta < 0.05 ? 15 : 13;
    const initialData = JSON.stringify({ initialRegion, markers, circles, polylines });
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
        <style>
          body { padding: 0; margin: 0; }
          html, body, #map { height: 100%; width: 100vw; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map').setView([${initialRegion.latitude}, ${initialRegion.longitude}], ${zoom});
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 19,
              attribution: '© OpenStreetMap'
          }).addTo(map);

          var layerGroup = L.layerGroup().addTo(map);

          window.updateMapData = function(dataStr) {
            try {
              var data = JSON.parse(dataStr);
              layerGroup.clearLayers();

              if (data.initialRegion) {
                var z = data.initialRegion.latitudeDelta && data.initialRegion.latitudeDelta < 0.05 ? 15 : 13;
                map.flyTo([data.initialRegion.latitude, data.initialRegion.longitude], z);
              }

              if (data.polylines) {
                data.polylines.forEach(function(p) {
                  var latlngs = p.points.map(function(pt) { return [pt.latitude, pt.longitude]; });
                  L.polyline(latlngs, {color: p.color || 'blue', weight: p.weight || 3}).addTo(layerGroup);
                });
              }

              if (data.circles) {
                data.circles.forEach(function(c) {
                  L.circle([c.latitude, c.longitude], {
                    color: c.color || 'blue',
                    fillColor: c.color || 'blue',
                    fillOpacity: 0.2,
                    radius: c.radius
                  }).addTo(layerGroup);
                });
              }

              if (data.markers) {
                data.markers.forEach(function(m, index) {
                  var options = {};
                  if (m.emoji) {
                    var htmlStr = '<div style="font-size:24px; text-align:center; display:flex; justify-content:center; align-items:center;">' + m.emoji + '</div>';
                    options.icon = L.divIcon({ className: 'custom-div-icon', html: htmlStr, iconSize: [30, 30], iconAnchor: [15, 15] });
                  } else if (m.color) {
                    var op = m.opacity !== undefined ? m.opacity : 1;
                    var htmlStr = '<div style="background-color:' + m.color + '; width:20px; height:20px; border-radius:50%; border: 2px solid white; opacity: ' + op + '; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>';
                    options.icon = L.divIcon({ className: 'custom-div-icon', html: htmlStr, iconSize: [24, 24], iconAnchor: [12, 12] });
                  } else if (m.opacity !== undefined && m.opacity < 1) {
                    options.opacity = m.opacity;
                  }
                  var marker = L.marker([m.latitude, m.longitude], options).addTo(layerGroup);
                  if (m.title) {
                    var safeTitle = m.title.replace(/'/g, "\\\\'");
                    marker.bindPopup(safeTitle);
                  }
                });
              }
            } catch(e) { console.error("Error updating map", e); }
          };

          // Load initial data
          window.updateMapData(${JSON.stringify(initialData)});

          map.on('click', function(e) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                event: 'mapPress',
                coordinate: { latitude: e.latlng.lat, longitude: e.latlng.lng }
              }));
            }
          });
        </script>
      </body>
      </html>
    `;
  }, htmlDependencies);

  useEffect(() => {
    if (Platform.OS !== 'web' && webViewRef.current) {
      const dataStr = JSON.stringify({
        initialRegion,
        markers,
        circles,
        polylines
      });
      const injectedJS = `if (window.updateMapData) { window.updateMapData(${JSON.stringify(dataStr)}); } true;`;
      webViewRef.current.injectJavaScript(injectedJS);
    }
  }, [initialRegion, markers, circles, polylines]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.event === 'mapPress' && onMapPress) {
        onMapPress(data.coordinate);
      }
    } catch (e) {
      console.warn('Failed to parse WebView message', e);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <View style={style || { flex: 1 }}>
         <iframe
          srcDoc={htmlContent}
          style={{ width: '100%', height: '100%', border: 'none' } as React.CSSProperties}
          title="Leaflet Map"
        />
      </View>
    );
  }

  return (
    <View style={style || { flex: 1 }}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        onMessage={onMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        scrollEnabled={false}
      />
    </View>
  );
};
