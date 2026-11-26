// The picture for a worked example. The browser posts a prompt built from
// the whole example — only when the learner taps for it — and gets back a
// signed URL. Auth-gated like /api/speech.
//
// The cache is per learner on purpose: files live under
// example-images/<user id>/<prompt hash>, in a private bucket only the
// service role touches, so a learner can never be handed another's file.
// A reopened section or a reload is a cache hit and costs nothing; only a
// learner's first tap on a given example pays for a draw.

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { logError, logEvent } from "@/lib/log";
import {
  apiError,
  apiErrorFrom,
  newRequestId,
  withRequestId,
} from "@/lib/server/apiError";
import { generateImage, generateSvg, imageModel, svgPlan } from "@/lib/server/image";
import { createClient } from "@/lib/supabase/server";
import { supabaseUrl } from "@/lib/supabase/config";

export const maxDuration = 60;

const BUCKET = "example-images";
/** Bump to abandon every stored image (a style change). */
const VERSION = "1";
/** A whole worked example (title + steps + hint) runs well under this; it only stops abuse. */
const MAX_CHARS = 6_000;
/** Signed URLs are cheap to remint; a day outlives any reading session. */
const SIGNED_SECONDS = 60 * 60 * 24;

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/** A double tap on one instance waits for the draw already in flight instead
 *  of paying for a second one. ponytail: per-instance only; two instances can
 *  still both draw on a simultaneous first tap — rare, and only ever twice. */
const inFlight = new Map<string, Promise<string>>();

export async function POST(request: Request) {
  const requestId = newRequestId();

  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError) {
    logError("auth_unavailable", authError, { req: requestId, at: "example-image" });
    return apiError("upstream", { requestId, status: 503 });
  }
  const userId = claims?.claims?.sub;
  if (!userId) return apiError("auth", { requestId });

  const model = imageModel();
  const secret = process.env.SUPABASE_SECRET_KEY;
  // Without the cache every view would re-bill, so no secret means no images.
  if (!model || !secret) return apiError("notfound", { requestId, reason: "images_off" });

  const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return apiError("invalid", { requestId, reason: "no_prompt" });
  if (prompt.length > MAX_CHARS)
    return apiError("invalid", { requestId, reason: "prompt_too_long" });

  const hash = createHash("sha256")
    .update([VERSION, model, prompt].join("\u0000"))
    .digest("hex");
  const folder = `${userId}/`;
  const storage = createAdminClient(supabaseUrl(), secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).storage.from(BUCKET);

  const sign = async (path: string) => {
    const { data, error } = await storage.createSignedUrl(path, SIGNED_SECONDS);
    if (error || !data) throw error ?? new Error("no signed url");
    return data.signedUrl;
  };

  try {
    const { data: hit } = await storage.list(userId, { search: hash, limit: 1 });
    if (hit?.[0]) {
      logEvent("example_image_hit", { req: requestId });
      return withRequestId(
        NextResponse.json({ url: await sign(folder + hit[0].name) }),
        requestId,
      );
    }

    const key = folder + hash;
    let draw = inFlight.get(key);
    if (!draw) {
      draw = (async () => {
        // Jev routes line schematics to an SVG (cheaper, crisp, exact labels);
        // anything it isn't sure of — or an SVG that fails — draws as before.
        const plan = await svgPlan(prompt);
        const img = plan
          ? await generateSvg(prompt, plan.effort).catch((err) => {
              logError("example_svg_failed", err, { req: requestId });
              return generateImage(prompt);
            })
          : await generateImage(prompt);
        const path = `${key}.${EXT[img.mime] ?? "png"}`;
        // Awaited, not `after()`: the signed URL below needs the object.
        const { error } = await storage.upload(path, img.bytes, {
          contentType: img.mime,
          cacheControl: "31536000",
          upsert: true,
        });
        if (error) throw error;
        return path;
      })().finally(() => inFlight.delete(key));
      inFlight.set(key, draw);
    }
    return withRequestId(NextResponse.json({ url: await sign(await draw) }), requestId);
  } catch (err) {
    logError("example_image_failed", err, { req: requestId });
    return apiErrorFrom(err, { requestId });
  }
}
