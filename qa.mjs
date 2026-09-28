const { default: worker } = await import(`../dist/server/index.js?qa=${Date.now()}`);
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
  const value = String(url);
  if (value.includes("vpic.nhtsa.dot.gov")) return new Response(JSON.stringify({ Results: [{ ErrorCode: "0", ModelYear: "2020", Make: "FORD", Model: "F-150", Trim: "XLT", BodyClass: "Pickup", DisplacementL: "5.0", EngineCylinders: "8", FuelTypePrimary: "Gasoline", DriveType: "4WD" }] }), { status: 200, headers: { "content-type": "application/json" } });
  if (value.includes("generativelanguage.googleapis.com")) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ detectedName: "Pickup truck", title: "2020 Ford F-150 XLT", category: "Vehicles", condition: "Good used condition", startingBid: 5000, description: "Verify mileage and operating condition.", confidence: 91, vin: "", vehicleYear: "2020", vehicleMake: "Ford", vehicleModel: "F-150", vehicleTrim: "XLT", bodyClass: "Pickup" }) }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
  throw new Error(`Unexpected fetch ${value}`);
};

try {
  const env = { GEMINI_API_KEY: "test" };
  const home = await (await worker.fetch(new Request("https://hammerlist.test/"), env)).text();
  for (const marker of ["Welcome back", "Create an auction", "HammerList AI Scan", "Choose photos", "Read VIN from photo"]) if (!home.includes(marker)) throw new Error(`Missing UI marker: ${marker}`);
  if (/Recognize with Gemini|providerLabel/.test(home)) throw new Error("AI provider name leaked into the customer UI");
  const recognized = await worker.fetch(new Request("https://hammerlist.test/api/recognize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ images: ["data:image/jpeg;base64,AA=="], engine: "primary" }) }), env);
  const recognizedBody = await recognized.json();
  if (recognized.status !== 200 || recognizedBody.title !== "2020 Ford F-150 XLT" || "provider" in recognizedBody) throw new Error("Recognition contract failed");
  const vin = await worker.fetch(new Request("https://hammerlist.test/api/vin?vin=1FTFW1E50LFA00001"), env);
  const vinBody = await vin.json();
  if (vin.status !== 200 || vinBody.make !== "FORD" || vinBody.year !== "2020") throw new Error("VIN contract failed");
  console.log("HammerList UI, provider masking, recognition, and VIN QA passed");
} finally { globalThis.fetch = originalFetch; }
