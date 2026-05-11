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
