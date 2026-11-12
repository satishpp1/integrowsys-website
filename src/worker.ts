interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const MAX_BODY_SIZE = 10_000;

const ALLOWED_SERVICES = [
  "Fire Safety AMC & Maintenance",
  "Fire Alarm Systems",
  "Fire Hydrant & Sprinkler Systems",
  "Fire Safety Audit & Training",
  "Fire Pump Systems",
  "Smart Monitoring & IoT",
  "Pressurization & Basement Ventilation",
  "CCTV, Access Control & Networking",
  "Other"
];

function clean(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        status: "ok",
        worker: "integrowsys-site",
        database: Boolean(env.DB),
        message: "Staging API is responding"
      });
    }

    if (url.pathname === "/api/leads") {
      if (request.method !== "POST") {
        return json({ success: false, message: "Method not allowed" }, 405);
      }

      const contentType = request.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) {
        return json({ success: false, message: "JSON content required" }, 415);
      }

      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > MAX_BODY_SIZE) {
        return json({ success: false, message: "Submission is too large" }, 413);
      }

      let body: Record<string, unknown>;

      try {
        const rawBody = await request.text();

        if (rawBody.length > MAX_BODY_SIZE) {
          return json({ success: false, message: "Submission is too large" }, 413);
        }

        const parsed: unknown = JSON.parse(rawBody);

        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return json({ success: false, message: "Invalid submission" }, 400);
        }

        body = parsed as Record<string, unknown>;
      } catch {
        return json({ success: false, message: "Invalid JSON submission" }, 400);
      }

      // Silently accept bot submissions without storing them.
      if (clean(body.website, 200)) {
        return json({
          success: true,
          message: "Thank you. Your enquiry has been received."
        }, 201);
      }

      const name = clean(body.name, 100);
      const company = clean(body.company, 150);
      const designation = clean(body.designation, 100);
      const email = clean(body.email, 254).toLowerCase();
      const phone = clean(body.phone, 30);
      const city = clean(body.city, 100);
      const facilityType = clean(body.facility_type, 100);
      const serviceInterest = clean(body.service_interest, 100);
      const message = clean(body.message, 3000);
      const consent = body.consent === true;

      if (!name || !phone || !serviceInterest || !message) {
        return json({
          success: false,
          message: "Please complete all required fields."
        }, 400);
      }

      if (!/^[0-9+\-\s().]{7,30}$/.test(phone)) {
        return json({
          success: false,
          message: "Please enter a valid phone number."
        }, 400);
      }

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({
          success: false,
          message: "Please enter a valid email address."
        }, 400);
      }

      if (!ALLOWED_SERVICES.includes(serviceInterest)) {
        return json({
          success: false,
          message: "Please select a valid service."
        }, 400);
      }

      if (!consent) {
        return json({
          success: false,
          message: "Please confirm that we may contact you."
        }, 400);
      }

      let sourcePath: string | null = null;
      const referer = request.headers.get("referer");

      if (referer) {
        try {
          const refererUrl = new URL(referer);

          if (refererUrl.origin === url.origin) {
            sourcePath = refererUrl.pathname.slice(0, 500);
          }
        } catch {
          sourcePath = null;
        }
      }

      try {
        await env.DB.prepare(`
          INSERT INTO leads (
            id, name, company, designation, email, phone, city,
            facility_type, service_interest, message, consent, source_path
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          name,
          company || null,
          designation || null,
          email || null,
          phone,
          city || null,
          facilityType || null,
          serviceInterest,
          message,
          1,
          sourcePath
        ).run();

        return json({
          success: true,
          message: "Thank you. Your enquiry has been received. Our team will contact you."
        }, 201);
      } catch (error) {
        console.error("Lead insertion failed:", error);

        return json({
          success: false,
          message: "We could not save your enquiry. Please try again or email crm@integrowsys.com."
        }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
