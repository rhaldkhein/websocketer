import { customAlphabet } from 'nanoid'

const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const nanoid = customAlphabet(chars)

export function generateId(len?: number) {
  return nanoid(len)
}
