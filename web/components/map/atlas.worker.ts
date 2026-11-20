// Bakes the atlas off the main thread, so releasing a drag never stalls a frame.
import { paintAtlas, type AtlasInput } from "@/components/map/atlasTerrain";
import { map } from "@/lib/theme";

export interface AtlasJob {
  key: string;
  input: AtlasInput;
  x0: number;
  y0: number;
  w: number;
  h: number;
  res: number;
}

self.onmessage = ({ data: job }: MessageEvent<AtlasJob>) => {
  const img = new ImageData(job.w, job.h);
  const { spots, prov, lit } = paintAtlas(
    img,
    job.input,
    job.x0,
    job.y0,
    job.res,
    map.atlas,
  );
  self.postMessage(
    { key: job.key, img, spots, prov, lit },
    { transfer: [img.data.buffer, prov.buffer] },
  );
};
