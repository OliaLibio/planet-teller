// Planet Teller – Rezeptvorschläge aus dem Vorrat (Supabase Edge Function, Deno)
// -----------------------------------------------------------------------------
// Die App schickt, was zu Hause ist, und eine kurze Zusammenfassung des Tages:
// offene kcal und Protein, CO₂-Rest, Ernährungsweise, Allergien, Vorlieben,
// Lücken in der Wochenration und was zuletzt oft gegessen wurde.
// Claude schlägt daraus zwei Rezepte vor. Die Gesundheitsnotiz wird nie geschickt.
//
// Benötigtes Geheimnis (dasselbe wie bei der Fotoerkennung): ANTHROPIC_API_KEY

import Anthropic from "npm:@anthropic-ai/sdk@1.7.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.7.0/helpers/zod";
import { z } from "npm:zod@4.6.7/v4";

// Rezepte schreiben ist einfacher als Fotos erkennen – darum Sonnet 5.5 (günstiger); Fotos bleiben bei Opus 5.5.
const MODEL = "claude-sonnet-5-5";
// Preise in US-Dollar je 1 Mio. Token (Claude Sonnet 5.5); Cache-Schreiben = 1,25 × Eingabe.
const PRICE = { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function antwort(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

const Ergebnis = z.object({
  rezepte: z.array(z.object({
    titel: z.string(),
    warum: z.string().describe("Ein bis zwei Sätze auf Deutsch: warum das heute gut passt (Bedarf, Abwechslung, Erde)."),
    zeit_minuten: z.number(),
    portionen: z.number(),
    zutaten: z.array(z.object({
      name: z.string().describe("Exakter Name aus der Lebensmittelliste, wenn etwas passt – sonst ein kurzer deutscher Name."),
      aus_liste: z.boolean(),
      gramm: z.number().describe("Menge für das ganze Rezept in Gramm (Flüssigkeiten in Milliliter)."),
      anzeige: z.string().describe("Alltagsmenge, z. B. '1 Dose Kichererbsen' oder '2 EL Olivenöl'."),
      vorhanden: z.boolean().describe("true, wenn die Zutat im Vorrat steht oder Grundzutat (Salz, Pfeffer, Öl, Wasser) ist."),
      kcal_pro_100g: z.number(),
      protein_pro_100g: z.number(),
    })),
    schritte: z.array(z.string()),
  })),
  hinweis: z.string().describe("Kurzer allgemeiner Hinweis auf Deutsch oder leer."),
});

const ANWEISUNG = `Du bist eine freundliche Kochberaterin in einer persönlichen Ernährungs-App.
Ziel der Person: genug Energie und Eiweiß, Gewicht halten, und dabei möglichst wenig CO₂ – mehr Pflanzliches, Abwechslung statt immer das Gleiche.

Schlage genau zwei unterschiedliche, alltagstaugliche Rezepte vor (deutsche Hausküche oder international, einfach nachzukochen).
Regeln:
- Koche überwiegend mit dem Vorrat. Höchstens drei Zutaten dürfen fehlen – markiere sie mit vorhanden = false.
  Salz, Pfeffer, Wasser und ein Speiseöl gelten als vorhanden.
- Allergien, Unverträglichkeiten und die Ernährungsweise sind strikt einzuhalten – keine Ausnahmen, auch nicht als Option.
- Richte die Portion am offenen Tagesbedarf aus: Fehlt viel Eiweiß, wähle eiweißreiche, CO₂-arme Quellen
  (Hülsenfrüchte, Tofu, Tempeh, ggf. Milchprodukte oder Ei, wenn erlaubt). Bleib im CO₂-Rest, wenn möglich.
- Nutze Lücken in der Wochenration und meide, was zuletzt oft auf dem Teller war.
- Mengen in Gramm für das ganze Rezept, roh bzw. wie gekauft. Nimm Namen aus der Lebensmittelliste, wenn sie passen.
- Schritte kurz, klar, auf Deutsch, höchstens sechs.
- Ein Wunsch der Person (z. B. „schnell“, „warm“, „ohne Ofen“) hat Vorrang.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return antwort(405, { fehler: "Nur POST ist erlaubt." });

  // Nur angemeldete Personen (kostet Geld)
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!authHeader.startsWith("Bearer ") || !supabaseUrl || !anonKey) {
    return antwort(401, { fehler: "Bitte in der App anmelden." });
  }
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anonKey },
  });
  if (!userRes.ok) return antwort(401, { fehler: "Anmeldung abgelaufen – bitte in der App neu anmelden." });

  let body: { vorrat?: string; wunsch?: string; kontext?: Record<string, unknown>; namen?: string[] };
  try {
    body = await req.json();
  } catch {
    return antwort(400, { fehler: "Ungültige Anfrage." });
  }
  const vorrat = String(body.vorrat ?? "").slice(0, 1500).trim();
  if (vorrat.length < 3) return antwort(400, { fehler: "Bitte schreib auf, was du zu Hause hast." });
  const wunsch = String(body.wunsch ?? "").slice(0, 200).trim();
  const kontext = JSON.stringify(body.kontext ?? {}).slice(0, 3000);
  const namen = Array.isArray(body.namen) ? body.namen.map(String).slice(0, 2000) : [];

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return antwort(500, { fehler: "Der KI-Schlüssel ist in Supabase noch nicht hinterlegt." });
  const client = new Anthropic({ apiKey });

  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // lehnt das Modell ab, springt automatisch ein passendes ein
      output_config: { effort: "medium", format: zodOutputFormat(Ergebnis) },
      system: [
        { type: "text", text: ANWEISUNG },
        { type: "text", text: `Lebensmittelliste der App (exakte Namen):\n${namen.join("\n")}` },
      ],
      messages: [{
        role: "user",
        content: `Mein Vorrat zu Hause:\n${vorrat}\n\nMein Tag und meine Angaben (JSON):\n${kontext}` +
          (wunsch ? `\n\nMein Wunsch: ${wunsch}` : ""),
      }],
    });

    if (response.stop_reason === "refusal") {
      return antwort(422, { fehler: "Die KI konnte dazu keinen Vorschlag machen. Bitte anders formulieren." });
    }
    if (!response.parsed_output) {
      return antwort(502, { fehler: "Die Antwort der KI war unvollständig. Bitte noch einmal versuchen." });
    }
    const u = response.usage;
    const kosten =
      ((u.input_tokens ?? 0) * PRICE.input +
        (u.output_tokens ?? 0) * PRICE.output +
        (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead +
        (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite) / 1_000_000;

    return antwort(200, {
      ...response.parsed_output,
      modell: response.model,
      kosten_usd: Math.round(kosten * 10000) / 10000,
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return antwort(502, { fehler: "Der KI-Schlüssel ist ungültig. Bitte in Supabase prüfen." });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return antwort(429, { fehler: "Gerade zu viele Anfragen – bitte in einer Minute noch einmal." });
    }
    if (error instanceof Anthropic.BadRequestError) {
      const leer = /credit|balance/i.test(error.message);
      return antwort(502, {
        fehler: leer
          ? "Das KI-Guthaben ist aufgebraucht. Bitte in console.anthropic.com aufladen."
          : `Die KI hat die Anfrage abgelehnt: ${error.message}`,
      });
    }
    if (error instanceof Anthropic.APIError) {
      return antwort(502, { fehler: `Die KI ist gerade nicht erreichbar (${error.status}). Bitte später noch einmal.` });
    }
    console.error(error);
    return antwort(500, { fehler: "Unerwarteter Fehler beim Rezeptvorschlag." });
  }
});
