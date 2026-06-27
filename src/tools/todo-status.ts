import { z } from "zod";

/**
 * The VTODO `STATUS` values defined by RFC 5545 §3.8.1.11. Shared by the todo
 * tools so the writable status set stays in one place rather than one tool
 * depending on another (`list`/`update` previously imported it from `create`).
 */
export const todoStatusSchema = z.enum([
	"NEEDS-ACTION",
	"COMPLETED",
	"IN-PROCESS",
	"CANCELLED",
]);

export type TodoStatus = z.infer<typeof todoStatusSchema>;
