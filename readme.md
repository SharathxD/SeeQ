# SeeQ — See Speak Survive

## Overview
Mobile system enabling automated visual scene understanding and text extraction for blind and visually-impaired users. Provides real-time object detection, contextual captioning, language translation, OCR, and audio feedback. Gesture-controlled two-mode interface.

## Core Capabilities
- Continuous automatic scene analysis every 5 seconds.
- Object detection and spatial reasoning.
- Contextual caption generation.
- Indic language translation.
- OCR for printed text.
- Audio output through device TTS.
- Swipe to switch modes. Double-tap to capture in OCR mode.

## Modes

### VLM Mode
Camera frame → YOLOv11 → Spatial prompt → SmolVLM-256M → IndicTrans2 → Speech output.

### OCR Mode
Captured image → PaddleOCR + PP-OCRv5 → Text extraction → Speech output.

## Models
YOLOv11n
SmolVLM-256M Video Instruct  
IndicTrans2-en-200m  
PPP-OCRv5

## Architecture
React Native + Expo frontend.  
Flask backend providing inference services.

## API
POST /vlm → Returns translated caption.  
POST /ocr → Returns extracted text.

## Deployment Requirements
Backend: Python + PyTorch + model weights.  
Frontend: Expo + camera access + TTS.


## Future Scope
On-device inference.  
Multi-language OCR.  
Navigation integration.

## ToDO

- [X] Build README for FE/BE.
- [X] Give results for all
- [ ] Specify the configs of each model
- [-] better file structure
- [ ] UI changes if required
- [x] Fix ocr 


