import { FaceLandmarker, PoseLandmarker, HandLandmarker, FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";

// Globally intercept console.error/console.warn to block MediaPipe WASM internal logs from triggering Next.js error overlays in development
if (typeof window !== "undefined") {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    if (args[0] && typeof args[0] === 'string') {
      const msg = args[0].toLowerCase();
      if (msg.includes('xnnpack') || msg.includes('delegate') || msg.includes('opengl') || msg.includes('feedback manager')) {
        return;
      }
    }
    originalError(...args);
  };

  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (args[0] && typeof args[0] === 'string') {
      const msg = args[0].toLowerCase();
      if (msg.includes('xnnpack') || msg.includes('delegate') || msg.includes('opengl') || msg.includes('feedback manager')) {
        return;
      }
    }
    originalWarn(...args);
  };
}

let faceLandmarker: FaceLandmarker | null = null;
let poseLandmarker: PoseLandmarker | null = null;
let objectDetector: ObjectDetector | null = null;
let handLandmarker: HandLandmarker | null = null;
let faceLandmarkerPromise: Promise<FaceLandmarker | null> | null = null;
let poseLandmarkerPromise: Promise<PoseLandmarker | null> | null = null;
let objectDetectorPromise: Promise<ObjectDetector | null> | null = null;
let handLandmarkerPromise: Promise<HandLandmarker | null> | null = null;
let filesetResolver: any = null;
let filesetResolverPromise: Promise<any> | null = null;

async function getFilesetResolver() {
  if (typeof window === "undefined") return null;
  if (filesetResolver) return filesetResolver;
  if (filesetResolverPromise) return filesetResolverPromise;

  filesetResolverPromise = (async () => {
    try {
      filesetResolver = await FilesetResolver.forVisionTasks(
        "/mediapipe/wasm"
      );
      return filesetResolver;
    } catch (e) {
      console.error("Failed to resolve fileset resolver:", e);
      return null;
    } finally {
      filesetResolverPromise = null;
    }
  })();

  return filesetResolverPromise;
}

export async function initFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;
  if (faceLandmarkerPromise) return faceLandmarkerPromise;

  faceLandmarkerPromise = (async () => {
    try {
      const resolver = await getFilesetResolver();
      if (!resolver) return null;
      faceLandmarker = await FaceLandmarker.createFromOptions(resolver, {
        baseOptions: {
          modelAssetPath: "/mediapipe/face_landmarker.task",
          delegate: "CPU",
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 4,
      });
      return faceLandmarker;
    } catch (error: any) {
      console.error("Failed to initialize Face Landmarker:", error?.message || error?.toString() || JSON.stringify(error));
      return null;
    } finally {
      faceLandmarkerPromise = null;
    }
  })();

  return faceLandmarkerPromise;
}

