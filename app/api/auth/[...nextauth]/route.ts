import { handlers } from "@/auth";

// Prisma and nodemailer both need Node APIs, so this handler cannot run on Edge.
export const runtime = "nodejs";

export const { GET, POST } = handlers;
