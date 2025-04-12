import { HttpMethodColorMap } from './color-mapping'

export default function methodString(
  method: string,
  useColors: boolean
): string {
  const colorFunction = HttpMethodColorMap[method]
  return useColors && colorFunction
    ? colorFunction(method.padEnd(7))
    : method.padEnd(7)
}
