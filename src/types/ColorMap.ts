/**
 * @interface ColorMap
 *
 * @property {string} key The color function.
 */
interface ColorMap {
  [key: string]: (str: string) => string
}

export { ColorMap }
