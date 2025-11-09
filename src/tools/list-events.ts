import { CalDAVClient } from "ts-caldav"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

const dateString = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: "Invalid date string",
})

export function registerListEvents(client: CalDAVClient, server: McpServer) {
  server.tool(
    "list-events",
    "List all events between start and end date in the calendar specified by its URL",
    { start: dateString, end: dateString, calendarUrl: z.string() },
    async ({ calendarUrl, start, end }) => {
      const options = {
        start: new Date(start),
        end: new Date(end),
      }
      const allEvents = await client.getEvents(calendarUrl, options)
      const data = allEvents.map((e) => ({
        uid: e.uid,
        summary: e.summary,
        start: e.start,
        end: e.end,
      }))
      return {
        content: [{ type: "text", text: JSON.stringify(data) }],
      }
    },
  )
}
