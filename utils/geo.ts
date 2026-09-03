import { USER_CONFIG } from "../constants/UserRoles";

export interface LocationOffEvent {
  id: string;
  date: string;
  startTime: number;
  endTime: number | null;
  startLocation: { lat: number; lon: number } | null;
  endLocation: { lat: number; lon: number } | null;
  durationMs: number | null;
  footprintsCount: number;
}

export interface DateGroupedEvents {
  date: string;
  events: LocationOffEvent[];
  totalDurationMs: number;
  count: number;
}

export const getDistanceFromLatLonInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const checkSiteProximity = (lat: number, lon: number, sites: any[]) => {
  return sites.find(site => getDistanceFromLatLonInMeters(lat, lon, site.lat, site.lon) <= site.radius);
};

export const getLocationLabel = (lat: number | null, lon: number | null) => {
  if (lat === null || lon === null) {
    return "Unknown Location";
  }
  const site = checkSiteProximity(lat, lon, USER_CONFIG.sites);
  if (site) {
    return `${site.name} (Within ${site.radius}m)`;
  }
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
};

export const groupLocationOffEvents = (locationHistory: any[]): LocationOffEvent[] => {
  // Sort history by timestamp ascending
  const sorted = [...locationHistory].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  
  const events: LocationOffEvent[] = [];
  let currentEvent: {
    startTime: number;
    footprints: any[];
    startLocation: { lat: number; lon: number } | null;
  } | null = null;
  
  let lastKnownLocation: { lat: number; lon: number } | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const pt = sorted[i];
    const isOff = pt.locationEnabled === false || pt.latitude === null || pt.longitude === null;

    if (isOff) {
      if (!currentEvent) {
        // Start of a new turn-off period
        currentEvent = {
          startTime: Number(pt.timestamp),
          footprints: [pt],
          startLocation: lastKnownLocation,
        };
      } else {
        // Continue current turn-off period
        currentEvent.footprints.push(pt);
      }
    } else {
      // Location is ON
      lastKnownLocation = { lat: pt.latitude, lon: pt.longitude };
      
      if (currentEvent) {
        // Just transitioned from OFF to ON: close the event
        const endTime = Number(pt.timestamp);
        const endLocation = { lat: pt.latitude, lon: pt.longitude };
        const durationMs = endTime - currentEvent.startTime;
        
        // Use the date from the first footprint of the turn-off period
        const eventDate = currentEvent.footprints[0]?.date || pt.date;

        events.push({
          id: `off-event-${currentEvent.startTime}`,
          date: eventDate,
          startTime: currentEvent.startTime,
          endTime: endTime,
          startLocation: currentEvent.startLocation,
          endLocation: endLocation,
          durationMs: durationMs,
          footprintsCount: currentEvent.footprints.length
        });
        
        currentEvent = null;
      }
    }
  }

  // If the last record was OFF, the period is still active
  if (currentEvent) {
    const lastPt = currentEvent.footprints[currentEvent.footprints.length - 1];
    const eventDate = currentEvent.footprints[0]?.date || lastPt.date;
    
    events.push({
      id: `off-event-${currentEvent.startTime}`,
      date: eventDate,
      startTime: currentEvent.startTime,
      endTime: null, // Still OFF
      startLocation: currentEvent.startLocation,
      endLocation: null,
      durationMs: null,
      footprintsCount: currentEvent.footprints.length
    });
  }

  return events;
};

export const groupEventsByDate = (events: LocationOffEvent[]): DateGroupedEvents[] => {
  const groups: { [date: string]: LocationOffEvent[] } = {};
  
  events.forEach(event => {
    if (!groups[event.date]) {
      groups[event.date] = [];
    }
    groups[event.date].push(event);
  });
  
  return Object.keys(groups).map(date => {
    const dateEvents = groups[date];
    let totalDurationMs = 0;
    
    dateEvents.forEach(e => {
      if (e.durationMs !== null) {
        totalDurationMs += e.durationMs;
      }
    });
    
    return {
      date,
      events: dateEvents.sort((a, b) => b.startTime - a.startTime), // Sort events within date descending
      totalDurationMs,
      count: dateEvents.length
    };
  }).sort((a, b) => b.date.localeCompare(a.date)); // Sort dates descending
};