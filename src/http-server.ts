import { createHash, timingSafeEqual } from "node:crypto";
import {
	createServer as createHttpServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { type HttpConfig, isLoopbackHost } from "./http-config.js";

const MCP_PATH = "/mcp";
const HEALTH_PATH = "/health";
const BEARER = /^Bearer\s+(?<token>.+)$/iu;
const JSONRPC_INTERNAL_ERROR = -32_603;

function send(
	res: ServerResponse,
	status: number,
	body: string,
	headers: Record<string, string> = {}
) {
	res.writeHead(status, { "Content-Type": "text/plain", ...headers });
	res.end(body);
}

/** Hostname of a Host header, without port; handles `[::1]:3000`. */
function hostnameOf(hostHeader: string): string {
	if (hostHeader.startsWith("[")) {
		return hostHeader.slice(1, hostHeader.indexOf("]"));
	}
	return hostHeader.split(":")[0] ?? "";
}

/** The request path, or null when the target is not a parseable URL. */
function pathnameOf(url: string | undefined): string | null {
	try {
		return new URL(url ?? "/", "http://localhost").pathname;
	} catch {
		return null;
	}
}

function digest(value: string): Buffer {
	return createHash("sha256").update(value).digest();
}

// Hashing first gives equal-length buffers, so timingSafeEqual never throws
// and the comparison leaks nothing about the token's length.
function hasValidToken(req: IncomingMessage, expected: string): boolean {
	const token = req.headers.authorization?.match(BEARER)?.groups?.token;
	return (
		token !== undefined && timingSafeEqual(digest(token), digest(expected))
	);
}

/**
 * Rejects requests to /mcp that fail the DNS-rebinding, Origin, auth or method
 * checks. Returns true when it has already answered the request.
 */
function rejectRequest(
	req: IncomingMessage,
	res: ServerResponse,
	config: HttpConfig
): boolean {
	// A rebound browser page reaches a loopback server with a foreign Host.
	if (
		isLoopbackHost(config.host) &&
		!isLoopbackHost(hostnameOf(req.headers.host ?? ""))
	) {
		send(res, 403, "Forbidden: Host not allowed");
		return true;
	}
	// No CORS support, so no browser origin is valid.
	if (req.headers.origin !== undefined) {
		send(res, 403, "Forbidden: Origin not allowed");
		return true;
	}
	if (config.authToken && !hasValidToken(req, config.authToken)) {
		send(res, 401, "Unauthorized", { "WWW-Authenticate": "Bearer" });
		return true;
	}
	// Stateless mode has no server-to-client stream (GET) or session (DELETE).
	if (req.method !== "POST") {
		send(res, 405, "Method Not Allowed", { Allow: "POST" });
		return true;
	}
	return false;
}

async function handleMcp(
	req: IncomingMessage,
	res: ServerResponse,
	createServer: () => McpServer
) {
	try {
		// A stateless transport and an McpServer each serve one request only.
		const mcpServer = createServer();
		const transport = new StreamableHTTPServerTransport({
			enableJsonResponse: true,
		});
		res.on("close", () => {
			transport.close();
			mcpServer.close();
		});
		await mcpServer.connect(transport);
		await transport.handleRequest(req, res);
	} catch (error) {
		console.error("caldav-mcp: request failed:", error);
		if (!res.headersSent) {
			res.writeHead(500, { "Content-Type": "application/json" });
			res.end(
				JSON.stringify({
					error: {
						code: JSONRPC_INTERNAL_ERROR,
						message: "Internal server error",
					},
					id: null,
					jsonrpc: "2.0",
				})
			);
		}
	}
}

/**
 * Serves MCP over stateless Streamable HTTP at /mcp, plus GET /health.
 * Resolves once listening; the caller owns logging and shutdown.
 */
export function startHttpServer(
	config: HttpConfig,
	createServer: () => McpServer
): Promise<Server> {
	const server = createHttpServer((req, res) => {
		const pathname = pathnameOf(req.url);
		if (pathname === null) {
			// Node's parser accepts targets like `http://[` that URL rejects;
			// throwing here would crash the process before any auth check.
			send(res, 400, "Bad Request");
			return;
		}
		if (pathname === HEALTH_PATH && req.method === "GET") {
			send(res, 200, "ok");
			return;
		}
		if (pathname !== MCP_PATH) {
			send(res, 404, "Not Found");
			return;
		}
		if (!rejectRequest(req, res, config)) {
			handleMcp(req, res, createServer);
		}
	});

	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(config.port, config.host, () => {
			server.off("error", reject);
			resolve(server);
		});
	});
}
