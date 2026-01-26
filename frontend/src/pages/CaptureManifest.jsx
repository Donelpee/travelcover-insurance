import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Upload, ArrowRight, Loader, X } from 'lucide-react'
import Tesseract from 'tesseract.js'
import { success, error, warning, info } from '../utils/notifications'

export default function CaptureManifest() {
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [extractedText, setExtractedText] = useState('')
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const [cameraActive, setCameraActive] = useState(false)
  const navigate = useNavigate()

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        } 
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraActive(true)
        success('Camera ready!', 'Position the manifest clearly')
      }
    } catch (err) {
      console.error('Error accessing camera:', err)
      error('Camera access denied', 'Please allow camera permissions in browser settings')
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

  function capturePhoto() {
    const canvas = canvasRef.current
    const video = videoRef.current
    
    if (!video || !canvas) {
      error('Camera not ready', 'Please try again')
      return
    }
    
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    
    const context = canvas.getContext('2d')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    canvas.toBlob((blob) => {
      if (blob) {
        setImage(blob)
        const url = URL.createObjectURL(blob)
        setImagePreview(url)
        stopCamera()
        success('Photo captured!', 'Ready to process')
      }
    }, 'image/jpeg', 0.95)
  }

  function handleFileUpload(e) {
    const file = e.target.files[0]
    if (file) {
      if (file.type.startsWith('image/')) {
        setImage(file)
        const url = URL.createObjectURL(file)
        setImagePreview(url)
        success('Image uploaded!', 'Ready to process')
      } else {
        error('Invalid file type', 'Please upload an image file')
      }
    }
  }

  function preprocessImage(imageUrl) {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        
        // Set canvas to image dimensions
        canvas.width = img.width
        canvas.height = img.height
        
        // Draw original image
        ctx.drawImage(img, 0, 0)
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data
        
        // Convert to grayscale and increase contrast
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3
          // Increase contrast
          const contrast = 1.5
          const factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
          const newValue = factor * (avg - 128) + 128
          
          data[i] = newValue     // Red
          data[i + 1] = newValue // Green
          data[i + 2] = newValue // Blue
        }
        
        ctx.putImageData(imageData, 0, 0)
        resolve(canvas.toDataURL('image/jpeg', 0.95))
      }
      img.src = imageUrl
    })
  }

  async function processImage() {
    if (!image) {
      error('No image selected', 'Please capture or upload an image first')
      return
    }

    setProcessing(true)
    setOcrProgress(0)
    setExtractedText('')

    try {
      info('Processing image...', 'This may take 30-60 seconds')

      // Preprocess image for better OCR
      const processedImage = await preprocessImage(imagePreview)

      // Step 1: OCR with Tesseract
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
        passengers: [],
        imageUrl: imagePreview,
        extractedText: extractedText
      }
    })
  }

  function resetCapture() {
    setImage(null)
    setImagePreview(null)
    setExtractedText('')
    setOcrProgress(0)
    if (cameraActive) {
      stopCamera()
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-800 mb-8">Capture Manifest</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Image Capture/Upload */}
        <div className="bg-white rounded-lg shadow p-6">
          {!imagePreview ? (
            <div className="space-y-6">
              {/* Camera Section */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Camera className="mr-2 text-blue-600" size={24} />
                  Take a Photo
                </h3>
                
                {!cameraActive ? (
                  <button
                    onClick={startCamera}
                    className="w-full bg-blue-600 text-white py-4 rounded-lg flex items-center justify-center space-x-2 hover:bg-blue-700 transition-colors"
                  >
                    <Camera size={24} />
                    <span>Open Camera</span>
                  </button>
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

              {/* Upload Section */}
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
            </div>
          ) : (
            <div className="space-y-4">
              {/* Image Preview */}
              <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
                <img
                  src={imagePreview}
                  alt="Manifest preview"
                  className="w-full h-auto"
                />
              </div>

              {/* Action Buttons */}
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

        {/* Right Column - Processing Status & Extracted Text */}
        <div className="bg-white rounded-lg shadow p-6">
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
                  Found {extractedText.length} characters. Review below and add passengers manually.
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

      {/* Skip Option */}
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