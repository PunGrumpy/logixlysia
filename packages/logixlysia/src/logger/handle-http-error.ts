import type { LogLevel, Options, RequestInfo, StoreData } from "../interfaces";
import { logToTransports } from "../output";
import { logToFile } from "../output/file";
import { parseError } from "../utils/error";
import { formatLine } from "./create-logger";

const isErrorWithStatus = (
  value: unknown
): value is { status: number; message?: string } =>
  typeof value === "object" &&
  value !== null &&
  "status" in value &&
  typeof (value as { status?: unknown }).status === "number";

export const handleHttpError = (
  request: RequestInfo,
  error: unknown,
  store: StoreData,
  options: Options
): void => {
  const { config } = options;

  const logFilter = config?.logFilter;
  if (
    logFilter?.level &&
    logFilter.level.length > 0 &&
    !logFilter.level.includes("ERROR")
  ) {
    return;
  }

  const useTransportsOnly = config?.useTransportsOnly === true;
  const disableInternalLogger = config?.disableInternalLogger === true;
  const disableFileLogging = config?.disableFileLogging === true;

  const status = isErrorWithStatus(error) ? error.status : 500;
  const message = parseError(error);

  const level: LogLevel = "ERROR";
  const data: Record<string, unknown> = { error, message, status };

  logToTransports({ data, level, options, request, store });

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

  const formattedMessage = formatLine({ data, level, options, request, store });
  console.error(formattedMessage);
};
