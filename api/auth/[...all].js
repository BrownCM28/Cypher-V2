import { auth } from "../../lib/auth.js";
import { toNodeHandler } from "better-auth/node";

const handler = toNodeHandler(auth);

export default handler;
