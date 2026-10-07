import { WorkerProfile, Requirement } from '../types';

export interface WorkerCluster {
  lat: number;
  lng: number;
  count: number;
  workers: WorkerProfile[];
}

export interface RequirementCluster {
  lat: number;
  lng: number;
  count: number;
  requirements: Requirement[];
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface ClusterOptions {
  bounds?:
    | MapBounds
    | {
        getNorth: () => number;
        getSouth: () => number;
        getEast: () => number;
        getWest: () => number;
      };
  zoom: number;
  gridDegrees?: number;
}

/**
 * Service to calculate real-worker density clustering based on map view bounds and zoom level.
 */
export const MapService = {
  /**
   * Determine geographic grid resolution in degrees based on map zoom level.
   * - zoom < 8 (Far / National view): broader clusters (~1.8° to 2.5° grid)
   * - 8 <= zoom < 12 (State / District view): medium localized clusters (~0.4° to 0.8° grid)
   * - zoom >= 12 (Local area): fine localized grid (~0.15° grid)
   */
  getGridDegreesForZoom(zoom: number): number {
    if (zoom < 6) return 2.5;
    if (zoom < 8) return 1.8;
    if (zoom < 10) return 0.8;
    if (zoom < 12) return 0.45;
    return 0.15;
  },

  /**
   * Clusters real worker locations based on the current map view bounds and zoom level.
   * Filters workers to visible map bounds (if provided) and groups them into
   * geographically deterministic clusters for density-based rendering.
   *
   * @param workers - Array of real worker profiles with valid coordinates
   * @param options - Map zoom level, optional viewport bounds, and optional custom grid size
   * @returns Array of clustered worker groups with mean coordinates and worker counts
   */
  clusterWorkersByBoundsAndZoom(
    workers: WorkerProfile[],
    options: ClusterOptions
  ): WorkerCluster[] {
    const { zoom, bounds, gridDegrees: customGrid } = options;
    const gridDegrees = customGrid ?? this.getGridDegreesForZoom(zoom);

    // Extract bounding box if bounds object provided
    let minLat = -90;
    let maxLat = 90;
    let minLng = -180;
    let maxLng = 180;
    let hasBounds = false;

    if (bounds) {
      if ('getSouth' in bounds && typeof bounds.getSouth === 'function') {
        minLat = bounds.getSouth();
        maxLat = bounds.getNorth();
        minLng = bounds.getWest();
        maxLng = bounds.getEast();
        hasBounds = true;
      } else if ('south' in bounds && typeof bounds.south === 'number') {
        minLat = bounds.south;
        maxLat = bounds.north;
        minLng = bounds.west;
        maxLng = bounds.east;
        hasBounds = true;
      }
    }

    const grid: Record<string, { sumLat: number; sumLng: number; workers: WorkerProfile[] }> = {};

    workers.forEach((worker) => {
      const lat = Number(worker.location?.latitude);
      const lng = Number(worker.location?.longitude);

      if (!lat || !lng || isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
        return;
      }

      // Viewport-aware filter with small outer buffer so edge markers don't clip abruptly
      if (hasBounds) {
        const buffer = gridDegrees * 0.5;
        if (
          lat < minLat - buffer ||
          lat > maxLat + buffer ||
          lng < minLng - buffer ||
          lng > maxLng + buffer
        ) {
          return;
        }
      }

      const cellX = Math.floor(lng / gridDegrees);
      const cellY = Math.floor(lat / gridDegrees);
      const key = `${cellY}_${cellX}`;

      if (!grid[key]) {
        grid[key] = { sumLat: 0, sumLng: 0, workers: [] };
      }

      grid[key].sumLat += lat;
      grid[key].sumLng += lng;
      grid[key].workers.push(worker);
    });

    return Object.values(grid).map((item) => ({
      lat: item.sumLat / item.workers.length,
      lng: item.sumLng / item.workers.length,
      count: item.workers.length,
      workers: item.workers,
    }));
  },

  /**
   * Clusters real requirement locations based on the current map view bounds and zoom level.
   */
  clusterRequirementsByBoundsAndZoom(
    requirements: Requirement[],
    options: ClusterOptions
  ): RequirementCluster[] {
    const { zoom, bounds, gridDegrees: customGrid } = options;
    const gridDegrees = customGrid ?? this.getGridDegreesForZoom(zoom);

    let minLat = -90;
    let maxLat = 90;
    let minLng = -180;
    let maxLng = 180;
    let hasBounds = false;

    if (bounds) {
      if ('getSouth' in bounds && typeof bounds.getSouth === 'function') {
        minLat = bounds.getSouth();
        maxLat = bounds.getNorth();
        minLng = bounds.getWest();
        maxLng = bounds.getEast();
        hasBounds = true;
      } else if ('south' in bounds && typeof bounds.south === 'number') {
        minLat = bounds.south;
        maxLat = bounds.north;
        minLng = bounds.west;
        maxLng = bounds.east;
        hasBounds = true;
      }
    }

    const grid: Record<string, { sumLat: number; sumLng: number; requirements: Requirement[] }> = {};

    requirements.forEach((req) => {
      const lat = Number(req.latitude);
      const lng = Number(req.longitude);

      if (!lat || !lng || isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
        return;
      }

      if (hasBounds) {
        const buffer = gridDegrees * 0.5;
        if (
          lat < minLat - buffer ||
          lat > maxLat + buffer ||
          lng < minLng - buffer ||
          lng > maxLng + buffer
        ) {
          return;
        }
      }

      const cellX = Math.floor(lng / gridDegrees);
      const cellY = Math.floor(lat / gridDegrees);
      const key = `${cellY}_${cellX}`;

      if (!grid[key]) {
        grid[key] = { sumLat: 0, sumLng: 0, requirements: [] };
      }

      grid[key].sumLat += lat;
      grid[key].sumLng += lng;
      grid[key].requirements.push(req);
    });

    return Object.values(grid).map((item) => ({
      lat: item.sumLat / item.requirements.length,
      lng: item.sumLng / item.requirements.length,
      count: item.requirements.length,
      requirements: item.requirements,
    }));
  },
};
