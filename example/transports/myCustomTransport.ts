import {
  LogData,
  LogLevel,
  RequestInfo,
  StoreData,
  Transport
} from '../../src/interfaces'

class MyCustomTransport implements Transport {
  async log(
    level: LogLevel,
    message: string,
    meta: { request: RequestInfo; data: LogData; store: StoreData }
  ): Promise<void> {
    console.log(`Custom log: ${level} - ${message} - ${meta.request.method}`)
  }
}

export default MyCustomTransport
