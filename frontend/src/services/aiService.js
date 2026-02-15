import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY)

function normalizePassengerRecord(record) {
  return {
    full_name: (record.full_name || '').trim(),
    phone_number: (record.phone_number || '').replace(/\s/g, ''),
    email: (record.email || '').trim(),
    next_of_kin_name: (record.next_of_kin_name || '').trim(),
    next_of_kin_phone: (record.next_of_kin_phone || '').replace(/\s/g, ''),
    next_of_kin_email: (record.next_of_kin_email || '').trim()
  }
}

function parsePassengerJsonArray(rawText) {
  let cleanedText = (rawText || '').trim()
  cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  const firstBracket = cleanedText.indexOf('[')
  const lastBracket = cleanedText.lastIndexOf(']')
  if (firstBracket !== -1 && lastBracket !== -1) {
    cleanedText = cleanedText.substring(firstBracket, lastBracket + 1)
  }

  const parsed = JSON.parse(cleanedText)
  if (!Array.isArray(parsed)) {
    throw new Error('AI did not return an array')
  }

  return parsed.map(normalizePassengerRecord)
}

export async function extractPassengerData(extractedText) {
  try {
    // Try the experimental model (usually works better)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" })

    const prompt = `
You are an AI assistant that extracts passenger information from travel manifest text.

Extract ALL passengers from this manifest and return ONLY a valid JSON array (no markdown, no explanation, no extra text).

Each passenger object must have these exact fields:
{
  "full_name": "string",
  "phone_number": "string (format: +234 or 0)",
  "email": "string or empty",
  "next_of_kin_name": "string",
  "next_of_kin_phone": "string (format: +234 or 0)"
}

IMPORTANT RULES:
1. Fix OCR errors: O→0, I→1, l→1 in phone numbers
2. Phone format: Keep as 0803... or convert to +234803...
3. Remove spaces from phone numbers: "0803 123 4567" → "08031234567"
4. If email missing, use empty string ""
5. Extract EVERY passenger in the manifest
6. Return ONLY valid JSON array, no other text

Manifest Text:
${extractedText}

JSON Array:
`

    console.log('Sending request to Gemini AI...')
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()
    
    console.log('AI Response:', text)
    
    const passengers = parsePassengerJsonArray(text)
    return passengers
    
  } catch (error) {
    console.error('Error extracting passenger data:', error)
    throw new Error(`AI extraction failed: ${error.message}`)
  }
}

export async function extractPassengerDataFromImage(imageDataUrl) {
  try {
    if (!imageDataUrl || typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
      throw new Error('Invalid image payload for AI extraction')
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = `
You are extracting passenger data from a photographed physical travel manifest.

Return ONLY a valid JSON array. No markdown, no explanation.

Each array item must contain exactly these keys:
{
  "full_name": "string",
  "phone_number": "string",
  "email": "string",
  "next_of_kin_name": "string",
  "next_of_kin_phone": "string",
  "next_of_kin_email": "string"
}

Rules:
1. Extract all passengers visible in the image.
2. Clean OCR-like mistakes in phone numbers where possible.
3. If a value is unavailable, return empty string "".
4. Return only JSON array.
`

    const [, base64Data] = imageDataUrl.split(',')

    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data
        }
      }
    ])

    const responseText = result.response.text()
    return parsePassengerJsonArray(responseText)
  } catch (error) {
    console.error('Error extracting passenger data from image:', error)
    throw new Error(`AI image extraction failed: ${error.message}`)
  }
}