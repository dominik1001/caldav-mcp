export interface HttpConfig {
	authToken: string | undefined;
	host: string;
	port: number;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const MAX_PORT = 65_535;
const DIGITS = /^\d+$/u;
// An IPv4 literal in 127.0.0.0/8, not a hostname that merely starts with "127.".
const LOOPBACK_IPV4 = /^127(?:\.\d{1,3}){3}$/u;

/** True for addresses only reachable from this machine. */
export function isLoopbackHost(host: string): boolean {
	return host === "localhost" || host === "::1" || LOOPBACK_IPV4.test(host);
}

function parsePort(name: string, value: string): number {
	const port = Number(value);
	if (!DIGITS.test(value) || port > MAX_PORT) {
		throw new Error(`${name} must be an integer between 0 and 65535`);
	}
	return port;
}

function readPort(env: NodeJS.ProcessEnv): number {
	if (env.MCP_PORT) {
		return parsePort("MCP_PORT", env.MCP_PORT);
	}
	if (env.PORT) {
		return parsePort("PORT", env.PORT);
	}
	return DEFAULT_PORT;
}

/** Reads the HTTP transport settings; throws on invalid or unsafe values. */
export function parseHttpConfig(env: NodeJS.ProcessEnv): HttpConfig {
	const host = env.MCP_HOST || DEFAULT_HOST;
	const authToken = env.MCP_AUTH_TOKEN || undefined;
	if (!(authToken || isLoopbackHost(host))) {
		throw new Error(
			"MCP_AUTH_TOKEN is required when MCP_HOST is not a loopback address"
		);
	}
	return { authToken, host, port: readPort(env) };
}
