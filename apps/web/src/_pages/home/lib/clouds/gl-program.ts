function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Не удалось создать шейдер');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Ошибка компиляции шейдера: ${info}`);
  }
  return shader;
}

export interface ShaderSources {
  readonly vertex: string;
  readonly fragment: string;
}

/** Собирает программу WebGL2 из пары шейдеров; при ошибке бросает исключение с логом драйвера. */
export function buildProgram(gl: WebGL2RenderingContext, sources: ShaderSources): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, sources.vertex);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, sources.fragment);
  const program = gl.createProgram();
  if (!program) throw new Error('Не удалось создать программу');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Ошибка линковки программы: ${info}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}
