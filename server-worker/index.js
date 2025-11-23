export default {
  async fetch(request, env, ctx) {
    return await handleRequest({ request, env, waitUntil: ctx.waitUntil });
  }
};

async function handleRequest({ request, env, waitUntil }) {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/mcp") {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const keepAlive = setInterval(() => writer.write(encoder.encode(":\n\n")), 30000);

    waitUntil((async () => {
      await writer.closed.catch(() => {});
      clearInterval(keepAlive);
    })());

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  if (request.method === "GET" && url.pathname === "/") {
    return new Response("MCP server is running!", {
      headers: { "content-type": "text/plain" },
    });
  }

  if (request.method === "POST" && (url.pathname === "/mcp" || url.pathname === "/")) {
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id = null, method, params } = body;

    if (method === "initialize") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: { name: "DeviceMCP", version: "0.1.0" },
            capabilities: { tools: {} },
          },
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (method === "notifications/initialized") {
      return new Response(null, { status: 204 });
    }

    if (method === "tools/list") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            tools: [
              { name: "echo", description: "Echo input text", inputSchema: { "$schema": "http://json-schema.org/draft-07/schema#", type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
              { name: "apps_on_device", description: "List apps on a device", inputSchema: { "$schema": "http://json-schema.org/draft-07/schema#", type: "object", properties: { device_id: { type: "string" } }, required: ["device_id"] } },
              { name: "msoffice_versions", description: "Microsoft Office versions", inputSchema: { "$schema": "http://json-schema.org/draft-07/schema#", type: "object", properties: {}, required: [] } },
              { name: "slack_vs_teams", description: "Slack vs Teams", inputSchema: { "$schema": "http://json-schema.org/draft-07/schema#", type: "object", properties: {}, required: [] } },
              { name: "outdated_java_devices", description: "Devices with outdated Java", inputSchema: { "$schema": "http://json-schema.org/draft-07/schema#", type: "object", properties: {}, required: [] } },
              { name: "browser_updates", description: "Devices needing browser updates", inputSchema: { "$schema": "http://json-schema.org/draft-07/schema#", type: "object", properties: {}, required: [] } },
              { name: "unallowed_apps", description: "Devices with unallowed apps", inputSchema: { "$schema": "http://json-schema.org/draft-07/schema#", type: "object", properties: {}, required: [] } },
              { name: "unencrypted_devices", description: "Devices without encryption", inputSchema: { "$schema": "http://json-schema.org/draft-07/schema#", type: "object", properties: {}, required: [] } },
              { name: "no_autolock_devices", description: "Devices without auto-lock", inputSchema: { "$schema": "http://json-schema.org/draft-07/schema#", type: "object", properties: {}, required: [] } },
              { name: "os_distribution", description: "OS distribution", inputSchema: { "$schema": "http://json-schema.org/draft-07/schema#", type: "object", properties: {}, required: [] } },
              { name: "devices_needing_upgrade", description: "Count devices needing IS upgrade", inputSchema: { "$schema": "http://json-schema.org/draft-07/schema#", type: "object", properties: {}, required: [] } },
              {name: "add_numbers", description: "Add two numbers and return the sum.", inputSchema: { "$schema": "http://json-schema.org/draft-07/schema#", type: "object", properties: { a: { type: "number", description: "The first number" }, b: { type: "number", description: "The second number" } }, required: ["a", "b"] } },
            ],
          },
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (method === "tools/call") {
      const { name, arguments: args } = params || {};

      if (name === "add_numbers") {
        var { a, b } = args || {};
        a = Number(a);
        b = Number(b);
        const sum = a + b;
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: { content: [{type: "text", text:sum.toString()}] },
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      if (name === "echo") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: { content: [{ type: "text", text: args.text }] }
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      if (name === "apps_on_device") {

        if (!args?.device_id) {
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32602, message: "Missing device_id" } }),
            { headers: { "Content-Type": "application/json" }, status: 400 }
          );
        }
        
        const rows = await env.devices_db.prepare(`
          SELECT a.name AS application_name, a.vendor, da.app_version, da.install_date, da.last_update, da.needs_update
          FROM device_apps da
          JOIN applications a ON da.app_id = a.app_id
          WHERE da.device_id = ?
        `).bind(args.device_id).all();

        let outputText;
        if (rows.results.length === 0) {
          outputText = `No applications found for device ${args.device_id}.`;
        } else {
          let table = "| Application        | Version    | Vendor              | Needs Update |\n";
          table +=    "|--------------------|------------|---------------------|--------------|\n";
          rows.results.forEach(app => {
            table += `| ${app.application_name} | ${app.app_version} | ${app.vendor} | ${app.needs_update ? 'Yes' : 'No'} |\n`;
          });
          outputText = table;
        }

        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: { content: [{ type: "text", text: outputText }] }
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      if (name === "msoffice_versions") {
        const rows = await env.devices_db.prepare(`
          SELECT da.device_id, da.app_version, da.last_update
          FROM device_apps da
          JOIN applications a ON da.app_id = a.app_id
          WHERE a.name = 'Microsoft Office'
        `).all();

        let outputText;
        if (rows.results.length === 0) {
          outputText = "No devices with Microsoft Office found.";
        } else {
          let table = "| Device ID | Version | Last Update |\n";
          table +=    "|-----------|---------|-------------|\n";
          rows.results.forEach(row => {
            table += `| ${row.device_id} | ${row.app_version} | ${row.last_update} |\n`;
          });
          outputText = table;
        }

        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: { content: [{ type: "text", text: outputText }] }
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      if (name === "slack_vs_teams") {
        const rows = await env.devices_db.prepare(`
          SELECT a.name AS application,
                  COUNT(DISTINCT da.device_id) AS devices_with_app,
                  ROUND(100.0 * COUNT(DISTINCT da.device_id) / (SELECT COUNT(*) FROM devices), 2) AS percentage_of_devices
          FROM device_apps da
          JOIN applications a ON da.app_id = a.app_id
          WHERE a.name IN ('Slack', 'Microsoft Teams')
          GROUP BY a.name
        `).all();

        let outputText;
        if (rows.results.length === 0) {
          outputText = "No devices with Slack or Teams found.";
        } else {
          let table = "| Application     | Device Count | Percentage of Devices |\n";
          table +=    "|-----------------|--------------|-----------------------|\n";
          rows.results.forEach(row => {
            table += `| ${row.application} | ${row.devices_with_app} | ${row.percentage_of_devices}% |\n`;
          });
          outputText = table;
        }

        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: { content: [{ type: "text", text: outputText }] }
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      if (name === "outdated_java_devices") {
        const rows = await env.devices_db.prepare(`
          SELECT d.device_id, da.app_version
          FROM device_apps da
          JOIN applications a ON da.app_id = a.app_id
          JOIN devices d ON d.device_id = da.device_id
          WHERE a.name = 'Java Runtime' AND da.needs_update = 1;
        `).all();

        let text = rows.results.length === 0
          ? "No devices have outdated Java Runtime."
          : "| Device ID | Java Version |\n|------------|----------------|\n" +
            rows.results.map(r => `| ${r.device_id} | ${r.app_version} |`).join("\n");

        return new Response(JSON.stringify({
          jsonrpc: "2.0", id,
          result: { content: [{ type: "text", text }] }
        }), { headers: { "Content-Type": "application/json" } });
      }

      if (name === "browser_updates") {
        const rows = await env.devices_db.prepare(`
          SELECT DISTINCT d.device_id, a.name AS browser_name, da.app_version
          FROM device_apps da
          JOIN applications a ON da.app_id = a.app_id
          JOIN devices d ON d.device_id = da.device_id
          WHERE a.category = 'Browser' AND da.needs_update = 1;
        `).all();

        let text = rows.results.length === 0
          ? "All browsers are up to date."
          : "| Device ID | Browser | Version |\n|------------|----------|----------|\n" +
            rows.results.map(r => `| ${r.device_id} | ${r.browser_name} | ${r.app_version} |`).join("\n");

        return new Response(JSON.stringify({
          jsonrpc: "2.0", id,
          result: { content: [{ type: "text", text }] }
        }), { headers: { "Content-Type": "application/json" } });
      }

      if (name === "unallowed_apps") {
        const rows = await env.devices_db.prepare(`
          SELECT DISTINCT d.device_id, a.name
          FROM device_apps da
          JOIN applications a ON da.app_id = a.app_id
          JOIN devices d ON d.device_id = da.device_id
          WHERE a.allowed = 0;
        `).all();

        let text = rows.results.length === 0
          ? "No devices with unallowed apps."
          : "| Device ID | Unallowed App |\n|------------|----------------|\n" +
            rows.results.map(r => `| ${r.device_id} | ${r.name} |`).join("\n");

        return new Response(JSON.stringify({
          jsonrpc: "2.0", id,
          result: { content: [{ type: "text", text }] }
        }), { headers: { "Content-Type": "application/json" } });
      }

      if (name === "unencrypted_devices") {
        const rows = await env.devices_db.prepare(`
          SELECT device_id, hostname, username, department
          FROM devices
          WHERE is_encrypted = 0;
        `).all();

        let text = rows.results.length === 0
          ? "All devices are encrypted."
          : "| Device ID | Hostname | User | Department |\n|------------|-----------|-------|-------------|\n" +
            rows.results.map(r => `| ${r.device_id} | ${r.hostname} | ${r.username} | ${r.department} |`).join("\n");

        return new Response(JSON.stringify({
          jsonrpc: "2.0", id,
          result: { content: [{ type: "text", text }] }
        }), { headers: { "Content-Type": "application/json" } });
      }

      if (name === "no_autolock_devices") {
        const rows = await env.devices_db.prepare(`
          SELECT device_id, hostname, username, department
          FROM devices
          WHERE auto_lock_enabled = 0;
        `).all();

        let text = rows.results.length === 0
          ? "All devices have auto-lock enabled."
          : "| Device ID | Hostname | User | Department |\n|------------|-----------|-------|-------------|\n" +
            rows.results.map(r => `| ${r.device_id} | ${r.hostname} | ${r.username} | ${r.department} |`).join("\n");

        return new Response(JSON.stringify({
          jsonrpc: "2.0", id,
          result: { content: [{ type: "text", text }] }
        }), { headers: { "Content-Type": "application/json" } });
      }

      if (name === "os_distribution") {
        const total = (await env.devices_db.prepare(`SELECT COUNT(*) AS count FROM devices;`).all()).results[0].count;
        const rows = await env.devices_db.prepare(`
          SELECT os, COUNT(*) * 100.0 / ? AS percentage
          FROM devices
          GROUP BY os;
        `).bind(total).all();

        let text = "| OS | Percentage |\n|----|-------------|\n" +
          rows.results.map(r => `| ${r.os} | ${r.percentage.toFixed(1)}% |`).join("\n");

        return new Response(JSON.stringify({
          jsonrpc: "2.0", id,
          result: { content: [{ type: "text", text }] }
        }), { headers: { "Content-Type": "application/json" } });
      }

      if (name === "devices_needing_upgrade") {
        const count = (await env.devices_db.prepare(`
          SELECT COUNT(*) AS count FROM devices WHERE needs_is_upgrade = 1;
        `).all()).results[0].count;

        const text = `${count} devices need an IS upgrade.`;

        return new Response(JSON.stringify({
          jsonrpc: "2.0", id,
          result: { content: [{ type: "text", text }] }
        }), { headers: { "Content-Type": "application/json" } });
      }
    }

    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response("Not found", { status: 404 });
}