export async function initPoseLandmarker() {
  if (poseLandmarker) return poseLandmarker;
  if (poseLandmarkerPromise) return poseLandmarkerPromise;

  poseLandmarkerPromise = (async () => {
    try {
      const resolver = await getFilesetResolver();
      if (!resolver) return null;
      poseLandmarker = await PoseLandmarker.createFromOptions(resolver, {
        baseOptions: {
          modelAssetPath: "/mediapipe/pose_landmarker_lite.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      return poseLandmarker;
    } catch (error: any) {
      console.error("Failed to initialize Pose Landmarker:", error?.message || error?.toString() || JSON.stringify(error));
      return null;
    } finally {
      poseLandmarkerPromise = null;
    }
  })();

  return poseLandmarkerPromise;
}

export async function initHandLandmarker() {
  if (handLandmarker) return handLandmarker;
  if (handLandmarkerPromise) return handLandmarkerPromise;

  handLandmarkerPromise = (async () => {
    try {
      const resolver = await getFilesetResolver();
      if (!resolver) return null;
      handLandmarker = await HandLandmarker.createFromOptions(resolver, {
        baseOptions: {
          modelAssetPath: "/mediapipe/hand_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      });
      return handLandmarker;
    } catch (error: any) {
      console.error("Failed to initialize Hand Landmarker:", error?.message || error?.toString() || JSON.stringify(error));
      return null;
    } finally {
      handLandmarkerPromise = null;
    }
  })();

  return handLandmarkerPromise;
}

export interface VisionMetricsSnapshot {
  eye_contact_score: number;
  head_yaw: number;
  head_pitch: number;
  posture_score: number;
  face_visible: boolean;
  movement_stability: number;
  looking_down: boolean;
  shoulder_alignment: number;
  inappropriate_gesture: boolean;
  multiple_people_detected: boolean;
}

export function resetVisionSession() {
  lastBboxCenter = null;
}

// Simple moving average for stability tracking
let lastBboxCenter: { x: number, y: number } | null = null;

// Diagnostic counter for face detection failures
let faceDetectionFailCount = 0;
const MAX_FACE_FAIL_LOGS = 10;

export function extractVisionMetrics(videoElement: HTMLVideoElement, timestamp: number): VisionMetricsSnapshot | null {
  if (!faceLandmarker) return null;

  // MediaPipe needs a valid video frame with width > 0, height > 0, and readyState >= HAVE_CURRENT_DATA (2)
  if (videoElement.readyState < 2 || !videoElement.videoWidth || !videoElement.videoHeight) {
    return null;
  }

  // Suppress MediaPipe's harmless XNNPACK info masquerading as an error
  const originalError = console.error;
  console.error = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].includes('XNNPACK delegate')) return;
    originalError(...args);
  };
  
  let results;
  try {
    results = faceLandmarker.detectForVideo(videoElement, timestamp);
  } catch (err) {
    console.warn("MediaPipe detect error:", err);
    return null;
  } finally {
    console.error = originalError;
  }
  
  let faceVisible = false;
  let head_yaw = 0;
  let head_pitch = 0;
  let looking_down = false;
  let eye_contact_score = 0.5; // Neutral default if face not seen
  let posture_score = 0.5; // Neutral default
  let movement_stability = 0.5;
  let multiple_people_detected = false;

  if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
    // Reset fail counter on successful detection
    faceDetectionFailCount = 0;
    faceVisible = true;
    if (results.faceLandmarks.length > 1) {
      multiple_people_detected = true;
    }
    const landmarks = results.faceLandmarks[0];

    // Head Orientation (approximate based on nose and eye points)
    const nose = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    
    // Approximate yaw based on distance between nose and eyes
    const leftDist = Math.abs(nose.x - leftEye.x);
    const rightDist = Math.abs(nose.x - rightEye.x);
    const yawRatio = leftDist / (rightDist + 0.0001);
    // Transform ratio to a rough degree (-45 to 45)
    head_yaw = (1 - yawRatio) * 45;
    head_yaw = Math.max(-45, Math.min(45, head_yaw));

    // Pitch (improved) - compare nose Y to eyes Y
    const eyesCenterY = (leftEye.y + rightEye.y) / 2;
    const mouthCenterY = (landmarks[13].y + landmarks[14].y) / 2; // upper and lower lip
    const faceHeight = Math.abs(mouthCenterY - eyesCenterY);
    
    // Normalized pitch diff based on face size
    const pitchRatio = (nose.y - eyesCenterY) / (faceHeight + 0.0001);
    // normal ratio is ~0.4. >0.5 looking down, <0.3 looking up
    head_pitch = (pitchRatio - 0.4) * 100;
    head_pitch = Math.max(-45, Math.min(45, head_pitch));
    
    looking_down = head_pitch > 15;

    // Eye Contact - based on blendshapes if available
    eye_contact_score = 1.0;
    if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
      const shapes = results.faceBlendshapes[0].categories;
      // Look for eye gaze shapes
      const eyeLookDownL = shapes.find(s => s.categoryName === "eyeLookDownLeft")?.score || 0;
      const eyeLookUpL = shapes.find(s => s.categoryName === "eyeLookUpLeft")?.score || 0;
      const eyeLookInL = shapes.find(s => s.categoryName === "eyeLookInLeft")?.score || 0;
      const eyeLookOutL = shapes.find(s => s.categoryName === "eyeLookOutLeft")?.score || 0;
      
      const eyeLookDownR = shapes.find(s => s.categoryName === "eyeLookDownRight")?.score || 0;
      const eyeLookUpR = shapes.find(s => s.categoryName === "eyeLookUpRight")?.score || 0;
      const eyeLookInR = shapes.find(s => s.categoryName === "eyeLookInRight")?.score || 0;
      const eyeLookOutR = shapes.find(s => s.categoryName === "eyeLookOutRight")?.score || 0;
      
      // Penalty if gaze is extreme
      const leftPenalty = Math.max(eyeLookDownL, eyeLookUpL, eyeLookInL, eyeLookOutL);
      const rightPenalty = Math.max(eyeLookDownR, eyeLookUpR, eyeLookInR, eyeLookOutR);
      eye_contact_score = 1.0 - ((leftPenalty + rightPenalty) / 2);
    } else {
      // Fallback: if head is turned too much, eye contact is low
      if (Math.abs(head_yaw) > 15 || head_pitch > 15) {
        eye_contact_score = 0;
      }
    }
    
    // Posture (Y position of face in frame)
    // Assume optimal posture puts face in upper middle
    posture_score = 1.0 - Math.min(1, Math.abs(nose.y - 0.4) * 2);

    // Movement Stability
    movement_stability = 1.0;
    if (lastBboxCenter) {
      const dx = nose.x - lastBboxCenter.x;
      const dy = nose.y - lastBboxCenter.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      movement_stability = 1.0 - Math.min(1.0, dist * 10);
    }
    lastBboxCenter = { x: nose.x, y: nose.y };
  } else {
    // Face not detected — log diagnostics for first N failures
    faceDetectionFailCount++;
    if (faceDetectionFailCount <= MAX_FACE_FAIL_LOGS) {
      console.warn(
        `[Vision] Face not detected (${faceDetectionFailCount}/${MAX_FACE_FAIL_LOGS}). ` +
        `Video: ${videoElement.videoWidth}x${videoElement.videoHeight}, readyState=${videoElement.readyState}. ` +
        `faceLandmarks=${results?.faceLandmarks?.length ?? 'null'}`
      );
    }
    lastBboxCenter = null;
  }

  // Pose/Shoulder tracking
  let shoulder_alignment = 1.0;
  let pose_posture_score = posture_score; // fallback to face Y
  
  if (poseLandmarker) {
    try {
      const poseResults = poseLandmarker.detectForVideo(videoElement, timestamp);
      if (poseResults && poseResults.landmarks && poseResults.landmarks.length > 0) {
        const pose = poseResults.landmarks[0];
        const leftShoulder = pose[11];
        const rightShoulder = pose[12];
        if (leftShoulder && rightShoulder) {
          // Alignment based on Y difference
          const yDiff = Math.abs(leftShoulder.y - rightShoulder.y);
          shoulder_alignment = Math.max(0, 1.0 - (yDiff * 5));
          
          // Real posture score based on shoulder alignment and vertical position
          const shoulderAvgY = (leftShoulder.y + rightShoulder.y) / 2;
          pose_posture_score = Math.max(0, 1.0 - Math.min(1, Math.abs(shoulderAvgY - 0.7) * 2));
          // average the alignment and vertical position
          pose_posture_score = (pose_posture_score + shoulder_alignment) / 2;
        }
      }
    } catch (e) {
      console.warn("Pose detection error:", e);
    }
  }

  // Hand tracking / Gesture logic
  let inappropriate_gesture = false;
  if (handLandmarker) {
    try {
      const handResults = handLandmarker.detectForVideo(videoElement, timestamp);
      if (handResults && handResults.landmarks && handResults.landmarks.length > 0) {
        for (const hand of handResults.landmarks) {
          // Landmarks: 0: wrist, 8: index tip, 12: middle tip, 16: ring tip, 20: pinky tip
          // 5, 9, 13, 17 are the MCP (knuckles)
          const indexKnuckle = hand[5];
          const indexTip = hand[8];
          const middleKnuckle = hand[9];
          const middleTip = hand[12];
          const ringKnuckle = hand[13];
          const ringTip = hand[16];
          const pinkyKnuckle = hand[17];
          const pinkyTip = hand[20];
          
          // Y-coordinate is 0 at top, 1 at bottom.
          // "Up" means lower Y value.
          // First, ensure the hand is generally upright (wrist is below knuckles)
          const wrist = hand[0];
          const isUpright = wrist.y > middleKnuckle.y + 0.1;
          
          // Middle finger is up if tip.y < knuckle.y
          const isMiddleUp = middleTip.y < middleKnuckle.y - 0.08;
          // Other fingers are curled if tip.y > knuckle.y
          const isIndexCurled = indexTip.y > indexKnuckle.y;
          const isRingCurled = ringTip.y > ringKnuckle.y;
          const isPinkyCurled = pinkyTip.y > pinkyKnuckle.y;

          if (isUpright && isMiddleUp && isIndexCurled && isRingCurled && isPinkyCurled) {
            inappropriate_gesture = true;
            console.warn("Inappropriate gesture detected.");
          }
        }
      }
    } catch (e) {
      console.warn("Hand detection error:", e);
    }
  }

  return {
    eye_contact_score: Math.max(0, eye_contact_score),
    head_yaw,
    head_pitch,
    posture_score: Math.max(0, pose_posture_score),
    face_visible: faceVisible,
    movement_stability: Math.max(0, movement_stability),
    looking_down,
    shoulder_alignment: Math.max(0, shoulder_alignment),
    inappropriate_gesture,
    multiple_people_detected,
  };
}

export async function initObjectDetector() {
  if (objectDetector) return objectDetector;
  if (objectDetectorPromise) return objectDetectorPromise;

  objectDetectorPromise = (async () => {
    try {
      const resolver = await getFilesetResolver();
      if (!resolver) return null;
      objectDetector = await ObjectDetector.createFromOptions(resolver, {
        baseOptions: {
          modelAssetPath: "/mediapipe/efficientdet.tflite",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        scoreThreshold: 0.15,
      });
      return objectDetector;
    } catch (error: any) {
      console.error("Failed to initialize Object Detector:", error?.message || error?.toString() || JSON.stringify(error));
      return null;
    } finally {
      objectDetectorPromise = null;
    }
  })();

  return objectDetectorPromise;
}


export function detectPhone(videoElement: HTMLVideoElement, timestamp: number): boolean {
  if (!objectDetector) return false;

  // Validate video frames before running detector
  if (videoElement.readyState < 2 || !videoElement.videoWidth || !videoElement.videoHeight) {
    return false;
  }

  const originalError = console.error;
  console.error = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].includes('XNNPACK delegate')) return;
    originalError(...args);
  };

  try {
    const results = objectDetector.detectForVideo(videoElement, timestamp);
    if (results && results.detections) {
      for (const detection of results.detections) {
        if (detection.categories && detection.categories.length > 0) {
          const category = detection.categories[0];
          const label = category.categoryName.toLowerCase();
          
          // Debug log removed to prevent console spam
          
          // Match "cell phone", "phone", "mobile phone", "telephone" with high confidence
          if (
            (label.includes("phone") || 
            label === "cell phone" || 
            label === "telephone" || 
            label === "mobile phone") &&
            category.score > 0.85
          ) {
            console.warn("CELL PHONE DETECTED in webcam!", category.score);
            return true;
          }
        }
      }
    }
  } catch (err) {
    console.warn("ObjectDetector runtime error:", err);
  } finally {
    console.error = originalError;
  }

  return false;
}
