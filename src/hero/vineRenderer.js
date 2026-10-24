import { createFullscreenProgram, drawFullscreen, NOISE_GLSL } from "../lib/gl.js";

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMoss;
uniform sampler2D uFoliage;
uniform sampler2D uGrowth;
uniform float uMossProgress;
uniform float uVineProgress;
uniform vec2 uSize;
${NOISE_GLSL}

void main() {
  vec4 moss = texture2D(uMoss, vUv);
  vec4 foliage = texture2D(uFoliage, vUv);
  vec4 g = texture2D(uGrowth, vUv);
  float growth = (g.r * 255.0 * 256.0 + g.g * 255.0) / 65535.0;

  vec2 px = vUv * uSize;
  float grain = noise(px / 46.0) * 0.7 + noise(px / 14.0) * 0.3;
  float mossAt = vUv.x * 0.6 + (1.0 - vUv.y) * 0.22 + grain * 0.18;
  float mossWidth = 0.2;
  float mossReveal = smoothstep(mossAt, mossAt + mossWidth, uMossProgress * (1.0 + mossWidth));
  float settle = smoothstep(mossAt + mossWidth, mossAt + mossWidth + 0.25, uMossProgress * (1.0 + mossWidth));
  vec3 mossColor = moss.rgb * mix(0.55, 1.0, settle);
  vec4 base = vec4(mossColor, moss.a) * mossReveal;

  float vineWidth = 0.025;
  float vineReveal = smoothstep(growth, growth + vineWidth, uVineProgress * (1.0 + vineWidth));
  float tip = vineReveal * (1.0 - smoothstep(growth + vineWidth, growth + vineWidth * 5.0, uVineProgress * (1.0 + vineWidth)));
  vec3 leafColor = foliage.rgb + vec3(0.08, 0.12, 0.02) * tip * foliage.a;
  vec4 leaf = vec4(leafColor, foliage.a) * vineReveal;

  gl_FragColor = leaf + base * (1.0 - leaf.a);
}
`;

function texture(gl, unit, image, { premultiply, nearest }) {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, premultiply ? gl.BROWSER_DEFAULT_WEBGL : gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  const filter = nearest ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/**
 * Draws one name row: mossy letters emerging, then foliage growing along the
 * precomputed growth map. Returns null when WebGL is unavailable.
 */
export function createVineRenderer(canvas, { moss, foliage, growth, width, height }) {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;

  canvas.width = width;
  canvas.height = height;

  const { uniform } = createFullscreenProgram(gl, FRAGMENT);

  texture(gl, 0, moss, { premultiply: true, nearest: false });
  texture(gl, 1, foliage, { premultiply: true, nearest: false });
  texture(gl, 2, growth, { premultiply: false, nearest: true });
  gl.uniform1i(uniform("uMoss"), 0);
  gl.uniform1i(uniform("uFoliage"), 1);
  gl.uniform1i(uniform("uGrowth"), 2);
  gl.uniform2f(uniform("uSize"), width, height);

  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);

  return {
    draw(mossProgress, vineProgress) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uniform("uMossProgress"), mossProgress);
      gl.uniform1f(uniform("uVineProgress"), vineProgress);
      drawFullscreen(gl);
    },
  };
}
