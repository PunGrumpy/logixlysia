import pino from "pino";

import type {
  LogFilter,
  Logger,
  LogLevel,
  Options,
  Pino,
  RequestInfo,
  StoreData,
} from "../interfaces";
import { logToTransports } from "../output";
import { logToFile } from "../output/file";
import { formatLine } from "./create-logger";
import { handleHttpError } from "./handle-http-error";

export const createLogger = (
  options: Options = {},
  pinoFactory: typeof pino = pino
): Logger => {
  const { config } = options;

  const pinoConfig = config?.pino;
  const { prettyPrint, ...pinoOptions } = pinoConfig ?? {};

  const prettyPrintOptions =
    typeof prettyPrint === "object" && prettyPrint !== null
      ? (prettyPrint as Record<string, unknown>)
      : undefined;

  const enablePrettyPrint =
    prettyPrint === true || prettyPrintOptions !== undefined;

  const shouldPrettyPrint =
    enablePrettyPrint && pinoOptions.transport === undefined;

  const messageKey =
    (prettyPrintOptions?.messageKey as string | undefined) ??
    pinoOptions.messageKey;
  const errorKey =
    (prettyPrintOptions?.errorKey as string | undefined) ??
    pinoOptions.errorKey;

  const transport = shouldPrettyPrint
    ? {
        options: {
          colorize: process.stdout?.isTTY === true,
          translateTime: config?.timestamp?.translateTime,
          ...prettyPrintOptions,
          messageKey,
          errorKey,
        },
        target: "pino-pretty",
      }
    : pinoOptions.transport;

  const pinoLogger: Pino = pinoFactory({
    ...pinoOptions,
    errorKey,
    level: pinoOptions.level ?? "info",
    messageKey,
    transport,
  });

  const shouldLog = (level: LogLevel, logFilter?: LogFilter): boolean => {
    if (!logFilter?.level || logFilter.level.length === 0) {
      return true;
    }
    return logFilter.level.includes(level);
  };

  const log = (
    level: LogLevel,
    request: RequestInfo,
    data: Record<string, unknown>,
    store: StoreData
  ): void => {
    // Check if this log level should be filtered
    if (!shouldLog(level, config?.logFilter)) {
      return;
    }

    logToTransports({ data, level, options, request, store });

    const useTransportsOnly = config?.useTransportsOnly === true;
    const disableInternalLogger = config?.disableInternalLogger === true;
    const disableFileLogging = config?.disableFileLogging === true;

    if (!(useTransportsOnly || disableFileLogging)) {
      const filePath = config?.logFilePath;
      if (filePath) {
        logToFile({ data, filePath, level, options, request, store }).catch(
          () => {
            // Ignore errors
          }
        );
      }
    }

    if (useTransportsOnly || disableInternalLogger) {
      return;
    }

    const message = formatLine({ data, level, options, request, store });

    switch (level) {
      case "DEBUG": {
        console.debug(message);
        break;
      }
      case "INFO": {
        console.info(message);
        break;
      }
      case "WARNING": {
        console.warn(message);
        break;
      }
      case "ERROR": {
        console.error(message);
        break;
      }
      default: {
        console.log(message);
        break;
      }
    }
  };

  const logWithContext = (
    level: LogLevel,
    request: RequestInfo,
    message: string,
    context?: Record<string, unknown>
  ): void => {
    const store: StoreData = { beforeTime: process.hrtime.bigint() };
    log(level, request, { context, message }, store);
  };

  return {
    debug: (request, message, context) => {
      logWithContext("DEBUG", request, message, context);
    },
    error: (request, message, context) => {
      logWithContext("ERROR", request, message, context);
    },
    handleHttpError: (request, error, store) => {
      handleHttpError(request, error, store, options);
    },
    info: (request, message, context) => {
      logWithContext("INFO", request, message, context);
    },
    log,
    pino: pinoLogger,
    warn: (request, message, context) => {
      logWithContext("WARNING", request, message, context);
    },
  };
};
