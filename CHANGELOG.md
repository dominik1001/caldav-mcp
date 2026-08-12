# [0.10.0](https://github.com/dominik1001/caldav-mcp/compare/v0.9.2...v0.10.0) (2026-07-01)


### Bug Fixes

* **delete-todo:** report a missing task with the friendly not-found error ([70affe1](https://github.com/dominik1001/caldav-mcp/commit/70affe1c36b8e160d75759370fc5777bcc27f192))
* **list-todos:** bound limit/offset, reuse status enum, type statusOf ([07ae914](https://github.com/dominik1001/caldav-mcp/commit/07ae914a2f6b0a45728ff3e521255b54f9bf38a3))
* **update-todo:** keep COMPLETED status and timestamp in sync ([d73b54a](https://github.com/dominik1001/caldav-mcp/commit/d73b54a9d9ee4186a38ddf78063bc736013e09a5))


### Features

* add complete-todo tool ([dec69f8](https://github.com/dominik1001/caldav-mcp/commit/dec69f86f0611154bf9e31c38aaf8d105aaef54a))
* add create-todo tool ([7d4545c](https://github.com/dominik1001/caldav-mcp/commit/7d4545c2da7192dad2835337083f54aa514d943e))
* add delete-todo tool ([8142a6f](https://github.com/dominik1001/caldav-mcp/commit/8142a6f4849b4c9aed531022947604b9d81382d1))
* add hrefFor helper for CalDAV object addressing ([ee26cfd](https://github.com/dominik1001/caldav-mcp/commit/ee26cfd7edcfd5f1639779fa391df5b9ff677035))
* add list-todos tool with status filter, due window, sort and pagination ([f7c99cb](https://github.com/dominik1001/caldav-mcp/commit/f7c99cbec46d0577a70e47e6fdfd9a14d5034c4d))
* add update-todo tool ([311c5d9](https://github.com/dominik1001/caldav-mcp/commit/311c5d97363424bfd5ba402e4d433191bec843cb))
* register VTODO tools, generate docs, add smoke coverage ([e9e4a48](https://github.com/dominik1001/caldav-mcp/commit/e9e4a488aac99b4a5526ef39627220fd339b0722))

## [0.9.2](https://github.com/dominik1001/caldav-mcp/compare/v0.9.1...v0.9.2) (2026-05-27)


### Bug Fixes

* **ci:** skip Claude Code Review on fork PRs ([3695a53](https://github.com/dominik1001/caldav-mcp/commit/3695a5382e2cdd6f9a1401c0df59f6a774333e25))

## [0.9.1](https://github.com/dominik1001/caldav-mcp/compare/v0.9.0...v0.9.1) (2026-05-27)


### Bug Fixes

* **ci:** grant pull-requests write permission to Claude Code Review ([6634ab5](https://github.com/dominik1001/caldav-mcp/commit/6634ab5d9ff5c31f6c282f1fad21c9fc7000c292))
* **ci:** move MCP Registry publish to separate release-triggered workflow ([2b362fa](https://github.com/dominik1001/caldav-mcp/commit/2b362fa9859f5d0bf1c9b8da64b72e12de87dfde))

# [0.9.0](https://github.com/dominik1001/caldav-mcp/compare/v0.8.0...v0.9.0) (2026-05-27)


### Bug Fixes

* **ci:** disable lefthook during semantic-release commit ([24531f7](https://github.com/dominik1001/caldav-mcp/commit/24531f78ce6549cd55527e08040d267834224a51))


### Features

* publish to MCP Registry ([88e7e83](https://github.com/dominik1001/caldav-mcp/commit/88e7e83a9ed12f5cd618fb2ee521e2224af66956))

# [0.8.0](https://github.com/dominik1001/caldav-mcp/compare/v0.7.0...v0.8.0) (2026-05-11)


### Features

* **list-events:** include description and location in results ([4f71f96](https://github.com/dominik1001/caldav-mcp/commit/4f71f96ad68feee49d8bda3359860de6b0aff289)), closes [#48](https://github.com/dominik1001/caldav-mcp/issues/48)

# [0.7.0](https://github.com/dominik1001/caldav-mcp/compare/v0.6.0...v0.7.0) (2026-05-11)


### Features

* **create-event:** support description and location fields ([5b498e5](https://github.com/dominik1001/caldav-mcp/commit/5b498e5308c3d9737c1f9ff01e8131662ea202f5))

# [0.6.0](https://github.com/dominik1001/caldav-mcp/compare/v0.5.0...v0.6.0) (2026-05-08)


### Features

* add agent-driven smoke test harness ([1600988](https://github.com/dominik1001/caldav-mcp/commit/160098832b1db2629709bbbd20b6930299518a3e))
* add mcp server configuration file ([557a046](https://github.com/dominik1001/caldav-mcp/commit/557a046514488191f5b179906349e5119d754de2))
* add smoke test script for end-to-end tool validation ([7aa3022](https://github.com/dominik1001/caldav-mcp/commit/7aa302233a0566b4ebbc654aed9e988ad2c491d2))

# [0.5.0](https://github.com/dominik1001/caldav-mcp/compare/v0.4.1...v0.5.0) (2026-04-09)


### Bug Fixes

* allow markdown-only commits in pre-commit hook ([321f3d2](https://github.com/dominik1001/caldav-mcp/commit/321f3d2a3f2b6722cc3d83b0e1c3e280d671dd64))
* fetch etag before deletion ([f432b19](https://github.com/dominik1001/caldav-mcp/commit/f432b19d294b1ec232f985982a2b6ef6249f4c12))
* format mockResolvedValue chains in update-event tests ([c972b51](https://github.com/dominik1001/caldav-mcp/commit/c972b51feacc0760f07c6d1f777e8197762f0b5b))
* update timezone parsing with offset: true ([79d3961](https://github.com/dominik1001/caldav-mcp/commit/79d39619423225556dc93fbd6b5fc676484d7f4e))


### Features

* add update-event ([e8f0f1a](https://github.com/dominik1001/caldav-mcp/commit/e8f0f1a834614dd52cf2f1eaf533596c1afbc0f5))

## [0.4.1](https://github.com/dominik1001/caldav-mcp/compare/v0.4.0...v0.4.1) (2026-04-09)


### Bug Fixes

* prevent $ref in list-events and create-event input schemas ([ef0ace2](https://github.com/dominik1001/caldav-mcp/commit/ef0ace25ddb16b0f887bd76cb49257e01ccb082e))

# [0.4.0](https://github.com/dominik1001/caldav-mcp/compare/v0.3.0...v0.4.0) (2026-02-11)


### Features

* **deps:** update mcp sdk to 1.26.0 ([b5b129c](https://github.com/dominik1001/caldav-mcp/commit/b5b129c8d9447bc0582009edff9669a1b9d1c3b6))

# [0.3.0](https://github.com/dominik1001/caldav-mcp/compare/v0.2.2...v0.3.0) (2026-02-11)


### Features

* add connection check on startup and handle connection errors ([095080e](https://github.com/dominik1001/caldav-mcp/commit/095080e5fdfc9f818bd6c9644dba6319fa2f5bd2))
* **dev:** add dev script and tsx for runtime development ([fcb75d0](https://github.com/dominik1001/caldav-mcp/commit/fcb75d07da52c212347a448c5eed0ca3ed2a6a4a))
* **server:** add connection status logging on startup ([bc30ba6](https://github.com/dominik1001/caldav-mcp/commit/bc30ba673e8480914357f3d09800ffb3b31e491c))

## [0.2.2](https://github.com/dominik1001/caldav-mcp/compare/v0.2.1...v0.2.2) (2026-02-09)


### Bug Fixes

* Accept both 200 and 204 status codes for delete-event ([e66aac8](https://github.com/dominik1001/caldav-mcp/commit/e66aac83923f21e41ac42d6e3f29be24f31475c8))
* Include uid field in list-events response to enable event deletion ([996ff36](https://github.com/dominik1001/caldav-mcp/commit/996ff360beca5aaf1ad45c88b027e92877488154))

## [0.2.1](https://github.com/dominik1001/caldav-mcp/compare/v0.2.0...v0.2.1) (2025-06-25)


### Bug Fixes

* remove barrel import ([18c96ab](https://github.com/dominik1001/caldav-mcp/commit/18c96abe6ffa5b56a2c5035527cb90c3737de44d))

# [0.2.0](https://github.com/dominik1001/caldav-mcp/compare/v0.1.3...v0.2.0) (2025-06-13)


### Features

* add list-calendars ([23ec5bd](https://github.com/dominik1001/caldav-mcp/commit/23ec5bd12132346290f62efa0b8bef03d2c95596))
