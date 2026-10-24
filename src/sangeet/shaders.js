import { NOISE_GLSL } from "../lib/gl.js";

const COMMON = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uIntro;
uniform vec3 uBall; // centre x, centre y, radius, in canvas pixels from the top-left
${NOISE_GLSL}

const float PI = 3.14159265;

vec2 pixel() {
  return vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
}

float ballSpin() {
  return uTime * 0.32;
}

vec3 palette(float r) {
  if (r < 0.38) return vec3(0.95, 0.72, 0.32);
  if (r < 0.55) return vec3(0.80, 0.50, 0.22);
  if (r < 0.66) return vec3(0.88, 0.48, 0.56);
  if (r < 0.90) return vec3(1.0, 0.91, 0.70);
  return vec3(0.42, 0.27, 0.14);
}
`;

export const BACKDROP_FRAGMENT = `
${COMMON}

vec3 seaBackground(vec2 p) {
  vec2 uv = p / uRes;
  float scale = min(uRes.x, uRes.y);
  vec2 q = p / scale;

  vec3 deep = vec3(0.027, 0.098, 0.153);
  vec3 sea = vec3(0.055, 0.180, 0.247);
  vec3 lift = vec3(0.094, 0.275, 0.333);

  float toBall = length((p - uBall.xy) / scale);
  vec3 col = mix(sea, deep, smoothstep(0.0, 1.0, uv.y * 0.8 + uv.x * -0.15 + 0.25));
  col = mix(col, lift, exp(-toBall * 1.6) * 0.55);

  float mottle = fbm(q * 2.2);
  col *= 0.86 + mottle * 0.28;

  float fibres = noise(vec2(q.x * 6.0, q.y * 140.0)) * noise(vec2(q.x * 90.0, q.y * 3.0));
  col += vec3(0.02, 0.025, 0.02) * smoothstep(0.6, 0.95, fibres);

  float speckle = hash(floor(p * 0.75));
  col += (speckle - 0.5) * 0.035;

  float scratchLine = noise(vec2(q.x * 3.0 + q.y * 0.6, q.y * 0.15) * vec2(40.0, 1.0));
  float scratchMask = step(0.82, noise(q * vec2(0.8, 3.0) + 4.0));
  col += vec3(0.07, 0.08, 0.07) * smoothstep(0.93, 0.99, scratchLine) * scratchMask;

  float wear = fbm(q * 9.0 + 30.0);
  col = mix(col, col * 1.25 + vec3(0.03, 0.04, 0.03), smoothstep(0.66, 0.8, wear) * 0.35);

  vec2 v = uv - 0.5;
  col *= 1.0 - dot(v, v) * 0.9;
  return col;
}

vec3 rays(vec2 p) {
  vec2 d = p - uBall.xy;
  float dist = length(d) / uBall.z;
  float ang = atan(d.y, d.x);
  float spin = ballSpin();

  float streaks = noise(vec2(ang * 7.0 + spin * 0.9, 0.5)) * 0.6
                + noise(vec2(ang * 19.0 - spin * 0.6, 3.5)) * 0.4;
  float beams = smoothstep(0.48, 0.85, streaks);
  vec2 favoured = normalize(vec2(-1.0, 0.85));
  float bias = smoothstep(-0.2, 0.95, dot(normalize(d), favoured));
  float falloff = exp(-dist * 0.22) * smoothstep(0.95, 1.5, dist);
  float pulse = 0.85 + 0.15 * sin(uTime * 0.7);

  vec3 warm = vec3(1.0, 0.86, 0.58);
  vec3 halo = vec3(1.0, 0.78, 0.5) * exp(-max(dist - 1.0, 0.0) * 2.4) * 0.55;
  return warm * beams * bias * falloff * 0.42 * pulse + halo;
}

