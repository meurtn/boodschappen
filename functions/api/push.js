/* ==========================================================================
   Pushmelding als iemand gaat winkelen (Cloudflare Pages Function)
   --------------------------------------------------------------------------
   POST /api/push   met  Authorization: Bearer <Firebase ID-token>
                    body {soort:"start", winkels:["Lidl","Plus"]}  of  {soort:"test", apparaat:"<id>"}

   Wie mag dit? We lezen de aangemelde apparaten (Firestore-collectie "push")
   met het token van de beller zelf. Firestore controleert dat token met de
   gewone regels (alleen het gezin), dus een vreemde krijgt daar niets en kan
   dus ook niemand een melding sturen. Er is geen serviceaccount nodig.

   Versturen gaat volgens de standaarden, net als bij de SaSaa-site:
     RFC 8291 (inhoud versleuteld, aes128gcm) en RFC 8292 (VAPID).

   Omgevingsvariabelen bij Cloudflare (Pages, Settings, Variables and Secrets):
     VAPID_PUBLIC_KEY   de openbare sleutel (staat ook in index.html)
     VAPID_PRIVATE_KEY  de geheime sleutel, als Secret
   ========================================================================== */

const enc = new TextEncoder();

const naarB64url = bytes => {
  let s = ""; const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const uitB64url = t => {
  const s = String(t || "").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};
const samen = (...delen) => {
  const uit = new Uint8Array(delen.reduce((n, d) => n + d.length, 0)); let p = 0;
  delen.forEach(d => { uit.set(d, p); p += d.length; }); return uit;
};

/* --- VAPID (RFC 8292) --- */
async function vapidKop(env, endpoint){
  const publiek = uitB64url(env.VAPID_PUBLIC_KEY);
  const sleutel = await crypto.subtle.importKey("jwk", {kty:"EC", crv:"P-256", ext:true, x:naarB64url(publiek.slice(1, 33)), y:naarB64url(publiek.slice(33, 65)), d:String(env.VAPID_PRIVATE_KEY).trim()},
    {name:"ECDSA", namedCurve:"P-256"}, false, ["sign"]);
  const kop = naarB64url(enc.encode(JSON.stringify({typ:"JWT", alg:"ES256"})));
  const claims = naarB64url(enc.encode(JSON.stringify({aud:new URL(endpoint).origin, exp:Math.floor(Date.now() / 1000) + 12 * 3600, sub:env.VAPID_ONDERWERP || "mailto:lijstjes@example.com"})));
  const sig = await crypto.subtle.sign({name:"ECDSA", hash:"SHA-256"}, sleutel, enc.encode(kop + "." + claims));
  return "vapid t=" + kop + "." + claims + "." + naarB64url(new Uint8Array(sig)) + ", k=" + String(env.VAPID_PUBLIC_KEY).trim();
}

/* --- Versleutelen (RFC 8291, aes128gcm) --- */
async function hkdf(zout, ikm, info, lengte){
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({name:"HKDF", hash:"SHA-256", salt:zout, info}, k, lengte * 8));
}
async function versleutel(a, inhoud){
  const uaPubliek = uitB64url(a.p256dh), authGeheim = uitB64url(a.auth);
  const eigen = await crypto.subtle.generateKey({name:"ECDH", namedCurve:"P-256"}, true, ["deriveBits"]);
  const asPubliek = new Uint8Array(await crypto.subtle.exportKey("raw", eigen.publicKey));
  const ua = await crypto.subtle.importKey("raw", uaPubliek, {name:"ECDH", namedCurve:"P-256"}, false, []);
  const gedeeld = new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH", public:ua}, eigen.privateKey, 256));
  const ikm = await hkdf(authGeheim, gedeeld, samen(enc.encode("WebPush: info\0"), uaPubliek, asPubliek), 32);
  const zout = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(zout, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(zout, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const geheim = new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM", iv:nonce}, aes, samen(enc.encode(inhoud), new Uint8Array([2]))));
  return samen(zout, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPubliek.length]), asPubliek, geheim);
}
async function stuur(env, a, bericht){
  const r = await fetch(a.endpoint, {method:"POST", headers:{Authorization:await vapidKop(env, a.endpoint), "Content-Encoding":"aes128gcm", "Content-Type":"application/octet-stream", TTL:"3600", Urgency:"high"},
    body:await versleutel(a, JSON.stringify(bericht))});
  return r.status;
}

