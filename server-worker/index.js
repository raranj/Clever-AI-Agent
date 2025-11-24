async function fetchCleverAPI(path) {
  const url = `https://api.clever.com/v3.0/${path}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer 2b907bfab3ac2c992a3b96d6aceef2d01fe817a5`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    return { 
      error: true, 
      status: response.status, 
      message: response.statusText, 
      text: await response.text() 
    };
  }

  return await response.json();
}

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
            serverInfo: { name: "CleverMCP", version: "0.1.0" },
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
              { name: "get_clever_courses", description: "Fetch courses with name, number, and id", inputSchema: { "$schema": "http://json-schema.org/draft-07/schema#", type: "object", properties: {}, required: [] } },
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

      // 
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

      if (name === "get_clever_courses") {

        const apiResult = await fetchCleverAPI("courses"); 

        if (apiResult.error) {
            return new Response(
                JSON.stringify({
                    jsonrpc: "2.0",
                    id,
                    error: {
                        code: -32000, 
                        message: `Clever API Error ${apiResult.status}. Details: ${apiResult.message}`
                    }
                }),
                { headers: { "Content-Type": "application/json" }, status: 500 }
            );
        }
        
        const courses = apiResult.data;
        let outputText;
        let jsonContent = null;

        if (!courses || courses.length === 0) {
            outputText = "No courses were found on the Clever platform.";
        } else {
            const totalCourses = courses.length;
            outputText = `Successfully retrieved ${totalCourses} courses. Showing top 5 for summary:\n\n`;
            
            let table = "| Course Name | Subject | Course ID |\n";
            table +=    "|-------------|---------|-----------|\n";
            courses.slice(0, 5).forEach(item => {
              const courseData = item.data;

              table += `| ${courseData.name} | ${courseData.number} | ${courseData.id} |\n`;
            });
            outputText += table;
            
            jsonContent = courses[0].data;
            console.log("Sample course data:", jsonContent);
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
    





















    }

    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response("Not found", { status: 404 });
}