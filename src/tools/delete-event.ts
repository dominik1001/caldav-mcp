import { CalDAVClient } from "ts-caldav"
import { z } from "zod"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

export function registerDeleteEvent(client: CalDAVClient, server: McpServer) {
  server.registerTool(
    "delete-event",
    {
      description: "Deletes an event in the calendar specified by its URL",
      inputSchema: { uid: z.string(), calendarUrl: z.string() },
    },
    async ({ uid, calendarUrl }) => {
      await client.deleteEvent(calendarUrl, uid)

      return {
        content: [{ type: "text", text: "Event deleted" }],
      }
    }
  )
}
