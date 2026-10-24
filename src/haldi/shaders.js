import { NOISE_GLSL } from "../lib/gl.js";

// Painted morning sky: blue overhead easing into cream haze at the horizon, with soft
// watercolour cumulus drifting across in three depths.
export const SKY_FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uScale;   // canvas px per painting px
uniform float uHorizon; // canvas y of the painted horizon, from the top
${NOISE_GLSL}

float cloudField(vec2 p, float t) {
  vec2 warp = vec2(fbm(p + vec2(0.0, t * 0.010)), fbm(p * 1.3 + vec2(3.1, 7.7) - vec2(0.0, t * 0.008)));
  return fbm(p + 1.4 * warp);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = px / uScale;
  float h = clamp(px.y / max(uHorizon, 1.0), 0.0, 1.0);

  vec3 overhead = vec3(0.52, 0.72, 0.90);
  vec3 middle = vec3(0.70, 0.83, 0.92);
  vec3 haze = vec3(0.96, 0.92, 0.84);
  vec3 col = mix(overhead, middle, smoothstep(0.0, 0.55, h));
  col = mix(col, haze, smoothstep(0.5, 1.0, h));

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float size = 380.0 - fi * 85.0;
    float drift = uTime * (12.0 + fi * 7.0);
    vec2 cp = (p + vec2(drift, fi * 211.0)) / size * vec2(1.0, 2.15);
    float d = cloudField(cp, uTime);
    float cover = 0.66 - 0.10 * h - fi * 0.02;
    float body = smoothstep(cover, cover + 0.12, d);
    float above = cloudField(cp + vec2(0.0, -0.10), uTime);
    float lit = clamp((d - above) * 5.0 + 0.55, 0.0, 1.0);
    vec3 shade = mix(vec3(0.82, 0.85, 0.90), vec3(0.93, 0.90, 0.86), h);
    vec3 cloud = mix(shade, vec3(1.0, 0.98, 0.94), lit);
    float rim = smoothstep(cover, cover + 0.03, d) - smoothstep(cover + 0.03, cover + 0.10, d);
    cloud *= 1.0 - rim * 0.04;
    col = mix(col, cloud, body * (0.62 + fi * 0.08));
  }

  float grain = noise(px * 0.9) - 0.5;
  float fibre = fbm(p * vec2(0.05, 0.012)) - 0.5;
  col += grain * 0.025 + fibre * 0.03;
  gl_FragColor = vec4(col, 1.0);
}
`;
