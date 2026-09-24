// Shared GLSL snippets.

export const GLSL_NOISE = /* glsl */ `
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = r * p; a *= 0.5; }
    return v;
  }
`;

// Signed distance to an arch: a rectangle with a semicircular top.
// hs = (half width, half height), centred on the origin.
export const GLSL_ARCH = /* glsl */ `
  float sdArch(vec2 p, vec2 hs) {
    float r = hs.x;
    float cy = hs.y - r;
    if (p.y > cy) return length(p - vec2(0.0, cy)) - r;
    vec2 d = vec2(abs(p.x) - r, -hs.y - p.y);
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }
`;
