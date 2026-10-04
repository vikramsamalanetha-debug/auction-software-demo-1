const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const categories = ["Farm Equipment", "Household", "Vehicles", "Tools & Shop", "Antiques", "Miscellaneous"];
const conditions = ["Excellent", "Good used condition", "Fair", "Needs repair", "Unknown"];
const manifest = JSON.stringify({
  name: "HammerList Auction Cataloging", short_name: "HammerList", id: "/", start_url: "/?source=installed",
  display: "standalone", orientation: "portrait-primary", background_color: "#f4f2ed", theme_color: "#173f33",
  description: "Camera-first auction inventory cataloging with AI item recognition.",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
  ]
});
const serviceWorker = `const CACHE="hammerlist-v9";const SHELL=["/","/manifest.webmanifest","/icon-192.png","/icon-512.png"];self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).catch(()=>{}).then(()=>self.skipWaiting())));self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));self.addEventListener("fetch",event=>{if(event.request.method!=="GET")return;const url=new URL(event.request.url);if(url.origin!==location.origin||url.pathname.startsWith("/api/"))return;if(event.request.mode==="navigate"){event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put("/",copy));return response}).catch(()=>caches.match("/")));return}event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)))})`;
const iconBytes = base64 => Uint8Array.from(atob(base64), character => character.charCodeAt(0));
const prompt = `You are the vision engine inside HammerList auction cataloging. Inspect all supplied photographs as different views of one auction item. Return conservative, editable catalog suggestions. Do not invent a brand, model, age, material, measurements, operating condition, authenticity, provenance, or VIN. Transcribe a VIN only when all 17 characters are clearly visible; otherwise return an empty string. If uncertain, use generic wording and say what the auctioneer should verify. Category must be one of: ${categories.join(", ")}. Condition must be one of: ${conditions.join(", ")}. startingBid is a conservative whole-dollar opening bid suggestion, not an appraisal. confidence is an integer from 0 to 100.`;
const schema = {
  type: "object", additionalProperties: false,
  properties: {
    detectedName: { type: "string" }, title: { type: "string" },
    category: { type: "string", enum: categories }, condition: { type: "string", enum: conditions },
    startingBid: { type: "integer", minimum: 0 }, description: { type: "string" }, confidence: { type: "integer", minimum: 0, maximum: 100 },
    vin: { type: "string" }, vehicleYear: { type: "string" }, vehicleMake: { type: "string" }, vehicleModel: { type: "string" }, vehicleTrim: { type: "string" }, bodyClass: { type: "string" }
  },
  required: ["detectedName", "title", "category", "condition", "startingBid", "description", "confidence", "vin", "vehicleYear", "vehicleMake", "vehicleModel", "vehicleTrim", "bodyClass"]
};
const vinSchema = { type: "object", additionalProperties: false, properties: { vin: { type: "string" } }, required: ["vin"] };
class PublicError extends Error { constructor(message, status = 502) { super(message); this.status = status; } }

async function recognize(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "The photo request was invalid." }, 400); }
  const images = Array.isArray(body.images) ? body.images.slice(0, 3) : body.image ? [body.image] : [];
  if (!images.length || images.some(image => typeof image !== "string" || !image.startsWith("data:image/"))) return json({ error: "Please take or choose at least one photo first." }, 400);
  if (images.reduce((sum, image) => sum + image.length, 0) > 16_000_000) return json({ error: "Those photos are too large. Remove one or try again." }, 413);
  const provider = body.engine === "secondary" && env.OPENAI_API_KEY ? "openai" : "gemini";
  if (!env.GEMINI_API_KEY && provider === "gemini") return json({ error: "HammerList AI setup is not complete yet." }, 503);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const started = Date.now();
  try {
    let result;
    try { result = provider === "openai" ? await recognizeWithOpenAI(images, env.OPENAI_API_KEY, controller.signal) : await recognizeWithGemini(images, env.GEMINI_API_KEY, controller.signal); }
    catch (error) {
      if (provider === "openai" && env.GEMINI_API_KEY && error instanceof PublicError && [402,429,502].includes(error.status)) result = await recognizeWithGemini(images, env.GEMINI_API_KEY, controller.signal, true);
      else throw error;
    }
    return json({ ...result, elapsedMs: Date.now() - started });
  } catch (error) {
    console.error(`${provider} recognition failed`, error?.name || "Error");
    if (error instanceof PublicError) return json({ error: error.message }, error.status);
    return json({ error: error?.name === "AbortError" ? "Recognition took too long. Please try again." : "HammerList AI is temporarily unavailable." }, 502);
  } finally { clearTimeout(timeout); }
}

