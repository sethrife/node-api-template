import {FastifyBaseLogger, FastifyInstance} from "fastify";
import {AsyncLocalStorage} from "node:async_hooks";

let baseLogger: FastifyBaseLogger;

export const configureLogger = (app: FastifyInstance) => {
    baseLogger = app.log;
}

export const contextLoggerStorage = new AsyncLocalStorage<FastifyBaseLogger>()

export const logger = () => contextLoggerStorage.getStore() ?? baseLogger;