import { z } from "zod";

export const sessionSchema = z.object({
  name: z.string().trim().max(80),
  courts: z.number().int().min(1).max(8),
  players: z.array(z.string().trim().min(1).max(50)).min(2).max(32),
});