async function recognizeWithOpenAI(images, apiKey, signal) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5-mini",
        store: false,
        input: [{ role: "user", content: [
          { type: "input_text", text: prompt },
          ...images.map(image => ({ type: "input_image", image_url: image, detail: "high" }))
        ] }],
        text: { format: { type: "json_schema", name: "auction_item", strict: true, schema } }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      const errorCode = data?.error?.code || "unknown";
      console.error("OpenAI response error", response.status, errorCode);
      if (errorCode === "credit_balance_exhausted") {
        throw new PublicError("The secondary scan is temporarily unavailable.", 402);
      }
      if (response.status === 429) throw new PublicError("The secondary scan is busy. Wait a moment, then try again.", 429);
      throw new PublicError("The secondary scan could not recognize the photos. Please try again.");
    }
    const outputText = data.output_text || data.output?.flatMap(item => item.content || []).find(item => item.type === "output_text")?.text;
    if (!outputText) throw new PublicError("The secondary scan returned no item details. Please try another photo.");
    return JSON.parse(outputText);
}

async function recognizeWithGemini(images, apiKey, signal, alternate = false) {
  const parsed = images.map(image => image.match(/^data:([^;]+);base64,(.+)$/s));
  if (parsed.some(match => !match)) throw new PublicError("A selected photo format is not supported.", 400);
  const requestBody = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: alternate ? `${prompt}\nTake an independent second look and favor alternate plausible identification only when the photos support it.` : prompt }, ...parsed.map(match => ({ inline_data: { mime_type: match[1], data: match[2] } }))] }],
    generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, temperature: alternate ? 0.35 : 0.2 }
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent", {
      method: "POST", signal,
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: requestBody
    });
    const data = await response.json();
    if (response.ok) {
      const outputText = data.candidates?.[0]?.content?.parts?.find(part => typeof part.text === "string")?.text;
      if (!outputText) throw new PublicError("HammerList AI returned no item details. Please try another photo.");
      return JSON.parse(outputText);
    }
    console.error("Gemini response error", response.status, data?.error?.status || "unknown", `attempt ${attempt + 1}`);
    if (response.status === 503 && attempt === 0) { await new Promise(resolve => setTimeout(resolve, 700)); continue; }
    if (response.status === 503) throw new PublicError("HammerList AI is temporarily busy. Your photos are still here—try the scan again.", 503);
    if (response.status === 429) throw new PublicError("The AI scan limit was reached. Wait a moment, then try again.", 429);
    if (response.status === 400 || response.status === 403) throw new PublicError("HammerList AI setup needs attention.", 502);
    throw new PublicError("HammerList AI could not recognize the photos. Please try again.");
  }
}

async function scanVin(request, env) {
  if (!env.GEMINI_API_KEY) return json({ error: "HammerList AI setup is not complete yet." }, 503);
  let body; try { body = await request.json(); } catch { return json({ error: "The VIN photo request was invalid." }, 400); }
  const images = Array.isArray(body.images) ? body.images.slice(0, 3) : [];
  const parsed = images.map(image => typeof image === "string" && image.match(/^data:([^;]+);base64,(.+)$/s));
  if (!parsed.length || parsed.some(match => !match)) return json({ error: "Add a clear VIN plate photo first." }, 400);
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent", { method: "POST", headers: { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Read the vehicle VIN visible in these photos. Return exactly the 17-character VIN only when every character is clear. VINs never use I, O, or Q. Otherwise return an empty string." }, ...parsed.map(match => ({ inline_data: { mime_type: match[1], data: match[2] } }))] }], generationConfig: { responseMimeType: "application/json", responseJsonSchema: vinSchema, temperature: 0 } }) });
  const data = await response.json(); if (!response.ok) return json({ error: "The VIN could not be read from those photos." }, 502);
  const text = data.candidates?.[0]?.content?.parts?.find(part => typeof part.text === "string")?.text;
  try { const vin = JSON.parse(text).vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ""); return json({ vin: vin.length === 17 ? vin : "" }); } catch { return json({ vin: "" }); }
}

