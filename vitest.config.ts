import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		// Whole-day dates only shift east of UTC; CI runs in UTC and would never
		// see those bugs.
		env: { TZ: "Europe/Berlin" },
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: ["node_modules/", "dist/", "**/*.config.{js,ts}", "**/tests/**"],
		},
	},
});
