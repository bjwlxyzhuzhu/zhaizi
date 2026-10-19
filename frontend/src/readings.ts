import lexicon from '../../backend/app/data/inscription-readings.json'

export function readingTokens(text: string): { text: string; reading: string }[] {
  const chars = lexicon.characters as Record<string, string>
  // Array.from iterates Unicode code points, including characters such as 𢦚.
  const points = Array.from(text)
  const contextReadings = new Map<number, string>()
  for (const [phrase, readings] of Object.entries(lexicon.phrases)) {
    const phrasePoints = Array.from(phrase)
    for (let i = 0; i <= points.length - phrasePoints.length; i++) {
      if (points.slice(i, i + phrasePoints.length).join('') !== phrase) continue
      readings.forEach((reading, j) => { if (reading) contextReadings.set(i + j, reading) })
    }
  }
  const tokens: { text: string; reading: string }[] = []
  points.forEach((char, i) => {
    const reading = contextReadings.get(i) || chars[char] ||
      (/\p{Script=Han}/u.test(char) && (char.codePointAt(0)! > 0xffff || /[\u3400-\u4dbf]/u.test(char)) ? '音未定' : '')
    const last = tokens[tokens.length - 1]
    if (!reading && last && !last.reading) last.text += char
    else tokens.push({ text: char, reading })
  })
  return tokens
}
