export function generatePaymentNo(lastNo?: string) {
  const year = new Date().getFullYear()

  if (!lastNo) {
    return `PIN-${year}-0001`
  }

  const parts = lastNo.split("-")
  const seq = parseInt(parts[2]) + 1

  return `PIN-${year}-${seq.toString().padStart(4, "0")}`
}
