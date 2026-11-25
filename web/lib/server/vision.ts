// A learner's drawing, on its way to the model beside their words.
//
// `ChatMessage.content` stays a string everywhere — prompts append to it
// (`judgeStream`'s two-object suffix) — and the image rides alongside as
// `image`. Only at the wire does it become OpenAI's multipart content, and
// only a message that carries one.
//
// Every call goes to the usual model chain, so that chain must accept
// images (today: OPENROUTER_MODEL and its fallback both do).

import type { ChatMessage } from "@/lib/server/openrouter";

export function toWire({ image, ...m }: ChatMessage) {
  if (!image) return m;
  return {
    role: m.role,
    content: [
      { type: "text", text: m.content },
      { type: "image_url", image_url: { url: image } },
    ],
  };
}
