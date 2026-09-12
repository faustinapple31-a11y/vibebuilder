import { describe, expect, it } from "vitest";
import { computeBaseRadius, computeBounds, eulerFromXAxis, eulerFromYAxis, eulerXYZToMatrix, mat3Apply, mat3Mul, matrixToEulerXYZ, rotY, type Part, type Vec3 } from "../src";

const close = (a: Vec3, b: Vec3, eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]!) < eps);

describe("rotation helpers", () => {
  it("round-trips Euler XYZ through a matrix", () => {
    for (const e of [[10, 20, 30], [-45, 80, 5], [120, -30, -170], [0, 0, 90], [33, 0, 0]] as Vec3[]) {
      const m = eulerXYZToMatrix(e);
      const back = eulerXYZToMatrix(matrixToEulerXYZ(m));
      expect(m.every((v, i) => Math.abs(v - back[i]!) < 1e-6)).toBe(true);
    }
  });
  it("eulerFromYAxis maps local +Y onto the direction", () => {
    for (const d of [[1, 0, 0], [0, 0, 1], [0.3, 0.9, -0.2], [-1, -1, 0.5], [0, -1, 0]] as Vec3[]) {
      const len = Math.hypot(...d);
      const m = eulerXYZToMatrix(eulerFromYAxis(d));
      expect(close(mat3Apply(m, [0, 1, 0]), [d[0] / len, d[1] / len, d[2] / len])).toBe(true);
    }
  });
  it("eulerFromXAxis maps local +X onto the direction", () => {
    for (const d of [[1, 0, 0], [0, 0, 1], [0.3, 0.9, -0.2], [-1, -1, 0.5], [0, 1, 0]] as Vec3[]) {
      const len = Math.hypot(...d);
      const m = eulerXYZToMatrix(eulerFromXAxis(d));
      expect(close(mat3Apply(m, [1, 0, 0]), [d[0] / len, d[1] / len, d[2] / len])).toBe(true);
    }
  });
  it("Ry composition matches matrix product", () => {
    const e: Vec3 = [25, 40, -60];
    const composed = matrixToEulerXYZ(mat3Mul(rotY(70), eulerXYZToMatrix(e)));
    const a = mat3Apply(eulerXYZToMatrix(composed), [1, 2, 3]);
    const b = mat3Apply(rotY(70), mat3Apply(eulerXYZToMatrix(e), [1, 2, 3]));
    expect(close(a, b)).toBe(true);
  });
});

describe("bounds", () => {
  it("uses exact rotated corners", () => {
    const p: Part = { shape: "box", position: [0, 5, 0], size: [10, 2, 2], rotation: [0, 0, 90], color: "#fff", material: "Plastic" };
    const b = computeBounds([p]);
    expect(b.min[1]).toBeCloseTo(0, 5);
    expect(b.max[1]).toBeCloseTo(10, 5);
    expect(b.max[0]).toBeCloseTo(1, 5);
  });
  it("base radius only counts parts touching the ground", () => {
    const trunk: Part = { shape: "cylinder", position: [0, 5, 0], size: [2, 10, 2], rotation: [0, 0, 0], color: "#fff", material: "Plastic" };
    const canopy: Part = { shape: "box", position: [0, 14, 0], size: [16, 8, 16], rotation: [0, 0, 0], color: "#fff", material: "Plastic" };
    expect(computeBaseRadius([trunk, canopy])).toBeCloseTo(1, 5);
  });
});
