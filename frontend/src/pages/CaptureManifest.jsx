import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Upload, ArrowRight, Loader, X } from 'lucide-react'
import Tesseract from 'tesseract.js'
import { success, error, warning, info } from '../utils/notifications'
import { extractPassengerData, extractPassengerDataFromImage } from '../services/aiService'

export default function CaptureManifest() {
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [extractedText, setExtractedText] = useState('')
  const [extractedPassengers, setExtractedPassengers] = useState([])
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const mobileCameraInputRef = useRef(null)
  const [cameraActive, setCameraActive] = useState(false)
  const navigate = useNavigate()
  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )

  const MAX_IMAGE_DIMENSION = 1600
  const IMAGE_QUALITY = 0.82

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview)
      }
    }
  }, [imagePreview])

  function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const sourceUrl = URL.createObjectURL(blob)
      const img = new Image()

      img.onload = () => {
        URL.revokeObjectURL(sourceUrl)
        resolve(img)
      }

      img.onerror = () => {
        URL.revokeObjectURL(sourceUrl)
        reject(new Error('Unable to load image'))
      }

      img.src = sourceUrl
    })
  }

  function toJpegBlob(canvas, quality = IMAGE_QUALITY) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Unable to encode image'))
        }
      }, 'image/jpeg', quality)
    })
  }

  async function optimizeImageBlob(blob) {
    const img = await loadImageFromBlob(blob)

    const sourceWidth = img.naturalWidth || img.width
    const sourceHeight = img.naturalHeight || img.height
    const largestSide = Math.max(sourceWidth, sourceHeight)

    let targetWidth = sourceWidth
    let targetHeight = sourceHeight

    if (largestSide > MAX_IMAGE_DIMENSION) {
      const scale = MAX_IMAGE_DIMENSION / largestSide
      targetWidth = Math.max(1, Math.round(sourceWidth * scale))
      targetHeight = Math.max(1, Math.round(sourceHeight * scale))
    }

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = targetWidth
    canvas.height = targetHeight
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

    const optimizedBlob = await toJpegBlob(canvas, IMAGE_QUALITY)
    return optimizedBlob
  }

  async function setImageFromBlob(blob) {
    const optimizedBlob = await optimizeImageBlob(blob)

    setImage((previousImage) => {
      if (previousImage && imagePreview) {
        URL.revokeObjectURL(imagePreview)
      }
      return optimizedBlob
    })

    const previewUrl = URL.createObjectURL(optimizedBlob)
    setImagePreview(previewUrl)
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  function openMobileNativeCamera() {
    mobileCameraInputRef.current?.click()
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      warning('Camera API unavailable', 'Opening your phone camera instead')
      openMobileNativeCamera()
      return
    }

    if (!window.isSecureContext) {
      warning('Secure context required', 'Camera preview requires HTTPS; opening phone camera instead')
      openMobileNativeCamera()
      return
    }

    try {
      let stream

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        })
      } catch (primaryError) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        })
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.muted = true
        await videoRef.current.play()
        setCameraActive(true)
        success('Camera ready!', 'Position the manifest clearly')
      }
    } catch (err) {
      console.error('Error accessing camera:', err)
      warning('Live camera unavailable', 'Opening your phone camera capture instead')
      openMobileNativeCamera()
    }
  }

  function stopCamera() {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks()
      tracks.forEach(track => track.stop())
      videoRef.current.srcObject = null
      setCameraActive(false)
    }
  }

  async function capturePhoto() {
    const canvas = canvasRef.current
    const video = videoRef.current
    
    if (!video || !canvas) {
      error('Camera not ready', 'Please try again')
      return
    }
    
    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720

    canvas.width = width
    canvas.height = height
    
    const context = canvas.getContext('2d')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    canvas.toBlob(async (blob) => {
      if (blob) {
        try {
          await setImageFromBlob(blob)
          stopCamera()
          success('Photo captured!', 'Ready to process')
        } catch (captureError) {
          console.error('Capture optimization failed:', captureError)
          error('Capture failed', 'Please retake photo with a clearer, closer shot')
        }
      }
    }, 'image/jpeg', 0.9)
  }

  async function handleFileUpload(e, source = 'upload') {
    const file = e.target.files[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        error('Invalid file type', 'Please upload an image file')
        return
      }

      if (file.size > 10 * 1024 * 1024) {
        error('File too large', 'Please upload an image below 10MB')
        return
      }

      try {
        if (file.type.startsWith('image/')) {
          await setImageFromBlob(file)
          success(source === 'camera' ? 'Photo captured!' : 'Image uploaded!', 'Ready to process')
        }
      } catch (uploadError) {
        console.error('Upload optimization failed:', uploadError)
        error('Image processing failed', 'Try another photo or use a lower-resolution image')
      }
    }

    e.target.value = ''
  }

  async function preprocessImage(imageBlob) {
    const img = await loadImageFromBlob(imageBlob)

    const sourceWidth = img.naturalWidth || img.width
    const sourceHeight = img.naturalHeight || img.height
    const largestSide = Math.max(sourceWidth, sourceHeight)

    let targetWidth = sourceWidth
    let targetHeight = sourceHeight

    if (largestSide > MAX_IMAGE_DIMENSION) {
      const scale = MAX_IMAGE_DIMENSION / largestSide
      targetWidth = Math.max(1, Math.round(sourceWidth * scale))
      targetHeight = Math.max(1, Math.round(sourceHeight * scale))
    }

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    canvas.width = targetWidth
    canvas.height = targetHeight
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3
      const contrast = 1.35
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
      const newValue = factor * (avg - 128) + 128

      data[i] = newValue
      data[i + 1] = newValue
      data[i + 2] = newValue
    }

    ctx.putImageData(imageData, 0, 0)
    return canvas
  }

  async function processImage() {
    if (!image) {
      error('No image selected', 'Please capture or upload an image first')
      return
    }

    setProcessing(true)
    setOcrProgress(0)
    setExtractedText('')
    setExtractedPassengers([])

    try {
      info('Analyzing image with AI...', 'Extracting passengers from the manifest photo')

      try {
        const imageDataUrl = await blobToDataUrl(image)
        const parsedPassengersFromImage = await extractPassengerDataFromImage(imageDataUrl)

        if (Array.isArray(parsedPassengersFromImage) && parsedPassengersFromImage.length > 0) {
          setExtractedPassengers(parsedPassengersFromImage)
          setExtractedText('AI extracted passenger details directly from the image.')
          success('Passengers auto-detected', `${parsedPassengersFromImage.length} passenger${parsedPassengersFromImage.length === 1 ? '' : 's'} extracted`)
          setProcessing(false)
          return
        }
      } catch (visionError) {
        console.error('AI image extraction error:', visionError)
      }

      info('Running OCR fallback...', 'Trying text extraction from the image')

      const processedImage = await preprocessImage(image)

      const result = await Tesseract.recognize(
        processedImage,
        'eng',
        {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              setOcrProgress(Math.round(m.progress * 100))
            }
          },
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@.-+() ',
        }
      )

      const text = result.data.text

      if (!text || text.trim().length < 20) {
        warning('Low quality extraction', 'The image may be unclear. You can add passengers manually.')
        setExtractedText(text || 'No text found')
      } else {
        success('Text extracted!', `Found ${text.length} characters`)
        setExtractedText(text)

        try {
          const parsedPassengers = await extractPassengerData(text)
          if (Array.isArray(parsedPassengers) && parsedPassengers.length > 0) {
            setExtractedPassengers(parsedPassengers)
            success('Passengers auto-detected', `${parsedPassengers.length} passenger${parsedPassengers.length === 1 ? '' : 's'} extracted`)
          } else {
            warning('No passengers auto-detected', 'You can continue and add passengers manually')
          }
        } catch (aiError) {
          console.error('AI extraction error:', aiError)
          warning('AI extraction unavailable', 'You can continue and enter passengers manually')
        }
      }

      setProcessing(false)

    } catch (err) {
      console.error('Error processing image:', err)
      error('Processing failed', 'You can still add passengers manually')
      setProcessing(false)
    }
  }

  function continueToEdit() {
    navigate('/edit-manifest', {
      state: {
        passengers: extractedPassengers,
        imageUrl: imagePreview,
        extractedText: extractedText
      }
    })
  }

  function resetCapture() {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview)
    }
    setImage(null)
    setImagePreview(null)
    setExtractedText('')
    setExtractedPassengers([])
    setOcrProgress(0)
    if (cameraActive) {
      stopCamera()
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-6 shadow-lg shadow-indigo-100">
        <h2 className="text-3xl font-bold">Capture Manifest</h2>
        <p className="text-indigo-50 mt-2">Upload or capture a manifest image, extract text, and continue to passenger validation.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          {!imagePreview ? (
            <div className="space-y-6">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Camera className="mr-2 text-blue-600" size={24} />
                  Take a Photo
                </h3>
                
                {!cameraActive ? (
                  <div className="space-y-3">
                    <button
                      onClick={startCamera}
                      className="w-full bg-blue-600 text-white py-4 rounded-lg flex items-center justify-center space-x-2 hover:bg-blue-700 transition-colors"
                    >
                      <Camera size={24} />
                      <span>Open Camera</span>
                    </button>
                    <button
                      onClick={openMobileNativeCamera}
                      className="w-full bg-slate-100 text-slate-700 py-3 rounded-lg hover:bg-slate-200 transition-colors text-sm"
                    >
                      Use Phone Camera (Mobile)
                    </button>
                    {isIOS && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        On iPhone (Safari): allow camera permission when prompted, and use HTTPS. If live preview does not open, tap <strong>Use Phone Camera (Mobile)</strong>.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative bg-black rounded-lg overflow-hidden">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full h-auto"
                        style={{ maxHeight: '400px' }}
                      />
                    </div>
                    <div className="flex space-x-3">
                      <button
                        onClick={capturePhoto}
                        className="flex-1 bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 font-semibold"
                      >
                        📸 Capture
                      </button>
                      <button
                        onClick={stopCamera}
                        className="px-6 bg-gray-600 text-white py-3 rounded-lg hover:bg-gray-700"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>
                )}
                
                <canvas ref={canvasRef} className="hidden" />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">OR</span>
                </div>
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Upload className="mr-2 text-purple-600" size={24} />
                  Upload an Image
                </h3>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  ref={fileInputRef}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full bg-purple-600 text-white py-4 rounded-lg flex items-center justify-center space-x-2 hover:bg-purple-700 transition-colors"
                >
                  <Upload size={24} />
                  <span>Choose File</span>
                </button>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Supports: JPG, PNG, JPEG
                </p>
              </div>

              <input
                ref={mobileCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => handleFileUpload(e, 'camera')}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
                <img
                  src={imagePreview}
                  alt="Manifest preview"
                  className="w-full h-auto"
                />
              </div>

              {!processing && !extractedText && (
                <div className="flex space-x-3">
                  <button
                    onClick={resetCapture}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200 font-semibold"
                  >
                    ↻ Retake
                  </button>
                  <button
                    onClick={processImage}
                    className="flex-1 bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 font-semibold flex items-center justify-center space-x-2"
                  >
                    <span>Extract Text</span>
                    <ArrowRight size={20} />
                  </button>
                </div>
              )}

              {extractedText && (
                <button
                  onClick={continueToEdit}
                  className="w-full bg-blue-600 text-white py-4 rounded-lg hover:bg-blue-700 font-semibold flex items-center justify-center space-x-2"
                >
                  <span>Continue to Add Passengers</span>
                  <ArrowRight size={20} />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">Extraction Results</h3>

          {!imagePreview && (
            <div className="text-center py-12 text-gray-400">
              <Camera size={64} className="mx-auto mb-4 opacity-30" />
              <p>Capture or upload a manifest to begin</p>
            </div>
          )}

          {processing && (
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-3 mb-4">
                <Loader className="animate-spin text-blue-600" size={32} />
                <span className="text-lg font-semibold text-blue-900">
                  Extracting Text...
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                  style={{ width: `${ocrProgress}%` }}
                ></div>
              </div>
              <p className="text-center text-sm text-blue-700">
                {ocrProgress}% Complete
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  💡 <strong>Tip:</strong> This process takes 30-60 seconds. Better image quality = better results!
                </p>
              </div>
            </div>
          )}

          {extractedText && !processing && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800 font-semibold mb-2">
                  ✓ Text Extraction Complete
                </p>
                <p className="text-xs text-green-700">
                  Found {extractedText.length} characters and {extractedPassengers.length} auto-detected passenger{extractedPassengers.length === 1 ? '' : 's'}. Review below before continuing.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50 max-h-96 overflow-y-auto">
                <p className="text-xs font-semibold text-gray-700 mb-2">Extracted Text:</p>
                <pre className="text-xs whitespace-pre-wrap text-gray-800 font-mono">
                  {extractedText}
                </pre>
              </div>

              <button
                onClick={resetCapture}
                className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 text-sm"
              >
                ↻ Try Another Image
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 text-center">
        <button
          onClick={() => navigate('/edit-manifest', { state: { passengers: [] } })}
          className="text-blue-600 hover:text-blue-800 underline font-medium"
        >
          Skip image capture and add passengers manually →
        </button>
      </div>
    </div>
  )
}