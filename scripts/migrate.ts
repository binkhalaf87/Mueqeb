/**
 * التشغيل: npm run db:migrate (يقرأ DATABASE_URL من البيئة أو .env.local)
 * على Railway يعمل تلقائياً قبل كل نشر (preDeployCommand في railway.json).
 */
import { config } from "dotenv";
import { migrate } from "../db/migrator";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL مطلوب");
  process.exit(1);
}
migrate(url).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
