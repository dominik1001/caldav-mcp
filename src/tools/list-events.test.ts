import { describe, test, expect, vi } from "vitest"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { CalDAVClient } from "ts-caldav"
import { registerListEvents } from "./list-events.js"

type ToolHandler = (params: {
  calendarUrl: string
  start: string
  end: string
}) => Promise<{ content: { type: string; text: string }[] }>

describe("registerListEvents", () => {
  test("returns uid field for each event", async () => {
    // Create mock CalDAV client
    const mockClient = {
      getEvents: vi.fn().mockResolvedValue([
        {
          uid: "event-123",
          summary: "Test Event",
          start: new Date("2025-10-13T10:00:00Z"),
          end: new Date("2025-10-13T11:00:00Z"),
        },
        {
          uid: "event-456",
          summary: "Another Event",
          start: new Date("2025-10-14T14:00:00Z"),
          end: new Date("2025-10-14T15:00:00Z"),
        },
      ]),
    }

    // Create mock MCP server with spied tool method
    let toolHandler: ToolHandler | null = null
    const server = new McpServer({
      name: "test-server",
      version: "0.1.0",
    })

    // Spy on the tool registration to capture the handler
    const originalTool = server.tool.bind(server)
    server.tool = vi.fn(
      (
        name: string,
        description: string,
        schema: unknown,
        handler: ToolHandler,
      ) => {
        if (name === "list-events") {
          toolHandler = handler
        }
        return originalTool(name, description, schema, handler)
      },
    ) as typeof server.tool

    // Register the tool
    registerListEvents(mockClient as CalDAVClient, server)

    // Verify handler was captured
    expect(toolHandler).toBeDefined()

    // Call the tool handler
    const result = await toolHandler({
      calendarUrl: "/test/calendar/",
      start: "2025-10-01T00:00:00Z",
      end: "2025-10-31T23:59:59Z",
    })

    // Parse the response
    const events = JSON.parse(result.content[0].text)

    // Verify uid is included in each event
    expect(events).toHaveLength(2)
    expect(events[0]).toHaveProperty("uid", "event-123")
    expect(events[0]).toHaveProperty("summary", "Test Event")
    expect(events[1]).toHaveProperty("uid", "event-456")
    expect(events[1]).toHaveProperty("summary", "Another Event")
  })
})
