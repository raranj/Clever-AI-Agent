# Clever AI Agent

A Model Context Protocol (MCP) implementation using Cloudflare Workers AI, demonstrating agent-based architecture with tool calling capabilities for device management queries.

## Demo

**Live Demo:** [https://cf-ai-agent.pages.dev](https://cf-ai-agent.pages.dev)

**Video Walkthrough:** [https://illinois.zoom.us/rec/share/IvwtCIZLn7EuYYEWmXgaaQhRtlhLd_m8Dg46T8ZLcJjUx-YENxipZwQv9vU-2y5u.fjopBzG2GoNejjCV?startTime=1761352982000]

![Application Screenshot](./example.png)

## Overview

This project implements a complete MCP (Model Context Protocol) server-client architecture using Cloudflare's edge infrastructure. It features:

- **MCP Server Worker**: Exposes device management tools via MCP protocol
- **MCP Client Worker**: Durable Object-based agent that connects to the MCP server and processes queries using Cloudflare AI
- **Cloudflare Pages Frontend**: Simple web interface for asking questions about device inventory
- **D1 Database**: Cloudflare D1 database storing device and application information

## Architecture

```
┌─────────────────┐
│   Web Browser   │
│   (Frontend)    │
└────────┬────────┘
         │ HTTP POST /api/ask
         ▼
┌─────────────────────────────┐
│  Cloudflare Pages Function  │
│   (functions/api/ask.js)    │
└────────────┬────────────────┘
             │ Fetch to CLIENT_WORKER
             ▼
┌──────────────────────────────────┐
│   Client Worker (Durable Object) │
│   - MyAgent extends Agent        │
│   - Manages MCP connection       │
│   - Calls Cloudflare AI          │
└────────────┬─────────────────────┘
             │ MCP Protocol (SSE/HTTP)
             ▼
┌───────────────────────────────┐
│   Server Worker (MCP Server)  │
│   - Implements MCP protocol   │
│   - Provides 11+ tools        │
│   - Queries D1 database       │
└────────────┬──────────────────┘
             │ SQL Queries
             ▼
┌───────────────────────────────┐
│   Cloudflare D1 Database      │
│   - devices table             │
│   - applications table        │
│   - device_apps table         │
└───────────────────────────────┘
```

## Available MCP Tools

The MCP server provides these tools for device management:

1. **echo** - Echo test tool
2. **add_numbers** - Add two numbers (demo tool)
3. **apps_on_device** - List all applications installed on a specific device
4. **msoffice_versions** - Show Microsoft Office versions across all devices
5. **slack_vs_teams** - Compare Slack vs Teams adoption
6. **outdated_java_devices** - Find devices with outdated Java Runtime
7. **browser_updates** - Find devices needing browser updates
8. **unallowed_apps** - Find devices with unauthorized applications
9. **unencrypted_devices** - List unencrypted devices
10. **no_autolock_devices** - List devices without auto-lock enabled
11. **os_distribution** - Show OS distribution across devices
12. **devices_needing_upgrade** - Count devices needing IS upgrades

## Usage Examples

Once deployed, you can ask natural language questions like:

- ""
- ""
- ""
- ""
