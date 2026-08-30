export const SELA_PIX_KEY = "60.607.671/0001-47";

function field(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

function normalize(value: string, max: number) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 $%*+\-./:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, max);
}

export function pixCrc16(value: string) {
  let crc = 0xffff;
  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function createPixPayload(input: { amount: number; studentName: string }) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("O valor do Pix deve ser maior que zero.");
  }
  const key = SELA_PIX_KEY.replace(/\D/g, "");
  const description = normalize(`Materiais Sela - ${input.studentName}`, 50);
  const merchantAccount = field("00", "BR.GOV.BCB.PIX") + field("01", key) + field("02", description);
  const additionalData = field("05", "***");
  const payload =
    field("00", "01") +
    field("26", merchantAccount) +
    field("52", "0000") +
    field("53", "986") +
    field("54", input.amount.toFixed(2)) +
    field("58", "BR") +
    field("59", "SELA CERAMICA") +
    field("60", "SAO PAULO") +
    field("62", additionalData) +
    "6304";
  return payload + pixCrc16(payload);
}
