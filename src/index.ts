import Elysia from "elysia";
import * as pc from "picocolors"
import process from "process";

export function logger() {


    return (app: Elysia) => {
        app.onBeforeHandle(ctx => {
            ctx.store = { beforeTime: process.hrtime(), ...ctx.store }
        })
        app.onAfterHandle(({ request, store }) => {
            const logStr: string[] = [];
            if (request.headers.get("X-Forwarded-For")) {
                logStr.push(`[${pc.cyan(request.headers.get("X-Forwarded-For"))}]`)
            }

            switch (request.method) {
                case 'GET':
                    // Handle GET request
                    logStr.push(pc.white("GET"));
                    break;

                case 'POST':
                    // Handle POST request
                    logStr.push(pc.yellow("POST"))
                    break;

                case 'PUT':
                    // Handle PUT request
                    logStr.push(pc.blue("POST"))

                    break;

                case 'DELETE':
                    // Handle DELETE request
                    logStr.push(pc.red("DELETE"))
                    break;

                case 'PATCH':
                    // Handle PATCH request
                    logStr.push(pc.green("PATCH"))
                    break;

                case 'OPTIONS':
                    // Handle OPTIONS request
                    logStr.push(pc.gray("OPTIONS"))
                    break;

                case 'HEAD':
                    // Handle HEAD request
                    logStr.push(pc.magenta("HEAD"))
                    break;

                default:
                    // Handle unknown request method
                    logStr.push(request.method);
            }


            const url = new URL(request.url)
            logStr.push(pc.white(url.pathname));

            // Duration
            const [seconds, nanoseconds] = process.hrtime((store as any).beforeTime);
            const durationInMicroseconds = (seconds * 1e9 + nanoseconds) / 1e3; // Convert to microseconds
            const durationInMilliseconds = (seconds * 1e9 + nanoseconds) / 1e6; // Convert to milliseconds
            let timeMessage: string = "";
            if (seconds > 0) {
                timeMessage = `| ${seconds.toPrecision(2)}`
            } else if (durationInMilliseconds > 1) {
                timeMessage = `| ${durationInMilliseconds.toPrecision(2)}ms`
            } else if (durationInMicroseconds > 1) {
                timeMessage = `| ${durationInMicroseconds.toPrecision(4)}µs`
            } else if (nanoseconds > 0) {
                timeMessage = `| ${nanoseconds.toPrecision(4)}ns`
            }

            logStr.push(pc.gray(timeMessage))

            console.log(logStr.join(" "))
        })


        return app;
    }

}