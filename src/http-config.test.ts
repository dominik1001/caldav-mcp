import { describe, expect, it } from "vitest";
import { isLoopbackHost, parseHttpConfig } from "./http-config.js";

describe("parseHttpConfig", () => {
	it("defaults to loopback on port 3000 without a token", () => {
		expect(parseHttpConfig({})).toEqual({
			authToken: undefined,
			host: "127.0.0.1",
			port: 3000,
		});
	});

	it("reads host, port and token from the environment", () => {
		expect(
			parseHttpConfig({
				MCP_AUTH_TOKEN: "s3cret",
				MCP_HOST: "::1",
				MCP_PORT: "0",
			})
		).toEqual({ authToken: "s3cret", host: "::1", port: 0 });
	});

	it.each(["abc", "70000", "-1", "3.5"])("rejects MCP_PORT=%j", (value) => {
		expect(() => parseHttpConfig({ MCP_PORT: value })).toThrow(
			"MCP_PORT must be"
		);
	});

	it("treats an empty MCP_AUTH_TOKEN as unset", () => {
		expect(parseHttpConfig({ MCP_AUTH_TOKEN: "" }).authToken).toBeUndefined();
	});

	it("falls back to PORT when MCP_PORT is unset", () => {
		expect(parseHttpConfig({ PORT: "8080" }).port).toBe(8080);
	});

	it("prefers MCP_PORT over PORT", () => {
		expect(parseHttpConfig({ MCP_PORT: "9000", PORT: "8080" }).port).toBe(9000);
	});

	it("rejects an invalid PORT", () => {
		expect(() => parseHttpConfig({ PORT: "abc" })).toThrow(
			"PORT must be an integer"
		);
	});

	it("requires a token when binding to a non-loopback address", () => {
		expect(() => parseHttpConfig({ MCP_HOST: "0.0.0.0" })).toThrow(
			"MCP_AUTH_TOKEN is required when MCP_HOST is not a loopback address"
		);
	});

	it("allows a non-loopback address with a token", () => {
		expect(
			parseHttpConfig({ MCP_AUTH_TOKEN: "s3cret", MCP_HOST: "0.0.0.0" }).host
		).toBe("0.0.0.0");
	});
});

describe("isLoopbackHost", () => {
	it.each(["localhost", "127.0.0.1", "127.1.2.3", "::1"])(
		"treats %s as loopback",
		(host) => {
			expect(isLoopbackHost(host)).toBe(true);
		}
	);

	it.each(["0.0.0.0", "::", "192.168.1.10", "example.com"])(
		"treats %s as not loopback",
		(host) => {
			expect(isLoopbackHost(host)).toBe(false);
		}
	);
});
