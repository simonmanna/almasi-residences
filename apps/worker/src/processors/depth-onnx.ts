import sharp from 'sharp';

/**
 * §7.4 — Depth Anything V2 via onnxruntime-node. Imported dynamically by
 * depth.ts so the runtime is only loaded when a model is actually configured:
 * onnxruntime is a large native dependency and most deployments will supply a
 * Blender Z-depth pass instead.
 *
 * The model is not vendored. Set DEPTH_MODEL_PATH to a Depth Anything V2 ONNX
 * export; the input is 518×518 RGB normalised to ImageNet statistics, which is
 * what the published exports expect.
 */
const INPUT_SIZE = 518;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/**
 * onnxruntime-node is an optional dependency: a ~200MB native package that most
 * deployments do not need, because §7.4 prefers a Blender Z-depth pass. It is
 * resolved at runtime and typed structurally here, so the worker builds,
 * typechecks and boots without it installed.
 */
interface OnnxTensor {
  data: Float32Array | Uint8Array | Int32Array;
}
interface OnnxSession {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OnnxTensor>>;
}
interface OnnxRuntime {
  InferenceSession: { create(path: string): Promise<OnnxSession> };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown;
}

async function loadRuntime(): Promise<OnnxRuntime> {
  const specifier = 'onnxruntime-node';
  return (await import(specifier)) as unknown as OnnxRuntime;
}

export async function inferDepth(image: Buffer, modelPath: string): Promise<Buffer> {
  const ort = await loadRuntime().catch(() => {
    throw new Error(
      'DEPTH_MODEL_PATH is set but onnxruntime-node is not installed. ' +
        'Run `pnpm --filter @avida/worker add onnxruntime-node`.',
    );
  });

  const meta = await sharp(image).metadata();
  const { data } = await sharp(image)
    .resize(INPUT_SIZE, INPUT_SIZE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // HWC uint8 → CHW float32, normalised.
  const pixels = INPUT_SIZE * INPUT_SIZE;
  const input = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i++) {
    for (let c = 0; c < 3; c++) {
      input[c * pixels + i] = (data[i * 3 + c]! / 255 - MEAN[c]!) / STD[c]!;
    }
  }

  const session = await ort.InferenceSession.create(modelPath);
  const tensor = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const inputName = session.inputNames[0]!;
  const output = await session.run({ [inputName]: tensor });
  const depth = output[session.outputNames[0]!]!.data as Float32Array;

  // Normalise to 0–1 across the frame, then write 8-bit greyscale at half the
  // beauty resolution (§7.4).
  let min = Infinity;
  let max = -Infinity;
  for (const v of depth) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const grey = Buffer.alloc(depth.length);
  for (let i = 0; i < depth.length; i++) grey[i] = Math.round(((depth[i]! - min) / range) * 255);

  const side = Math.round(Math.sqrt(depth.length));
  return sharp(grey, { raw: { width: side, height: side, channels: 1 } })
    .resize(Math.round((meta.width ?? side) / 2), Math.round((meta.height ?? side) / 2), {
      fit: 'fill',
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
