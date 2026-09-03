const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withCellularTracker(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const manifest = androidManifest.manifest;
    const application = manifest.application[0];

    // Add permissions
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }
    const permissionsToAdd = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.READ_PHONE_STATE',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.INTERNET',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION'
    ];
    permissionsToAdd.forEach((perm) => {
      const exists = manifest['uses-permission'].some(
        (p) => p.$['android:name'] === perm
      );
      if (!exists) {
        manifest['uses-permission'].push({
          $: { 'android:name': perm },
        });
      }
    });

    // Add service to application
    if (!application.service) {
      application.service = [];
    }
    const serviceName = 'cellular.tracker.LocationTrackingService';
    const serviceExists = application.service.some(
      (s) => s.$['android:name'] === serviceName
    );
    if (!serviceExists) {
      application.service.push({
        $: {
          'android:name': serviceName,
          'android:foregroundServiceType': 'location',
          'android:exported': 'false',
        },
      });
    }

    return config;
  });
};
