import Elysia from "elysia"
import * as pc from "picocolors"
import process from "process"

export const logger = () =>
    new Elysia({
        name: "@grotto/logysia"
    })
        .onBeforeHandle((ctx) => {
            ctx.store = { beforeTime: process.hrtime(), ...ctx.store }
        })
        .onAfterHandle(({ request, store }) => {
            const logStr: string[] = []
            if (request.headers.get("X-Forwarded-For")) {
                logStr.push(`[${pc.cyan(request.headers.get("X-Forwarded-For"))}]`)
            }

            logStr.push(methodString(request.method))

            logStr.push(new URL(request.url).pathname)
            const beforeTime: [number, number] = (store as any).beforeTime;

            logStr.push(durationString(beforeTime))

            console.log(logStr.join(" "))
        })
        .onError(({ request, error, store }) => {
            const logStr: string[] = []

            logStr.push(pc.red(methodString(request.method)))

            logStr.push(new URL(request.url).pathname)

            logStr.push(pc.red("Error"))

            if ("status" in error) {
                logStr.push(String(error.status))
            }

            logStr.push(error.message)
            const beforeTime: [number, number] = (store as any).beforeTime;
            logStr.push(durationString(beforeTime))

            console.log(logStr.join(" "))
        })

function durationString(beforeTime: [number, number]): string {
    const [seconds, nanoseconds] = process.hrtime(beforeTime)
    const durationInMicroseconds = (seconds * 1e9 + nanoseconds) / 1e3 // Convert to microseconds
    const durationInMilliseconds = (seconds * 1e9 + nanoseconds) / 1e6 // Convert to milliseconds
    let timeMessage: string = ""
    if (seconds > 0) {
        timeMessage = `| ${seconds.toPrecision(2)}s`
    } else if (durationInMilliseconds > 1) {
        timeMessage = `| ${durationInMilliseconds.toPrecision(2)}ms`
    } else if (durationInMicroseconds > 1) {
        timeMessage = `| ${durationInMicroseconds.toPrecision(4)}µs`
    } else if (nanoseconds > 0) {
        timeMessage = `| ${nanoseconds.toPrecision(4)}ns`
    }

    return timeMessage
}

function methodString(method: string): string {
    switch (method) {
        case "GET":
            // Handle GET request
            return pc.white("GET")

        case "POST":
            // Handle POST request
            return pc.yellow("POST")

        case "PUT":
            // Handle PUT request
            return pc.blue("PUT")

        case "DELETE":
            // Handle DELETE request
            return pc.red("DELETE")

        case "PATCH":
            // Handle PATCH request
            return pc.green("PATCH")

        case "OPTIONS":
            // Handle OPTIONS request
            return pc.gray("OPTIONS")

        case "HEAD":
            // Handle HEAD request
            return pc.magenta("HEAD")

        default:
            // Handle unknown request method
            return method
    }
}
