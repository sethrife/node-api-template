import { buildApp } from './app';
import {configureLogger} from "./utils/logger";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  const app = buildApp();

  configureLogger(app);

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Server is running on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
