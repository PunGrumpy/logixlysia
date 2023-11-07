import pc from 'picocolors'

function statusString(status: number): string {
  if (status >= 500) {
    return pc.red(status.toString())
  }
  if (status >= 400) {
    return pc.yellow(status.toString())
  }
  if (status >= 300) {
    return pc.cyan(status.toString())
  }
  if (status >= 200) {
    return pc.green(status.toString())
  }

  return status.toString()
}

export { statusString }
