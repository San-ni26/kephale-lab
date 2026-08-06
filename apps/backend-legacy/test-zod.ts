import { z } from 'zod';
const CreateLiveSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
});
const result = CreateLiveSchema.safeParse({ scheduledAt: null });
console.log(result.success ? "Success" : result.error.errors);
