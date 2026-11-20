/**
 * props.ts: the scene's props as three.js meshes, for the live stage and for
 * the reflection bake. A prop is a Principled BSDF at factory settings but
 * for base colour and roughness, so a dielectric: a MeshStandardNodeMaterial.
 * Meshes sit under a Blender root group: `toWorld` is the matrix, no axis swap.
 */
import {
  Box3, BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshStandardNodeMaterial, Sphere, Vector3,
} from "three/webgpu";
import type { PropGeometry, PropItem } from "../scene";

/** GPU geometry over the prop's own arrays: three keeps references, never copies. Normals are the scene's, one per corner. */
export function propGeometry(g: PropGeometry): BufferGeometry {
  const out = new BufferGeometry();
  out.setAttribute("position", new BufferAttribute(g.positions, 3));
  out.setAttribute("normal", new BufferAttribute(g.normals, 3));
  out.setIndex(new BufferAttribute(g.index, 1));
  out.boundingBox = new Box3(new Vector3(...g.bounds.min), new Vector3(...g.bounds.max));
  out.boundingSphere = out.boundingBox.getBoundingSphere(new Sphere());
  return out;
}

/** Two-sided, since a plane is one-sided geometry. The caller adds the world's ambient light with `envNode`. */
export function propMaterial(p: PropItem): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: p.roughness, metalness: 0, side: DoubleSide });
  m.color.setRGB(p.albedo[0], p.albedo[1], p.albedo[2]);
  return m;
}

export function propMesh(p: PropItem, geometry: BufferGeometry, material: MeshStandardNodeMaterial): Mesh<BufferGeometry, MeshStandardNodeMaterial> {
  const mesh = new Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.fromArray(p.toWorld);
  mesh.matrixWorldNeedsUpdate = true;
  return mesh;
}
