// Planet Teller – Fotoerkennung (Supabase Edge Function, Deno)
// -----------------------------------------------------------------------------
// Die App schickt ein verkleinertes Tellerfoto hierher. Die Funktion prüft, ob die
// Anfrage von einer angemeldeten Person kommt, und fragt dann Claude: Was liegt auf
// dem Teller, wie viel ungefähr? Das Ergebnis ist ein Vorschlag – eingetragen wird
// erst, wenn die Person in der App bestätigt.
//
// Benötigtes Geheimnis (in Supabase unter Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  – der API-Schlüssel aus console.anthropic.com
// SUPABASE_URL und SUPABASE_ANON_KEY stellt Supabase selbst bereit.
//
// Das Foto wird nirgends gespeichert; es geht nur für diese eine Anfrage an Anthropic.

import Anthropic from "npm:@anthropic-ai/sdk@1.7.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.7.0/helpers/zod";
import { z } from "npm:zod@4.6.7/v4";

const MODEL = "claude-opus-5-5";
// Preise in US-Dollar je 1 Mio. Token (Claude Opus 5.5); Cache-Schreiben = 1,25 × Eingabe.
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

// Was Claude zurückgeben soll – erzwungen über strukturierte Ausgabe.
const Ergebnis = z.object({
  beschreibung: z.string().describe("Ein kurzer Satz auf Deutsch, was auf dem Foto zu sehen ist."),
  lebensmittel: z.array(z.object({
    name: z.string().describe("Exakter Name aus der Liste, wenn etwas passt – sonst ein kurzer deutscher Name."),
    aus_liste: z.boolean().describe("true, wenn name exakt aus der Liste stammt."),
    gramm: z.number().describe("Geschätzte Menge in Gramm (bei Getränken Milliliter) für das, was auf dem Foto liegt."),
    kcal_pro_100g: z.number().describe("Geschätzte kcal je 100 g."),
    protein_pro_100g: z.number().describe("Geschätztes Protein in g je 100 g."),
    sicherheit: z.enum(["hoch", "mittel", "niedrig"]),
    hinweis: z.string().describe("Kurzer Hinweis auf Deutsch, z. B. 'angebissen, etwa die Hälfte' – oder leer."),
  })),
});

const ANWEISUNG = `Du hilfst in einer persönlichen Ernährungs-App, ein Foto einer Mahlzeit einzutragen.
Erkenne jedes einzelne Lebensmittel oder Gericht auf dem Foto und schätze, wie viel davon zu sehen ist.

Regeln:
- Nimm, wenn es passt, den exakten Namen aus der Lebensmittelliste unten und setze aus_liste auf true.
  Ein ganzes Gericht (z. B. „Linsensuppe“) ist besser als viele Einzelzutaten, wenn die Liste es enthält.
- Passt nichts aus der Liste, nenne einen kurzen deutschen Namen, setze aus_liste auf false und schätze kcal und Protein je 100 g.
- Schätze Gramm realistisch: Tellergröße (meist 26–28 cm), Besteck oder Hände helfen beim Abschätzen.
  Angebissenes oder halb Gegessenes entsprechend weniger.
- Was nicht gegessen wird (Teller, Deko, Verpackung), nicht aufnehmen.
- Bist du unsicher, sag es über sicherheit und hinweis – erfinde nichts.
- Eine Notiz der Person hat Vorrang vor dem, was du siehst.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return antwort(405, { fehler: "Nur POST ist erlaubt." });

  // 1) Nur angemeldete Personen dürfen die Erkennung nutzen (kostet Geld).
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  // Öffentlicher Projektschlüssel: kommt mit der Anfrage der App, sonst aus der Umgebung.
  const anonKey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!authHeader.startsWith("Bearer ") || !supabaseUrl || !anonKey) {
    return antwort(401, { fehler: "Bitte in der App anmelden." });
  }
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anonKey },
  });
  if (!userRes.ok) return antwort(401, { fehler: "Anmeldung abgelaufen – bitte in der App neu anmelden." });

  // 2) Anfrage prüfen
  let body: { bild?: string; media_type?: string; notiz?: string; namen?: string[] };
  try {
    body = await req.json();
  } catch {
    return antwort(400, { fehler: "Ungültige Anfrage." });
  }
  const bild = String(body.bild ?? "");
  const mediaType = body.media_type === "image/png" ? "image/png" : "image/jpeg";
  if (!bild || bild.length * 0.75 > MAX_IMAGE_BYTES) {
    return antwort(400, { fehler: "Das Foto fehlt oder ist zu groß." });
  }
  const namen = Array.isArray(body.namen) ? body.namen.map(String).slice(0, 2000) : [];
  const notiz = String(body.notiz ?? "").slice(0, 300).trim();

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return antwort(500, { fehler: "Der KI-Schlüssel ist in Supabase noch nicht hinterlegt." });
  const client = new Anthropic({ apiKey });

  // 3) Claude fragen. Anweisung und Lebensmittelliste ändern sich selten und werden
  //    zwischengespeichert (Prompt Caching) – das macht Folgefotos günstiger.
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // lehnt das Modell ab, springt automatisch ein passendes ein
      output_config: { effort: "medium", format: zodOutputFormat(Ergebnis) },
      system: [
        { type: "text", text: ANWEISUNG },
        {
          type: "text",
          text: `Lebensmittelliste der App (exakte Namen):\n${namen.join("\n")}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: bild } },
          { type: "text", text: notiz ? `Notiz der Person: ${notiz}` : "Was ist auf diesem Foto?" },
        ],
      }],
    });

    if (response.stop_reason === "refusal") {
      return antwort(422, { fehler: "Die KI konnte dieses Foto nicht auswerten. Bitte selbst eintragen." });
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
    return antwort(500, { fehler: "Unerwarteter Fehler bei der Fotoerkennung." });
  }
});