vec3 bokeh(vec2 p) {
  vec3 acc = vec3(0.0);
  float scale = min(uRes.x, uRes.y);
  for (int i = 0; i < 22; i++) {
    float fi = float(i);
    vec2 seed = vec2(hash(vec2(fi, 1.3)), hash(vec2(fi, 7.9)));
    vec2 toward = mix(uBall.xy, vec2(uRes.x * 0.35, uRes.y * 0.75), seed.x);
    vec2 pos = toward + (seed - 0.5) * scale * vec2(0.55, 0.35);
    pos += vec2(sin(uTime * 0.11 + fi), cos(uTime * 0.09 + fi * 1.7)) * scale * 0.012;
    float radius = scale * mix(0.006, 0.02, hash(vec2(fi, 3.1)));
    float d = length(p - pos);
    float disc = smoothstep(radius, radius * 0.7, d);
    float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + seed.y) + fi * 2.1);
    vec3 tint = hash(vec2(fi, 5.5)) < 0.6 ? vec3(1.0, 0.86, 0.66) : vec3(0.98, 0.55, 0.62);
    acc += tint * disc * twinkle * 0.32;
  }
  return acc;
}

vec4 discoBall(vec2 p) {
  vec2 q = (p - uBall.xy) / uBall.z;
  float d2 = dot(q, q);
  if (d2 > 1.0) return vec4(0.0);

  vec3 n = vec3(q.x, -q.y, sqrt(1.0 - d2));
  float spin = ballSpin();
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.x, n.z) + spin;

  float rows = 26.0;
  float latT = (lat / PI + 0.5) * rows;
  float row = floor(latT);
  float latCentre = ((row + 0.5) / rows - 0.5) * PI;
  float cols = max(6.0, floor(cos(latCentre) * rows * 2.0 + 0.5));
  float lonT = (lon / (2.0 * PI)) * cols;
  float col = floor(lonT);
  vec2 cell = fract(vec2(lonT, latT));
  vec2 tile = vec2(mod(col, cols), row);

  float r = hash(tile + 0.37);
  float lonCentre = (col + 0.5) / cols * 2.0 * PI - spin;
  vec3 facet = vec3(cos(latCentre) * sin(lonCentre), sin(latCentre), cos(latCentre) * cos(lonCentre));
  facet = normalize(facet + (vec3(hash(tile + 1.1), hash(tile + 2.2), hash(tile + 3.3)) - 0.5) * 0.18);

  vec3 light = normalize(vec3(-0.55, 0.6, 0.75));
  float diffuse = 0.4 + 0.6 * max(dot(n, light), 0.0);
  vec3 mirrored = reflect(vec3(0.0, 0.0, -1.0), facet);
  float sky = smoothstep(-0.6, 0.9, mirrored.y);
  float env = mix(0.6, 1.25, sky) * (0.7 + 0.3 * hash(tile + 9.1));
  float spec = pow(max(dot(reflect(-light, facet), vec3(0.0, 0.0, 1.0)), 0.0), 70.0);
  float glare = exp(-length(q - vec2(-0.15, -0.2)) * 3.2);

  vec3 tileColour = palette(r) * env * diffuse;
  tileColour = mix(tileColour, vec3(1.0, 0.93, 0.78), glare * 0.55);
  tileColour += vec3(1.0, 0.95, 0.85) * spec * 2.2;
  tileColour += vec3(1.0, 0.92, 0.75) * step(0.988, hash(tile + floor(uTime * 4.0))) * 0.9;

  float edge = min(min(cell.x, 1.0 - cell.x), min(cell.y, 1.0 - cell.y));
  float grout = smoothstep(0.04, 0.1, edge);
  vec3 c = mix(vec3(0.16, 0.1, 0.06), tileColour, grout);

  c *= mix(0.6, 1.05, pow(n.z, 0.35));
  c += vec3(1.0, 0.85, 0.6) * pow(1.0 - n.z, 3.0) * 0.25;

  float alpha = smoothstep(1.0, 1.0 - 2.5 / uBall.z, sqrt(d2));
  return vec4(c, alpha);
}

void main() {
  vec2 p = pixel();
  vec3 col = seaBackground(p);
  col += (rays(p) + bokeh(p)) * uIntro;

  float onString = smoothstep(1.4, 0.4, abs(p.x - uBall.x)) * step(p.y, uBall.y - uBall.z * 0.98);
  col = mix(col, vec3(0.55, 0.47, 0.35), onString * 0.8);

  vec4 ball = discoBall(p);
  col = mix(col, ball.rgb, ball.a);

  gl_FragColor = vec4(col, 1.0);
}
`;

export const LIGHTS_FRAGMENT = `
${COMMON}
uniform float uDpr;

