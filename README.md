[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/dominik1001-caldav-mcp-badge.png)](https://mseep.ai/app/dominik1001-caldav-mcp)

# caldav-mcp

<div align="center">

🗓️ A CalDAV Model Context Protocol (MCP) server to expose calendar operations as tools for AI assistants.

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io)
[![semantic-release: angular](https://img.shields.io/badge/semantic--release-angular-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)

</div>

## ✨ Features

- Connect to CalDAV servers
- Create calendar events
- List calendar events within a specific timeframe

## Setup

```
{
  "mcpServers": {
    ...,
    "calendar": {
      "command": "npx",
      "args": [
        "caldav-mcp"
      ],
      "env": {
        "CALDAV_BASE_URL": "<CalDAV server URL>",
        "CALDAV_USERNAME": "<CalDAV username>",
        "CALDAV_PASSWORD": "<CalDAV password>"
      }
    }
  }
}
```

## Usage

1. Compile TypeScript to JavaScript:
```bash
npx tsc
```

2. Run the MCP server:
```bash
node index.js
```

## Available Tools

### create-event

Creates a new calendar event.

Parameters:
- `summary`: String - Event title/summary
- `start`: DateTime string - Event start time
- `end`: DateTime string - Event end time

Returns:
- The unique ID of the created event

### list-events

Lists events within a specified timeframe.

Parameters:
- `start`: DateTime string - Start of the timeframe
- `end`: DateTime string - End of the timeframe

Returns:
- A list of event summaries that fall within the given timeframe

## License

MIT