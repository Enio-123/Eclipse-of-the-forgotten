import Phaser from 'phaser';
import { settings } from '../systems/Settings';

// O brilho da imagem (Configurações > Imagem > Brilho), em qualquer predefinição gráfica.
//
// Depois que o Phaser desenha o quadro inteiro (todas as cenas, o HUD e os efeitos), uma passada curta copia
// a tela para uma textura e desenha de volta com uma curva de gama: mais claro levanta as sombras sem estourar
// os claros, mais escuro afunda os meios-tons sem apagar o preto. No brilho normal não roda nada (custo zero).
// Os menus em HTML ficam como estão. Sem WebGL o canvas usa o filtro de brilho do navegador.

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D uTex;
uniform float uGamma;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb;
  gl_FragColor = vec4(pow(c, vec3(uGamma)), 1.0);
}`;

// 0 a 1 (0.5 = normal) -> o expoente da curva: 1.62 no mais escuro, 0.62 no mais claro
export function gammaFor(b: number) {
  return Math.pow(2, -(b - 0.5) * 1.4);
}

const isNormal = (b: number) => Math.abs(b - 0.5) < 0.005;

export function installBrightness(game: Phaser.Game) {
  if (!game.isBooted || !game.renderer) {
    game.events.once(Phaser.Core.Events.BOOT, () => installBrightness(game));
    return;
  }
  if (game.renderer.type !== Phaser.WEBGL) {
    const apply = () => {
      const b = settings.data.brightness;
      game.canvas.style.filter = isNormal(b) ? '' : `brightness(${(0.6 + 0.8 * b).toFixed(3)})`;
    };
    settings.onChange(apply);
    apply();
    return;
  }
  const r = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  let prog: WebGLProgram | null = null;
  let buf: WebGLBuffer | null = null;
  let tex: WebGLTexture | null = null;
  let aPos = -1;
  let uGamma: WebGLUniformLocation | null = null;
  let uTex: WebGLUniformLocation | null = null;
  let tw = 0;
  let th = 0;
  let broken = false;

  const build = (gl: WebGLRenderingContext) => {
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'program');
    prog = p;
    aPos = gl.getAttribLocation(p, 'aPos');
    uGamma = gl.getUniformLocation(p, 'uGamma');
    uTex = gl.getUniformLocation(p, 'uTex');
    // um triângulo que cobre a tela toda
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    tw = th = 0;
  };

  // o contexto do WebGL caiu: o que estava nele some junto (a passada recria tudo quando ele volta)
  r.on(Phaser.Renderer.Events.LOSE_WEBGL, () => {
    prog = buf = tex = null;
    tw = th = 0;
  });

  game.events.on(Phaser.Core.Events.POST_RENDER, () => {
    const b = settings.data.brightness;
    if (isNormal(b) || broken || r.contextLost) return;
    const gl = r.gl;
    r.pipelines.clear();
    try {
      if (!prog) build(gl);
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (w !== tw || h !== th) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, w, h, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
        tw = w;
        th = h;
      }
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);
      gl.disable(gl.BLEND);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.DEPTH_TEST);
      gl.colorMask(true, true, true, true);
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(uTex, 0);
      gl.uniform1f(uGamma, gammaFor(b));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(aPos);
    } catch (e) {
      // sem a passada o jogo segue no brilho normal (não fica tentando a cada quadro)
      broken = true;
      console.warn('brilho: a passada não rodou', e);
    }
    gl.enable(gl.SCISSOR_TEST);
    r.pipelines.rebind();
  });
}
