interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  TURNSTILE_SECRET_KEY?: string;
  LEAD_NOTIFICATION_WEBHOOK?: string;
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

const VALID_STATUSES = [
  "new", "contacted", "qualified", "proposal", "won", "lost", "spam"
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

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value).replace(/"/g, '""');
  return `"${s}"`;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map(h => csvEscape(row[h])).join(","));
  }
  return lines.join("\r\n");
}

async function verifyTurnstile(token: string, secret: string, remoteIp?: string): Promise<boolean> {
  if (!token || !secret) return false;
  try {
    const formData = new FormData();
    formData.append("secret", secret);
    formData.append("response", token);
    if (remoteIp) {
      formData.append("remoteip", remoteIp);
    }
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData
    });
    const outcome = (await res.json()) as { success?: boolean };
    return Boolean(outcome.success);
  } catch {
    return false;
  }
}

function getAdminUser(request: Request, url: URL): string | null {
  const user = request.headers.get("cf-access-authenticated-user-email") ||
               request.headers.get("cf-access-user") ||
               request.headers.get("x-admin-user");
  if (user) return user;
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return "admin@local.integrowsys.com";
  }
  return null;
}

function requireAdmin(request: Request, url: URL): Response | null {
  const user = getAdminUser(request, url);
  if (!user) {
    return json({ success: false, message: "Authentication required" }, 401);
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/api/health") {
      return json({
        status: "ok",
        worker: "integrowsys-site",
        database: Boolean(env.DB),
        message: "Staging API is responding"
      });
    }

    // Public Lead Submission
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

      // Silently accept bot honeypot submissions
      if (clean(body.website, 200)) {
        return json({
          success: true,
          message: "Thank you. Your enquiry has been received."
        }, 201);
      }

      // Verify Cloudflare Turnstile token if secret key is configured
      if (env.TURNSTILE_SECRET_KEY) {
        const turnstileToken = clean(body.turnstile_token || body["cf-turnstile-response"], 2048);
        const remoteIp = request.headers.get("cf-connecting-ip") || undefined;
        const isHuman = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, remoteIp);
        if (!isHuman) {
          return json({
            success: false,
            message: "Security verification failed. Please complete the verification check."
          }, 400);
        }
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
        const leadId = crypto.randomUUID();

        await env.DB.prepare(`
          INSERT INTO leads (
            id, name, company, designation, email, phone, city,
            facility_type, service_interest, message, consent, source_path
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          leadId,
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

        // Optional Webhook notification (e.g. Slack, Telegram, CRM, Email Gateway)
        if (env.LEAD_NOTIFICATION_WEBHOOK) {
          try {
            const webhookPayload = {
              text: `🚨 *New InteGrowSys Lead Received*\n• *Name*: ${name}\n• *Company*: ${company || 'N/A'}\n• *Phone*: ${phone}\n• *Email*: ${email || 'N/A'}\n• *Service*: ${serviceInterest}\n• *City*: ${city || 'N/A'}\n• *Facility*: ${facilityType || 'N/A'}\n• *Message*: ${message.slice(0, 500)}`,
              lead: {
                id: leadId,
                name,
                company,
                phone,
                email,
                service: serviceInterest,
                city,
                facility_type: facilityType,
                source_path: sourcePath
              }
            };
            fetch(env.LEAD_NOTIFICATION_WEBHOOK, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(webhookPayload)
            }).catch(err => console.error("Webhook notification dispatch error:", err));
          } catch (webhookErr) {
            console.error("Webhook preparation error:", webhookErr);
          }
        }

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

    // -------------------------------------------------------------
    // ADMIN API ENDPOINTS (Protected by Cloudflare Access)
    // -------------------------------------------------------------

    if (url.pathname.startsWith("/api/admin/")) {
      const authError = requireAdmin(request, url);
      if (authError) return authError;

      // GET /api/admin/stats
      if (url.pathname === "/api/admin/stats" && request.method === "GET") {
        try {
          const now = new Date();
          const firstOfMonth = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);

          const row = await env.DB.prepare(`
            SELECT 
              COUNT(*) AS total,
              SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_this_month,
              SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) AS qualified,
              SUM(CASE WHEN status = 'proposal' THEN 1 ELSE 0 END) AS proposal,
              SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS won
            FROM leads
          `).bind(firstOfMonth).first<{
            total: number;
            new_this_month: number;
            qualified: number;
            proposal: number;
            won: number;
          }>();

          return json({
            success: true,
            total: row?.total ?? 0,
            new_this_month: row?.new_this_month ?? 0,
            qualified: row?.qualified ?? 0,
            proposal: row?.proposal ?? 0,
            won: row?.won ?? 0
          });
        } catch (error) {
          console.error("Stats query failed:", error);
          return json({ success: false, message: "Could not fetch stats" }, 500);
        }
      }

      // GET /api/admin/leads/export
      if (url.pathname === "/api/admin/leads/export" && request.method === "GET") {
        try {
          const status = url.searchParams.get("status") || "";
          const service = url.searchParams.get("service") || "";
          const dateFrom = url.searchParams.get("date_from") || "";
          const dateTo = url.searchParams.get("date_to") || "";

          const conditions: string[] = [];
          const bindings: unknown[] = [];

          if (status && VALID_STATUSES.includes(status)) {
            conditions.push("status = ?");
            bindings.push(status);
          }
          if (service) {
            conditions.push("service_interest = ?");
            bindings.push(service);
          }
          if (dateFrom) {
            const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000);
            if (!isNaN(fromTs)) {
              conditions.push("created_at >= ?");
              bindings.push(fromTs);
            }
          }
          if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            const toTs = Math.floor(toDate.getTime() / 1000);
            if (!isNaN(toTs)) {
              conditions.push("created_at <= ?");
              bindings.push(toTs);
            }
          }

          const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
          const query = `
            SELECT id, datetime(created_at, 'unixepoch') AS created_at, name, company, designation,
                   email, phone, city, facility_type, service_interest, status, source_path, message
            FROM leads
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT 5000
          `;

          const stmt = env.DB.prepare(query);
          const { results } = await (bindings.length ? stmt.bind(...bindings) : stmt).all();
          const csvData = toCsv(results as Record<string, unknown>[]);

          return new Response(csvData, {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
              "Cache-Control": "no-store"
            }
          });
        } catch (error) {
          console.error("Export leads failed:", error);
          return json({ success: false, message: "Could not export leads" }, 500);
        }
      }

      // GET /api/admin/leads
      if (url.pathname === "/api/admin/leads" && request.method === "GET") {
        try {
          const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
          const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "25", 10)));
          const offset = (page - 1) * limit;

          const status = url.searchParams.get("status") || "";
          const service = url.searchParams.get("service") || "";
          const dateFrom = url.searchParams.get("date_from") || "";
          const dateTo = url.searchParams.get("date_to") || "";

          const conditions: string[] = [];
          const bindings: unknown[] = [];

          if (status && VALID_STATUSES.includes(status)) {
            conditions.push("status = ?");
            bindings.push(status);
          }
          if (service) {
            conditions.push("service_interest = ?");
            bindings.push(service);
          }
          if (dateFrom) {
            const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000);
            if (!isNaN(fromTs)) {
              conditions.push("created_at >= ?");
              bindings.push(fromTs);
            }
          }
          if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            const toTs = Math.floor(toDate.getTime() / 1000);
            if (!isNaN(toTs)) {
              conditions.push("created_at <= ?");
              bindings.push(toTs);
            }
          }

          const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

          // Count query
          const countStmt = env.DB.prepare(`SELECT COUNT(*) AS total FROM leads ${whereClause}`);
          const countRow = await (bindings.length ? countStmt.bind(...bindings) : countStmt).first<{ total: number }>();
          const total = countRow?.total ?? 0;

          // Data query
          const dataStmt = env.DB.prepare(`
            SELECT * FROM leads
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
          `);
          const dataBindings = [...bindings, limit, offset];
          const { results } = await dataStmt.bind(...dataBindings).all();

          return json({
            success: true,
            data: results ?? [],
            total,
            page,
            limit
          });
        } catch (error) {
          console.error("Fetch leads failed:", error);
          return json({ success: false, message: "Could not fetch leads" }, 500);
        }
      }

      // Route: /api/admin/leads/:id/*
      const leadIdMatch = url.pathname.match(/^\/api\/admin\/leads\/([a-zA-Z0-9-]+)(?:\/(status|notes))?$/);
      if (leadIdMatch) {
        const leadId = leadIdMatch[1];
        const subRoute = leadIdMatch[2]; // undefined, "status", or "notes"

        // Single lead detail: GET /api/admin/leads/:id
        if (!subRoute && request.method === "GET") {
          try {
            const lead = await env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(leadId).first();
            if (!lead) {
              return json({ success: false, message: "Lead not found" }, 404);
            }
            return json(lead);
          } catch (error) {
            console.error("Fetch lead detail failed:", error);
            return json({ success: false, message: "Could not fetch lead" }, 500);
          }
        }

        // Status update: PATCH or POST /api/admin/leads/:id/status
        if (subRoute === "status" && (request.method === "PATCH" || request.method === "POST")) {
          try {
            const body = await request.json() as Record<string, unknown>;
            const status = clean(body?.status, 50);
            if (!VALID_STATUSES.includes(status)) {
              return json({ success: false, message: "Invalid status value" }, 400);
            }

            await env.DB.prepare(`
              UPDATE leads SET status = ?, updated_at = unixepoch() WHERE id = ?
            `).bind(status, leadId).run();

            return json({ success: true, status });
          } catch (error) {
            console.error("Update status failed:", error);
            return json({ success: false, message: "Could not update status" }, 500);
          }
        }

        // Notes: GET /api/admin/leads/:id/notes
        if (subRoute === "notes" && request.method === "GET") {
          try {
            const { results } = await env.DB.prepare(`
              SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC
            `).bind(leadId).all();

            return json({ success: true, data: results ?? [] });
          } catch (error) {
            console.error("Fetch notes failed:", error);
            return json({ success: false, message: "Could not fetch notes" }, 500);
          }
        }

        // Notes: POST /api/admin/leads/:id/notes
        if (subRoute === "notes" && request.method === "POST") {
          try {
            const body = await request.json() as Record<string, unknown>;
            const text = clean(body?.text, 5000);
            if (!text) {
              return json({ success: false, message: "Note text is required" }, 400);
            }

            const author = getAdminUser(request, url) || "Admin";
            const noteId = crypto.randomUUID();

            await env.DB.prepare(`
              INSERT INTO lead_notes (id, created_at, lead_id, author, text)
              VALUES (?, unixepoch(), ?, ?, ?)
            `).bind(noteId, leadId, author, text).run();

            return json({
              success: true,
              data: {
                id: noteId,
                lead_id: leadId,
                author,
                text,
                created_at: Math.floor(Date.now() / 1000)
              }
            }, 201);
          } catch (error) {
            console.error("Create note failed:", error);
            return json({ success: false, message: "Could not create note" }, 500);
          }
        }
      }

      return json({ success: false, message: "API endpoint not found" }, 404);
    }

    // Dynamic routing for admin single-lead view:
    // If requesting /admin/leads/<lead-id> (which isn't static /admin/leads or /admin/leads/),
    // rewrite request to serve /admin/leads/view/index.html so the client-side router loads it.
    if (
      url.pathname.startsWith("/admin/leads/") &&
      !url.pathname.includes(".") &&
      url.pathname !== "/admin/leads/view" &&
      url.pathname !== "/admin/leads/view/"
    ) {
      const viewUrl = new URL("/admin/leads/view/", request.url);
      return env.ASSETS.fetch(new Request(viewUrl, request));
    }

    return env.ASSETS.fetch(request);
  }
};