async function decodeVin(url) {
  const vin = (url.searchParams.get("vin") || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  if (vin.length !== 17) return json({ error: "Enter a complete 17-character VIN." }, 400);
  const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`);
  if (!response.ok) return json({ error: "Vehicle data is temporarily unavailable." }, 502);
  const row = (await response.json()).Results?.[0]; if (!row) return json({ error: "No vehicle details were returned for that VIN." }, 404);
  if (row.ErrorCode && !String(row.ErrorCode).split(",").every(code => ["0","14"].includes(code.trim()))) return json({ error: row.ErrorText || "That VIN could not be decoded." }, 422);
  const displacement = row.DisplacementL ? `${row.DisplacementL}L` : "", cylinders = row.EngineCylinders ? `${row.EngineCylinders}-cylinder` : "";
  return json({ vin, year: row.ModelYear || "", make: row.Make || "", model: row.Model || "", trim: row.Trim || row.Series || "", body: row.BodyClass || "", engine: [displacement, cylinders, row.EngineConfiguration, row.FuelTypePrimary].filter(Boolean).join(" · "), drive: row.DriveType || "", manufacturer: row.Manufacturer || "", plant: [row.PlantCity,row.PlantState,row.PlantCountry].filter(Boolean).join(", ") });
}

async function requestAccount(request, env) {
  let body; try { body = await request.json(); } catch { return json({ error: "The account request was invalid." }, 400); }
  const required = ["company", "contactName", "email", "phone", "platforms"];
  if (required.some(key => !body[key] || (Array.isArray(body[key]) && !body[key].length))) return json({ error: "Complete the required company and platform information." }, 400);
  if (!/^\S+@\S+\.\S+$/.test(String(body.email)) || JSON.stringify(body).length > 20_000) return json({ error: "Check the request details and try again." }, 400);
  const requestId = `HL-${new Date().toISOString().slice(2,10).replaceAll("-","")}-${crypto.randomUUID().slice(0,5).toUpperCase()}`;
  if (env.ACCOUNT_REQUEST_WEBHOOK_URL) {
    const delivered = await fetch(env.ACCOUNT_REQUEST_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "hammerlist.account_request", requestId, submittedAt: new Date().toISOString(), request: body }) });
    if (!delivered.ok) return json({ error: "The request could not be delivered. Please try again." }, 502);
  }
  return json({ accepted: true, requestId, delivery: env.ACCOUNT_REQUEST_WEBHOOK_URL ? "routed" : "demo" }, 202);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/recognize" && request.method === "POST") return recognize(request, env);
    if (url.pathname === "/api/vin-scan" && request.method === "POST") return scanVin(request, env);
    if (url.pathname === "/api/vin" && request.method === "GET") return decodeVin(url);
    if (url.pathname === "/api/account-request" && request.method === "POST") return requestAccount(request, env);
    if (url.pathname === "/manifest.webmanifest") return new Response(manifest, { headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "no-cache" } });
    if (url.pathname === "/sw.js") return new Response(serviceWorker, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache", "service-worker-allowed": "/" } });
    if (url.pathname === "/icon-192.png") return new Response(iconBytes(icon192Base64), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
    if (url.pathname === "/icon-512.png") return new Response(iconBytes(icon512Base64), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
    if (url.pathname === "/downloads/HammerList-GitHub-Upload-Bundle.zip") return new Response(iconBytes(repositoryZipBase64), { headers: { "content-type": "application/zip", "content-disposition": "attachment; filename=\"HammerList-GitHub-Upload-Bundle.zip\"", "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
    if (url.pathname !== "/") return new Response("Not found", { status: 404 });
    return new Response(page, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", "x-content-type-options": "nosniff", "referrer-policy": "same-origin" } });
  }
};
