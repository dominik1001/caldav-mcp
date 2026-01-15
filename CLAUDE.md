# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This project is a CalDAV client using the Model Context Protocol (MCP) server to expose calendar operations as tools. It uses:

- ts-caldav: A TypeScript CalDAV client for interacting with calendar servers
- MCP SDK: Model Context Protocol for creating tools that can be used by AI assistants
- dotenv: For environment variable management

## Environment Setup

The project requires the following environment variables to be set in a `.env` file:

```
CALDAV_BASE_URL=<CalDAV server URL>
CALDAV_USERNAME=<CalDAV username>
CALDAV_PASSWORD=<CalDAV password>
```

## Common Commands

```bash
# Install dependencies
npm install

# Compile TypeScript to JavaScript
npx tsc

# Run the MCP server
node index.js
```

## Project Architecture

The codebase is a simple MCP server implementation that:

1. Connects to a CalDAV server using credentials from environment variables
2. Retrieves the user's calendars and uses the first one for operations
3. Exposes four MCP tools:
   - `list-calendars`: Lists calendars
   - `list-events`: Lists events between a start and end time
   - `create-event`: Creates a calendar event with summary, start, and end time
   - `delete-event`: Deletes event from a calendar 

The MCP server uses the StdioServerTransport to communicate through stdin/stdout, making it suitable for integration with Claude or other AI assistants that support the Model Context Protocol.