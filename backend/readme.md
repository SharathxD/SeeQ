# SeeQ Backend

## Purpose
Inference pipeline handling object detection, captioning, translation, and OCR.

## Workflow
VLM Mode:  
Image → YOLOv11 → Spatial prompt → SmolVLM → IndicTrans2 → Caption response.

OCR Mode:  
Image → PaddleOCR + PP-OCRv5 → Extracted text response.

## API Endpoints
POST /vlm  
Input: image frame (base64 or multipart)  
Output: translated caption text

POST /ocr  
Input: image frame  
Output: extracted English text

## Tech Stack
Python 3.10+  
Flask  
PyTorch  
YOLOv11  
SmolVLM-256M Video Instruct  
IndicTrans2-en-200m  
PP-OCRv5


