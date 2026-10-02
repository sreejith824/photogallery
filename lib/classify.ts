import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

import { PHOTO_CATEGORIES, isPhotoCategory, type PhotoCategory } from "./categories.ts";

export { PHOTO_CATEGORIES, type PhotoCategory };

export interface Classification {
  categories: PhotoCategory[];
  tags: string[];
  caption: string;
}

// Credentials come from the environment: ANTHROPIC_API_KEY in production, or a
// gateway's ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN in local dev.
const client = new Anthropic();

const SYSTEM_PROMPT = `You catalogue photos for a personal photo gallery.

For each photo return:
- categories: every category from the allowed list that clearly applies (usually 1-2). "nature" covers landscapes, mountains, forests, water, sky, plants. "city" covers streets, buildings, urban scenes. "people" applies when a person is a main subject. "documents" covers scans, screenshots, diagrams and paperwork. Use "other" only when nothing else fits.
- tags: 3-6 short, specific tags for what is visible (objects, landscape features, setting, season, time of day). Title case, no duplicates of the categories.
- caption: a short, natural caption (max 8 words) describing the scene. Don't start with "A photo of".

Always answer by calling the record_classification tool.`;

const OUTPUT_SCHEMA: Anthropic.Beta.BetaTool.InputSchema = {
  type: "object",
  properties: {
    categories: {
      type: "array",
      items: { type: "string", enum: [...PHOTO_CATEGORIES] },
    },
    tags: { type: "array", items: { type: "string" } },
    caption: { type: "string" },
  },
  required: ["categories", "tags", "caption"],
  additionalProperties: false,
};

// Classify a photo with Claude vision. Uses a strict tool call for structured
// output (works through gateways that drop output_config.format). Returns null if
// the model declines or doesn't call the tool; callers should treat that as "not classified".
export async function classifyPhoto(buffer: Buffer): Promise<Classification | null> {
  // Downscale before sending: plenty for classification, and keeps the request
  // well under the image size limit and cheap.
  const image = await sharp(buffer)
    .rotate()
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 1024,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    tools: [
      {
        name: "record_classification",
        description: "Record the categories, tags and caption for the photo.",
        strict: true,
        input_schema: OUTPUT_SCHEMA,
      },
    ],
    tool_choice: { type: "auto" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: image.toString("base64"),
            },
          },
          { type: "text", text: "Classify this photo." },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    console.error("Classification stopped:", response.stop_reason);
    return null;
  }

  const toolUse = response.content.find(
    (b) => b.type === "tool_use" && b.name === "record_classification"
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    console.error("Classification: model did not call the tool");
    return null;
  }

  try {
    const parsed = toolUse.input as Classification;
    const categories = parsed.categories.filter(isPhotoCategory);
    return {
      categories: categories.length ? [...new Set(categories)] : ["other"],
      tags: parsed.tags.map((t) => t.trim()).filter(Boolean).slice(0, 6),
      caption: parsed.caption.trim(),
    };
  } catch (error) {
    console.error("Classification parse error:", error);
    return null;
  }
}
