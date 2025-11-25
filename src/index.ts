#!/usr/bin/env node

import "dotenv/config"
import { CalDAVClient } from "ts-caldav"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import express from "express"

import { registerCreateEvent } from "./tools/create-event.js"
import { registerDeleteEvent } from "./tools/delete-event.js"
import { registerListCalendars } from "./tools/list-calendars.js"
import { registerListEvents } from "./tools/list-events.js"

const server = new McpServer({
  name: "caldav-mcp",
  version: "0.1.0",
})

async function main() {
  console.error("CalDAV Config:", {
    baseUrl: process.env.CALDAV_BASE_URL,
    username: process.env.CALDAV_USERNAME,
    hasPassword: !!process.env.CALDAV_PASSWORD,
  })

  const client = await CalDAVClient.create({
    baseUrl: process.env.CALDAV_BASE_URL || "",
    auth: {
      type: "basic",
      username: process.env.CALDAV_USERNAME || "",
      password: process.env.CALDAV_PASSWORD || "",
    },
  })

  registerCreateEvent(client, server)
  registerListEvents(client, server)
  registerDeleteEvent(client, server)
  await registerListCalendars(client, server)

  const useHttp = process.argv.includes("--http")

  if (useHttp) {
    const app = express()
    app.use(express.json())

    app.post("/mcp", async (req, res) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      })

      res.on("close", () => {
        transport.close()
      })

      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    })

    const host = process.env.LISTEN_ADDR || "localhost"
    const port = parseInt(process.env.PORT || "3000")
    app.listen(port, host, () => {
      console.error(`MCP Server running on http://${host}:${port}/mcp`)
    })
  } else {
    const transport = new StdioServerTransport()
    await server.connect(transport)
  }
}

main()