vec3 spotlight(vec2 p, float originX, float phase, float speed, vec3 tint) {
  vec2 origin = vec2(originX * uRes.x, -40.0 * uDpr);
  vec2 v = p - origin;
  float len = length(v);
  float angle = atan(v.x, v.y);
  float aim = sin(uTime * speed + phase) * 0.62;
  float width = 0.11;
  float diff = abs(angle - aim);

  float cone = smoothstep(width, width * 0.15, diff);
  float core = smoothstep(width * 0.4, 0.0, diff);
  float reach = exp(-len / (uRes.y * 0.95));
  float dust = 0.7 + 0.3 * fbm(p / (uRes.y * 0.18) + vec2(uTime * 0.04, -uTime * 0.02));
  float source = exp(-len / (60.0 * uDpr));

  return tint * ((cone * 0.26 + core * 0.16) * reach * dust + source * 0.9);
}

vec3 reflections(vec2 p) {
  vec2 d = p - uBall.xy;
  float dist = length(d);
  if (dist < uBall.z * 1.1) return vec3(0.0);

  float spin = ballSpin();
  float ang = atan(d.y, d.x);
  float logR = log(dist / uBall.z);
  float sectors = 46.0;
  float bands = 5.0;
  vec2 g = vec2((ang + spin) / (2.0 * PI) * sectors, logR * bands);
  vec2 cellId = floor(g);
  vec3 acc = vec3(0.0);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 id = cellId + vec2(float(x), float(y));
      id.x = mod(id.x, sectors);
      float present = hash(id + 4.2);
      if (present < 0.5) continue;
      vec2 jitter = vec2(hash(id + 1.7), hash(id + 8.3));
      vec2 polar = (id + 0.2 + jitter * 0.6);
      float a = polar.x / sectors * 2.0 * PI - spin;
      float r = exp(polar.y / bands) * uBall.z;
      vec2 centre = uBall.xy + vec2(cos(a), sin(a)) * r;
      float size = (2.5 + 5.5 * hash(id + 2.9)) * uDpr * (0.7 + r / uRes.y);
      float spot = smoothstep(size, size * 0.2, length(p - centre));
      float twinkle = 0.5 + 0.5 * sin(uTime * (1.5 + jitter.x * 2.0) + present * 30.0);
      vec3 tint = palette(hash(id + 6.1)) + 0.25;
      acc += tint * spot * twinkle;
    }
  }
  return acc * 0.55;
}

vec3 glints(vec2 p) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float cycle = uTime * 0.35 + hash(vec2(fi, 2.0)) * 10.0;
    float id = floor(cycle);
    float life = fract(cycle);
    float a = hash(vec2(fi, id)) * 2.0 * PI;
    float rr = sqrt(hash(vec2(id, fi + 5.0))) * 0.8;
    vec2 centre = uBall.xy + vec2(cos(a), sin(a)) * rr * uBall.z;
    vec2 d = abs(p - centre);
    float arm = uBall.z * 0.55 * sin(life * PI);
    float thin = 1.2 * uDpr;
    float star = exp(-d.x / thin) * exp(-d.y / max(arm, 1.0)) + exp(-d.y / thin) * exp(-d.x / max(arm, 1.0));
    star += exp(-length(d) / (4.0 * uDpr)) * 0.8;
    acc += vec3(1.0, 0.93, 0.78) * star * sin(life * PI);
  }
  return acc;
}

void main() {
  vec2 p = pixel();
  vec3 col = vec3(0.0);
  col += glints(p);
  col += spotlight(p, 0.12, 0.0, 0.16, vec3(1.0, 0.80, 0.30));
  col += spotlight(p, 0.38, 2.1, 0.12, vec3(1.0, 0.36, 0.64));
  col += spotlight(p, 0.64, 4.0, 0.14, vec3(1.0, 0.82, 0.34));
  col += spotlight(p, 0.90, 1.2, 0.11, vec3(1.0, 0.40, 0.70));
  col += reflections(p);
  gl_FragColor = vec4(col * uIntro, 1.0);
}
`;
