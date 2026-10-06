export type SignedDirection = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';

type Tags = Record<string, string | undefined>;
export interface RoadWay {
  id: number;
  tags: Tags;
}
export interface RoadRelation {
  tags: Tags;
  members?: { type: string; ref: number; role?: string }[];
}

export function headingDifference(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

// Motorways are implicitly one-way unless explicitly tagged otherwise.
export function wayTravelDirection(tags: Tags): 1 | -1 | 0 {
  if (tags.oneway === '-1') return -1;
  if (['yes', '1', 'true'].includes(tags.oneway ?? '')) return 1;
  if (tags.oneway !== undefined) return 0;
  return tags.highway === 'motorway' || tags.junction === 'roundabout' ? 1 : 0;
}

function cardinal(value?: string): SignedDirection | null {
  const values: Record<string, SignedDirection> = {
    north: 'NORTH', south: 'SOUTH', east: 'EAST', west: 'WEST',
    n: 'NORTH', s: 'SOUTH', e: 'EAST', w: 'WEST',
  };
  return values[value?.trim().toLowerCase() ?? ''] ?? null;
}

const normalizeRef = (value: string) => value.toUpperCase().replace(/[\s-]/g, '');

function matchesRoute(displayRef: string, tags: Tags): boolean {
  const target = normalizeRef(displayRef.split(';')[0]);
  const network = tags.network?.toUpperCase();
  // OSM Interstate relations normally use ref=5 + network=US:I,
  // whereas the way uses ref=I 5. Never match US 5 to I 5.
  const prefix = network === 'US:I' ? 'I' : network === 'US:US' ? 'US' : '';
  if (/^I\d/.test(target) && network !== 'US:I') return false;
  if (/^US\d/.test(target) && network !== 'US:US') return false;
  return (tags.ref ?? '').split(';').some(ref => {
    const normalized = normalizeRef(ref);
    return normalized === target || (prefix !== '' && prefix + normalized === target);
  });
}

/** Resolve signed direction only when metadata also identifies travel orientation.
 * Geometry decides forward/backward on the way, never north/east on the shield.
 */
export function resolveSignedDirection(
  way: RoadWay,
  relations: RoadRelation[],
  displayRef: string | null,
  segmentBearing: number,
  carBearing: number,
): SignedDirection | null {
  if (!displayRef) return null;
  const forward = headingDifference(segmentBearing, carBearing) <= 35;
  const backward = headingDifference(segmentBearing + 180, carBearing) <= 35;
  if (!forward && !backward) return null;
  const oneWay = wayTravelDirection(way.tags);
  if ((oneWay === 1 && !forward) || (oneWay === -1 && !backward)) return null;

  const directions = new Set<SignedDirection>();
  for (const relation of relations) {
    if (relation.tags.type !== 'route' || relation.tags.route !== 'road'
      || !matchesRoute(displayRef, relation.tags)) continue;
    for (const member of relation.members ?? []) {
      if (member.type !== 'way' || member.ref !== way.id) continue;
      const role = member.role?.trim().toLowerCase() ?? '';
      if (role === 'forward' && !forward) continue;
      if (role === 'backward' && !backward) continue;
      // A cardinal role on a two-way road does not tell us which side it applies to.
      if (oneWay === 0 && role !== 'forward' && role !== 'backward') continue;
      if (role && role !== 'forward' && role !== 'backward' && !cardinal(role)) continue;
      const roleDirection = cardinal(role);
      const relationDirection = cardinal(relation.tags.direction);
      if (roleDirection) directions.add(roleDirection);
      if (relationDirection) directions.add(relationDirection);
    }
  }
  return directions.size === 1 ? [...directions][0] : null;
}
