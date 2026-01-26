import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY)

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
    
    // Clean the response
    let cleanedText = text.trim()
    
    // Remove markdown code blocks
    cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    
    // Remove any text before the first [ and after the last ]
    const firstBracket = cleanedText.indexOf('[')
    const lastBracket = cleanedText.lastIndexOf(']')
    
    if (firstBracket !== -1 && lastBracket !== -1) {
      cleanedText = cleanedText.substring(firstBracket, lastBracket + 1)
    }
    
    console.log('Cleaned JSON:', cleanedText)
    
    // Parse JSON
    const passengers = JSON.parse(cleanedText)
    
    // Validate passengers array
    if (!Array.isArray(passengers)) {
      throw new Error('AI did not return an array')
    }
    
    // Clean phone numbers (remove spaces)
    const cleanedPassengers = passengers.map(p => ({
      ...p,
      phone_number: p.phone_number?.replace(/\s/g, '') || '',
      next_of_kin_phone: p.next_of_kin_phone?.replace(/\s/g, '') || ''
    }))
    
    return cleanedPassengers
    
  } catch (error) {
    console.error('Error extracting passenger data:', error)
    throw new Error(`AI extraction failed: ${error.message}`)
  }
}