#!/usr/bin/env node

import 'dotenv/config'
import { CalDAVClient, RecurrenceRule } from "ts-caldav";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";


const server = new McpServer({
  name: "caldav-mcp",
  version: "0.1.0"
});

const recurrenceRuleSchema = z.object({
  freq: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).optional(),
  interval: z.number().optional(),
  count: z.number().optional(),
  until: z.string().datetime().optional(),  // ISO 8601 string
  byday: z.array(z.string()).optional(),    // e.g. ["MO", "TU"]
  bymonthday: z.array(z.number()).optional(),
  bymonth: z.array(z.number()).optional(),
});

const dateString = z
  .string()
  .refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date string",
  });

async function main() {
  const client = await CalDAVClient.create({
    baseUrl: process.env.CALDAV_BASE_URL || "",
    auth: {
      type: "basic",
      username: process.env.CALDAV_USERNAME || "",
      password: process.env.CALDAV_PASSWORD || ""
    },
    logRequests: true // Added this line
  });

  const calendars = await client.getCalendars();

  server.tool(
    "create-event",
    "Creates an event in the calendar specified by its URL",
    {summary: z.string(), start: z.string().datetime(), end: z.string().datetime(), calendarUrl: z.string(), recurrenceRule: recurrenceRuleSchema.optional()},
    async ({calendarUrl, summary, start, end, recurrenceRule}) => {
      const event = await client.createEvent(calendarUrl, {
        summary: summary,
        start: new Date(start),
        end: new Date(end),
        recurrenceRule: recurrenceRule as RecurrenceRule,
      });
      return {
        content: [{type: "text", text: event.uid}]
      };
    }
  );


  server.tool(
    "list-events",
    "List all events between start and end date in the calendar specified by its URL",
    {start: dateString, end: dateString, calendarUrl: z.string()},
    async ({calendarUrl, start, end}) => {
      const options = {
        start: new Date(start),
        end: new Date(end),
      };
      const allEvents = await client.getEvents(calendarUrl, options);
      const data = allEvents.map(e => ({summary: e.summary, start: e.start, end: e.end}));
      return {
        content: [{type: "text", text: JSON.stringify(data)}]
      };
    }
  );

  server.tool(
    "delete-event",
    "Deletes an event in the calendar specified by its URL",
    {uid: z.string(), calendarUrl: z.string()},
    async ({uid, calendarUrl}) => {
      await client.deleteEvent(calendarUrl, uid);
      return {
        content: [{type: "text", text: "Event deleted"}]
      };
    }
  );

  server.tool(
    "list-calendars",
    "List all calendars returning both name and URL",
    {},
    async () => {
      const data = calendars.map(c => ({name: c.displayName, url: c.url}));
      return {content: [{type: "text", text: JSON.stringify(data)}]};
    }
  )

  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main()