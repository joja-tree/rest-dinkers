import { z } from "zod";

export const sessionSchema = z.object({
  name: z.string().trim().max(80),
  courts: z.number().int().min(1).max(8),
  players: z.array(z.string().trim().min(1).max(50)).min(4).max(32),
}).refine((value) => value.players.length >= value.courts * 4 || value.players.length >= 4, {
  message: "At least four players are required.",
});
