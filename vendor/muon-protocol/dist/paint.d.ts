import type { FacetPaint, ObjectPaint } from './ops.ts';
/** The kinds of painting, in the order a host reports problems. */
export declare const PAINT_KINDS: readonly (keyof ObjectPaint)[];
/** The highest state each kind's codes may hold: enforce 1 and block 2; fuzzy skin 1; filaments 1-32. */
export declare const PAINT_MAX_STATE: Readonly<Record<keyof ObjectPaint, number>>;
/** What checkFacetPaint found wrong: the end of a sentence about one kind's paint, and the triangle concerned. */
export interface FacetPaintProblem {
    /** E.g. "of triangle 1204 is not a valid code" (follows "the seam paint"). */
    message: string;
    /** The mesh triangle the problem is on, when it is on one. */
    triangle?: number;
}
/** A kind's problem on a named object: the kind, and the sentence a BadRequest carries. */
export interface ObjectPaintProblem {
    kind: keyof ObjectPaint;
    /** E.g. 'Cube.stl: the seam paint of triangle 1204 is not a valid code.' */
    message: string;
    triangle?: number;
}
/**
 * The highest state in a code (`code.slice(start, end)`), or -1 when it is not exactly one tree of uppercase
 * hexadecimal digits: a digit outside 0-9 A-F (lowercase included), a split node whose special corner is 3, a
 * tree that ends before its last child (truncated), or digits left over to the left of the tree (trailing).
 */
export declare function paintCodeMaxState(code: string, start?: number, end?: number): number;
/**
 * Checks one kind of paint against the mesh it is for (`triangleCount` triangles): the three fields and their
 * types, as many ends as triangles, triangles strictly ascending and on the mesh, ends ascending and the last at
 * the end of `codes`, and each code exactly one tree of uppercase hexadecimal digits with no state above
 * `maxState` (PAINT_MAX_STATE of its kind). Null when it is well formed.
 */
export declare function checkFacetPaint(paint: FacetPaint, triangleCount: number, maxState?: number): FacetPaintProblem | null;
/**
 * Checks PlateObject.paint for an object named `name` whose mesh has `triangleCount` triangles: it must be an
 * object, and each kind it holds must pass checkFacetPaint with that kind's highest state. Keys that are not a
 * kind are ignored (a later protocol may add kinds). Null when it is well formed.
 */
export declare function checkObjectPaint(paint: ObjectPaint, triangleCount: number, name: string): ObjectPaintProblem | null;
/** True when `paint` holds at least one kind (even an empty one): the object then takes the painted path. */
export declare function hasPaintKinds(paint: ObjectPaint | undefined): boolean;
