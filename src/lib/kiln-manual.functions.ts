import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
] as const;

const MAX_BYTES = 20 * 1024 * 1024;

export type ManualField = {
  value: string | number | null;
  confidence: number | null;
  evidence: string | null;
  page: number | null;
};

export type ManualExtraction = Record<string, ManualField>;

const FIELDS = [
  "brand",
  "model",
  "name",
  "power_kw",
  "oven_diameter_cm",
  "biscuit_hours",
  "glaze_hours",
  "kwh_cost",
  "resistance_cost",
  "resistance_burns",
  "utilization",
  "area_adjustment",
  "final_buffer",
  "customer_margin_percent",
] as const;

const SYSTEM_PROMPT = `Você analisa manuais técnicos de fornos cerâmicos e extrai parâmetros em json.
Regras absolutas:
- Extraia SOMENTE valores explicitamente presentes no documento. Nunca invente, estime, converta suposições ou use valores padrão.
- Se um valor não estiver claramente documentado, retorne null naquele campo.
- Nunca preencha número de série a partir de um manual genérico.
- Campos comerciais/operacionais (kwh_cost, resistance_cost, resistance_burns, utilization, area_adjustment, final_buffer, customer_margin_percent) só podem ser preenchidos se o documento trouxer explicitamente aquele valor, com correspondência inequívoca. Caso contrário, null.
- Números devem ser numéricos puros (ponto decimal), sem unidades.
Responda apenas com json neste formato:
{"fields":{"<campo>":{"value":<número|texto|null>,"confidence":<0..1|null>,"evidence":"<trecho curto do documento|null>","page":<número|null>}}}
Campos válidos: ${FIELDS.join(", ")}.
Significados: power_kw = potência nominal em kW; oven_diameter_cm = diâmetro útil/interno da câmara em cm; biscuit_hours = duração documentada da queima de biscoito em horas; glaze_hours = duração documentada da queima de esmalte em horas; name = nome sugerido para o forno (marca + modelo).`;

function extractJson(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalize(parsed: any): ManualExtraction {
  const src = parsed?.fields && typeof parsed.fields === "object" ? parsed.fields : parsed;
  const out: ManualExtraction = {};
  if (!src || typeof src !== "object") return out;
  for (const key of FIELDS) {
    const entry = (src as any)[key];
    if (entry === undefined || entry === null) continue;
    const rawValue = typeof entry === "object" ? entry.value : entry;
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    const isNumeric = key !== "brand" && key !== "model" && key !== "name";
    let value: string | number | null = null;
    if (isNumeric) {
      const n = Number(String(rawValue).replace(",", ".").replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(n)) continue;
      value = n;
    } else {
      value = String(rawValue).trim().slice(0, 120);
      if (!value) continue;
    }
    const confidence =
      typeof entry === "object" && Number.isFinite(Number(entry.confidence))
        ? Math.max(0, Math.min(1, Number(entry.confidence)))
        : null;
    const evidence =
      typeof entry === "object" && entry.evidence
        ? String(entry.evidence).trim().slice(0, 180)
        : null;
    const page =
      typeof entry === "object" && Number.isFinite(Number(entry.page)) ? Number(entry.page) : null;
    out[key] = { value, confidence, evidence, page };
  }
  return out;
}

export const analyzeKilnManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileName: string; mimeType: string; dataBase64: string }) => {
    if (!input || typeof input.dataBase64 !== "string" || !input.dataBase64) {
      throw new Error("Arquivo inválido ou vazio.");
    }
    if (!ALLOWED_MIME.includes(input.mimeType as (typeof ALLOWED_MIME)[number])) {
      throw new Error("Formato não suportado. Envie PDF, PNG, JPG/JPEG ou WebP.");
    }
    const bytes = Math.floor((input.dataBase64.length * 3) / 4);
    if (bytes > MAX_BYTES) throw new Error("Arquivo acima do limite de 20 MB.");
    return input;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("IA indisponível: chave não configurada no projeto.");

    const dataUrl = `data:${data.mimeType};base64,${data.dataBase64}`;
    const content =
      data.mimeType === "application/pdf"
        ? [
            { type: "text", text: "Extraia os parâmetros deste manual em json." },
            {
              type: "file",
              file: { filename: data.fileName || "manual.pdf", file_data: dataUrl },
            },
          ]
        : [
            { type: "text", text: "Extraia os parâmetros deste manual em json." },
            { type: "image_url", image_url: { url: dataUrl } },
          ];

    let resp: Response;
    try {
      resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content },
          ],
          response_format: { type: "json_object" },
        }),
      });
    } catch {
      throw new Error("Não foi possível contatar a IA. Tente novamente em instantes.");
    }

    if (resp.status === 429) throw new Error("Muitas análises seguidas. Aguarde e tente de novo.");
    if (resp.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      if (/no pages|unsupported|document/i.test(detail)) {
        throw new Error(
          "Não foi possível ler o documento. Se for um PDF digitalizado, envie uma imagem nítida da página.",
        );
      }
      throw new Error("A IA não conseguiu analisar o manual. Tente outro arquivo.");
    }

    const json: any = await resp.json().catch(() => null);
    const raw = json?.choices?.[0]?.message?.content;
    const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((p: any) => p?.text ?? "").join("") : "";
    const parsed = extractJson(text ?? "");
    if (!parsed) {
      throw new Error("Não foi possível interpretar o manual. Tente uma página mais legível.");
    }
    const fields = normalize(parsed);
    return { fields, found: Object.keys(fields).length };
  });