/* De inhoud van het token lezen (zonder te controleren: dat doet Firestore hieronder). */
const tokenInhoud = t => { try { return JSON.parse(new TextDecoder().decode(uitB64url(t.split(".")[1]))); } catch { return null; } };
const tekst = (v, max) => String(v || "").replace(/[\u0000-\u001f]/g, " ").slice(0, max);
const json = (o, status) => new Response(JSON.stringify(o), {status:status || 200, headers:{"Content-Type":"application/json", "Cache-Control":"no-store"}});

export async function onRequestPost({request, env}){
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return json({fout:"pushsleutels ontbreken bij Cloudflare"}, 503);
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const t = token && tokenInhoud(token); if (!t || !t.aud) return json({fout:"niet ingelogd"}, 401);
  let body = {}; try { body = await request.json(); } catch {}

  // De aangemelde apparaten, gelezen met het token van de beller: Firestore laat alleen het gezin toe.
  const url = "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(t.aud) + "/databases/(default)/documents/push?pageSize=50";
  const res = await fetch(url, {headers:{Authorization:"Bearer " + token}});
  if (res.status === 401 || res.status === 403) return json({fout:"geen toegang"}, 403);
  if (!res.ok) return json({fout:"apparaten lezen mislukt (" + res.status + ")"}, 502);
  const docs = ((await res.json()).documents || []).map(d => {
    const f = d.fields || {}, s = k => (f[k] && f[k].stringValue) || "";
    return {id:d.name.split("/").pop(), email:s("email"), endpoint:s("endpoint"), p256dh:s("p256dh"), auth:s("auth")};
  }).filter(a => /^https:\/\//.test(a.endpoint) && a.p256dh && a.auth);

  const wie = tekst((t.name || t.email || "Iemand").split(" ")[0], 40);
  let doel, bericht;
  if (body.soort === "test") {
    doel = docs.filter(a => a.id === body.apparaat);
    bericht = {titel:"Lijstjes", tekst:"Meldingen werken op dit apparaat.", url:"./", tag:"lijstjes-test"};
  } else {
    // Iedereen behalve de winkelaar zelf (op al zijn apparaten).
    doel = docs.filter(a => a.email && a.email !== t.email);
    const w = (Array.isArray(body.winkels) ? body.winkels : []).map(x => tekst(x, 40)).filter(Boolean).slice(0, 6);
    bericht = {titel:wie + " is gaan winkelen", tekst:(w.length ? w.join(", ") + ". " : "") + "Tik om mee te kijken.", url:"./?meekijken=1", tag:"lijstjes-ronde"};
  }
  const uit = {verstuurd:0, mislukt:0, weg:0};
  await Promise.all(doel.map(async a => {
    try {
      const st = await Promise.race([stuur(env, a, bericht), new Promise((_, nee) => setTimeout(() => nee(new Error("te traag")), 8000))]);
      if (st >= 200 && st < 300) uit.verstuurd++;
      else if (st === 404 || st === 410) {
        // Dit apparaat bestaat niet meer bij de pushdienst: uit de lijst halen.
        uit.weg++;
        await fetch("https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(t.aud) + "/databases/(default)/documents/push/" + encodeURIComponent(a.id), {method:"DELETE", headers:{Authorization:"Bearer " + token}}).catch(() => {});
      } else uit.mislukt++;
    } catch { uit.mislukt++; }
  }));
  return json(uit);
}
