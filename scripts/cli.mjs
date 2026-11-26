// Shared by the scripts in this folder: run a module's CLI only when it is the entry point, and turn errors into exit 1.
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function isEntryPoint(moduleUrl) {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(moduleUrl))
  } catch {
    return false
  }
}

// Runs `main(args)`; its return value is the exit code (0 when undefined). A thrown error prints its message only.
export async function runCli(moduleUrl, main) {
  if (!isEntryPoint(moduleUrl)) return

  try {
    process.exitCode = (await main(process.argv.slice(2))) ?? 0
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}

// The value of `--name value` or `--name=value`; undefined when absent, an error when present without a value.
export function flagValue(args, name) {
  const inline = args.find(a => a.startsWith(`${name}=`))
  if (inline !== undefined) {
    const value = inline.slice(name.length + 1)
    if (!value) throw new Error(`${name} needs a value: ${name} VALUE or ${name}=VALUE.`)
    return value
  }

  const at = args.indexOf(name)
  if (at === -1) return undefined

  const value = args[at + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a value: ${name} VALUE or ${name}=VALUE.`)
  return value
}
