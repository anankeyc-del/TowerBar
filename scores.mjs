// Classement partagé de "Tournée Générale : Vichy"
// GET  /api/scores  -> top 20
// POST /api/scores  -> { name, score, bars, maxAlc }  enregistre un score
//
// Chaque score est une entrée séparée dans Netlify Blobs (pas d'écrasement si deux
// joueurs enregistrent en même temps). La clé encode le score pour trier sans tout relire :
//   <1000 - score sur 4 chiffres>_<horodatage>_<prénom encodé>
import { getStore } from "@netlify/blobs";

const MAX_SCORE = 5000; // bars (1000) + all-in (500) + bonus chifoumi
const TOP = 20;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const parse = (key) => {
  const [inv, ts, enc] = key.split("_");
  return { id: key, score: MAX_SCORE - Number(inv), date: new Date(Number(ts)).toISOString(), name: decodeURIComponent(enc || "") };
};

async function allKeys(store) {
  const { blobs } = await store.list();
  return blobs.map((b) => b.key).sort(); // tri lexical = meilleur score d'abord, puis le plus ancien
}

export default async (req) => {
  const store = getStore({ name: "classement", consistency: "strong" });

  if (req.method === "GET") {
    const keys = await allKeys(store);
    return json(keys.slice(0, TOP).map(parse));
  }

  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "JSON invalide" }, 400); }

  const name = String(body.name || "").replace(/[<>&"'`_\u0000-\u001f]/g, "").trim().slice(0, 16);
  const score = Math.round(Number(body.score));
  const bars = Math.max(0, Math.min(9, Math.round(Number(body.bars) || 0)));
  const maxAlc = Math.max(0, Math.min(3.2, Number(body.maxAlc) || 0));
  if (!name) return json({ error: "prénom manquant" }, 400);
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE || score % 10 !== 0)
    return json({ error: "score invalide" }, 400);

  const key = `${String(MAX_SCORE - score).padStart(4, "0")}_${Date.now()}_${encodeURIComponent(name)}`;
  await store.setJSON(key, { name, score, bars, maxAlc: Math.round(maxAlc * 100) / 100 });

  const keys = await allKeys(store);
  const rank = keys.indexOf(key) + 1 || null;
  return json({ ok: true, id: key, rank, top: keys.slice(0, TOP).map(parse) });
};

export const config = { path: "/api/scores" };
