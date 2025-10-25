import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TouchableOpacity,
    Dimensions,
    SafeAreaView,
    Animated,
    Easing,
    Button,
    Platform,
} from 'react-native';
import {
    CameraType,
    CameraView,
    useCameraPermissions,
    CameraCapturedPicture,
} from 'expo-camera';
import { Image } from 'expo-image';
import { 
    PanGestureHandler, 
    State, 
    PanGestureHandlerStateChangeEvent, 
    TapGestureHandler, 
    GestureHandlerRootView 
} from 'react-native-gesture-handler';
import * as Speech from 'expo-speech'; 

// --- COLOR PALETTE DEFINITION ---
const COLORS = {
    SAND: '#FAE8B4',     // Primary Background/Lightest Tone
    KHAKI: '#CBBD93',    // Secondary Background/Medium Light Tone
    OLIVE: '#80775C',    // Accent/Medium Dark Text/Buttons
    BROWN: '#574A24',    // Primary Text/Darkest Tone
};
// ---------------------------------

const AUTO_CAPTURE_INTERVAL = 5000;
const SWIPE_THRESHOLD = 50;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WELCOME_SCREEN_DURATION = 2750; // 2 seconds added
const BASE_FLASK_API_URL = 'https://d4b640e54324.ngrok-free.app'; 

// telugu -> 'te-IN'
const speakCaption = (text: string) => {
    Speech.stop();
    Speech.speak(text, {
        language: 'ka-IN',
        rate: 1.0,
        pitch: 1.0,
    });
};

interface ToastProps {
    imageUri: string | null;
    caption: string | null;
    isVisible: boolean;
    onClose: () => void;
    isUploading: boolean;
}

const CaptureToast: React.FC<ToastProps> = ({ imageUri, caption, isVisible, onClose, isUploading }) => {
    const animatedScale = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isVisible) {
            Animated.timing(animatedScale, {
                toValue: 1,
                duration: 300,
                easing: Easing.out(Easing.back(1.7)),
                useNativeDriver: true,
            }).start(() => {
                if (!isUploading) {
                    const timeout = setTimeout(() => {
                        Animated.timing(animatedScale, {
                            toValue: 0,
                            duration: 200,
                            useNativeDriver: true,
                        }).start(onClose);
                    }, 500);
                    return () => clearTimeout(timeout);
                }
            });
        } else {
            animatedScale.setValue(0);
        }
    }, [isVisible, onClose, isUploading, animatedScale]);

    if (!imageUri) return null;

    return (
        <View style={styles.toastContainer}>
            <Animated.View
                style={[
                    styles.toastContent,
                    {
                        transform: [{ scale: animatedScale }],
                        opacity: animatedScale.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [0, 1, 1],
                        }),
                    },
                ]}
            >
                <Text style={styles.toastHeaderText}>
                    {isUploading ? 'Analyzing Image...' : 'Analysis Complete'}
                </Text>
                <Image
                    source={{ uri: imageUri }}
                    style={styles.toastImage}
                    contentFit="cover"
                />
                <Text style={styles.captionText}>
                    {caption || (isUploading ? 'Sending to server for processing...' : 'No caption received.')}
                </Text>
                {isUploading && <View style={styles.spinner}><Text style={styles.loadingText}>...</Text></View>}
            </Animated.View>
        </View>
    );
};

interface AnalysisResult {
    caption: string;
    translated_caption: string;
}

const processImage = async (fileUri: string, targetEndpoint: string, source: 'vlm' | 'ocr') => {
    const fullUrl = `${BASE_FLASK_API_URL}${targetEndpoint}`;
    console.log(`[${source}] Preparing to process image at: ${fullUrl}`);

    try {
        const formData = new FormData();
        const filename = fileUri.split('/').pop();
        formData.append('file', {
            uri: fileUri,
            name: filename || 'photo.jpg',
            type: 'image/jpeg',
        } as any);

        const response = await fetch(fullUrl, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}. Response: ${errorText}`);
        }

        const result: AnalysisResult = await response.json();
        console.log(`[${source}] Analysis successful! Caption: ${result.caption}`);
        console.log(`[${source}] Full response:`, result);

        if (source === 'vlm' && result.translated_caption) {
            speakCaption(result.translated_caption);
        } else if (result.caption) {
            speakCaption(result.caption);
        }

        return result.caption;

    } catch (error: any) {
        console.error(`[${source}] Image processing failed:`, error);
        return `Processing failed: ${error.message || error.toString()}`;
    }
};


// --- Welcome Screen Component ---
/**
 * Simple component for the initial splash screen with enhanced styling and design elements.
 */
const WelcomeScreen = () => {
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(opacity, {
            toValue: 1,
            duration: WELCOME_SCREEN_DURATION / 2, // Fade in for half the total duration
            easing: Easing.ease,
            useNativeDriver: true,
        }).start();
    }, [opacity]);

    return (
        <View style={styles.welcomeContainer}>
            {/* Abstract background shapes - Layered Organic Design */}
            <View style={styles.welcomeShapeTopLayer1} />
            <View style={styles.welcomeShapeTopLayer2} />

            <Animated.View style={[styles.welcomeTextContainer, { opacity }]}>
                <Text style={styles.welcomeText}>
                    SeeQ 
                </Text>
                <Text style={styles.welcomeSubText}>
                    See . Speek . Survive
                </Text>
            </Animated.View>
        </View>
    );
}
// ---------------------------------


export default function App() {
    // NEW STATE: Controls the visibility of the Welcome Screen
    const [isLoadingInitial, setIsLoadingInitial] = useState(true);

    const [permission, requestPermission] = useCameraPermissions();
    const ref = useRef<CameraView>(null);
    const [currentMode, setCurrentMode] = useState<'vlm' | 'ocr'>('vlm');
    const [facing] = useState<CameraType>('back'); 
    const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
    const [isToastVisible, setIsToastVisible] = useState(false);
    const [currentCaption, setCurrentCaption] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // --- Welcome Screen Timer Effect ---
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLoadingInitial(false);
        }, WELCOME_SCREEN_DURATION); // Hide after 2 seconds

        return () => clearTimeout(timer); // Cleanup the timer
    }, []);


    const takePicture = useCallback(async (source: 'vlm' | 'ocr') => {
        if (ref.current) {
            try {
                if (isUploading) return; 
                setIsUploading(true);
                setCurrentCaption(null);
                const photo: CameraCapturedPicture | undefined = await ref.current.takePictureAsync({
                    quality: 0.8,
                    base64: false,
                });
                if (photo?.uri) {
                    setCapturedImageUri(photo.uri);
                    setIsToastVisible(true);
                    let endpoint = '/vlm';
                    if (source === 'ocr') endpoint = '/ocr';
                    const caption = await processImage(photo.uri, endpoint, source); 
                    setCurrentCaption(caption);
                }
                setIsUploading(false);
            } catch (error: any) {
                console.error(`[${source}] Failed to take picture or process:`, error);
                setCurrentCaption(`Error: ${error.message || error.toString()}`);
                setIsUploading(false);
            }
        }
    }, [isUploading]);

    useEffect(() => {
        // Only run auto-capture if the welcome screen is done loading
        if (!isLoadingInitial && currentMode === 'vlm' && permission?.granted) {
            const interval = setInterval(() => {
                if (!isUploading) takePicture('vlm');
            }, AUTO_CAPTURE_INTERVAL);
            return () => clearInterval(interval);
        }
    }, [currentMode, takePicture, permission, isUploading, isLoadingInitial]); // Added isLoadingInitial to dependencies

    const onHandlerStateChange = (event: PanGestureHandlerStateChangeEvent) => {
        if (event.nativeEvent.state === State.END && !isUploading) {
            const { translationX } = event.nativeEvent;
            let newMode: 'vlm' | 'ocr' | null = null;
            
            // Swipe Right (to VLM)
            if (translationX > SWIPE_THRESHOLD && currentMode === 'ocr') {
                newMode = 'vlm';
            } 
            // Swipe Left (to OCR)
            else if (translationX < -SWIPE_THRESHOLD && currentMode === 'vlm') {
                newMode = 'ocr';
            }

            if (newMode) {
                setCurrentMode(newMode);
                const modeName = newMode === 'vlm' 
                    ? 'Description' 
                    : 'text';
                speakCaption(modeName);
            }
        }
    };

    // 1. RENDER WELCOME SCREEN
    if (isLoadingInitial) {
        return <WelcomeScreen />;
    }

    // 2. RENDER PERMISSION SCREEN
    if (!permission) {
        return <SafeAreaView style={styles.centerContainer}><Text style={styles.loadingText}>Loading permissions...</Text></SafeAreaView>;
    }

    if (!permission.granted) {
        return (
            <View style={styles.centerContainer}>
                <Text style={{ textAlign: 'center', color: COLORS.SAND }}>
                    We need your permission to use the camera
                </Text>
                <Button onPress={requestPermission} title="Grant permission" color={COLORS.OLIVE} />
            </View>
        );
    }

    // 3. RENDER MAIN APP
    const isvlm = currentMode === 'vlm';
    // Use the color palette for mode indication
    const headerColor = isvlm ? COLORS.KHAKI : COLORS.SAND;

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={styles.appContainerFull}>
                <PanGestureHandler onHandlerStateChange={onHandlerStateChange}>
                    <View style={styles.contentContainer}>
                        <TapGestureHandler
                            onHandlerStateChange={(event) => {
                                if (currentMode === 'ocr' && event.nativeEvent.state === State.ACTIVE && !isUploading) {
                                    takePicture('ocr');
                                }
                            }}
                            numberOfTaps={2}
                        >
                            <TouchableOpacity style={styles.fullScreenTouch} activeOpacity={1}>
                                <CameraView
                                    style={styles.camera}
                                    ref={ref}
                                    mode={'picture'}
                                    facing={facing}
                                    mute={false}
                                    responsiveOrientationWhenOrientationLocked
                                >
                                    <SafeAreaView style={styles.safeOverlay}>
                                        <View style={styles.overlayContent}>
                                            {/* Header with background */}
                                            <View style={styles.headerBackgroundContainer}>
                                                <Text style={[styles.headerText, { color: COLORS.BROWN }]}>
                                                    {isvlm ? 'Automatic Capture (VLM)' : 'OCR Capture (OCR)'}
                                                </Text>
                                            </View>
                                            <Text style={styles.instructionText}>
                                                {isvlm
                                                    ? 'Auto Capture at every interval'
                                                    : 'Double Tap to Capture'}
                                            </Text>
                                            <Text style={styles.swipeHint}>
                                                {isvlm
                                                    ? 'Swipe Left ← OCR'
                                                    : 'Swipe Right → VLM'}
                                            </Text>
                                        </View>
                                    </SafeAreaView>
                                    {isUploading && (
                                        <View style={styles.loadingOverlay}>
                                            <Text style={styles.uploadingText}>Analyzing...</Text>
                                        </View>
                                    )}
                                </CameraView>
                            </TouchableOpacity>
                        </TapGestureHandler>
                    </View>
                </PanGestureHandler>
                <CaptureToast
                    imageUri={capturedImageUri}
                    caption={currentCaption}
                    isVisible={isToastVisible}
                    onClose={() => {
                        setIsToastVisible(false);
                        setCurrentCaption(null);
                    }}
                    isUploading={isUploading}
                />
            </View>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    // --- UPDATED WELCOME STYLES WITH DESIGN ELEMENTS ---
    welcomeContainer: {
        flex: 1,
        backgroundColor: COLORS.BROWN, // Dark background
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative', 
        overflow: 'hidden', 
    },
    // Container for text to ensure it's above shapes
    welcomeTextContainer: {
        zIndex: 10, // Ensure text is on top
        alignItems: 'center',
    },
    welcomeText: {
        fontSize: 52, 
        fontWeight: '900', 
        color: COLORS.SAND, // Light text on dark background
        marginBottom: 10,
        letterSpacing: 3,
    },
    welcomeSubText: {
        fontSize: 18,
        fontWeight: '500', 
        color: COLORS.KHAKI, // Medium light tone for subtitle
        textAlign: 'center',
        paddingTop: 10,
        borderTopWidth: 2, 
        borderColor: COLORS.KHAKI,
    },
    // New Styles for Abstract Shapes (Organic Wave/Hill Layers)
    welcomeShapeTopLayer1: {
        position: 'absolute',
        top: -SCREEN_WIDTH * 0.4, // Position it high up
        width: SCREEN_WIDTH * 1.5,
        height: SCREEN_WIDTH * 0.8,
        backgroundColor: COLORS.OLIVE, // Olive layer
        borderRadius: SCREEN_WIDTH * 0.75, // Creates a large, soft, oval-like shape
        opacity: 0.6,
        transform: [{ rotate: '15deg' }],
    },
    welcomeShapeTopLayer2: {
        position: 'absolute',
        top: -SCREEN_WIDTH * 0.2, 
        width: SCREEN_WIDTH * 1.2,
        height: SCREEN_WIDTH * 0.6,
        backgroundColor: COLORS.KHAKI, // Khaki layer
        borderRadius: SCREEN_WIDTH * 0.6,
        opacity: 0.7,
        transform: [{ rotate: '-10deg' }],
    },
    // --- END UPDATED WELCOME STYLES ---

    appContainerFull: { flex: 1, backgroundColor: COLORS.BROWN }, // Dark background outside camera view
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.OLIVE }, // Olive background for non-camera screens
    loadingText: { color: COLORS.SAND, fontSize: 18 }, // Light text on dark background
    contentContainer: { flex: 1 },
    camera: StyleSheet.absoluteFillObject,
    fullScreenTouch: { flex: 1 },
    // Use darker overlay on the camera to ensure text is readable
    safeOverlay: { 
        backgroundColor: 'rgba(0, 0, 0, 0.4)', // Slightly darker overlay for the whole safe area
        paddingHorizontal: 20, 
        borderBottomLeftRadius: 10, 
        borderBottomRightRadius: 10 
    },
    overlayContent: { 
        paddingVertical: 10, 
        alignItems: 'center',
        // New: Added padding to the top to accommodate the header background
        paddingTop: Platform.OS === 'android' ? 20 : 0, 
    },
    // NEW STYLE: Container for the header text with a background
    headerBackgroundContainer: {
        backgroundColor: COLORS.SAND, // Lightest tone for the background
        paddingVertical: 8,
        paddingHorizontal: 15,
        borderRadius: 20, // Rounded pill shape
        marginBottom: 10, // Space between header and other text
        alignSelf: 'center', // Center the pill
        marginTop: Platform.OS === 'android' ? 0 : 20, // Adjust for iOS safe area
    },
    headerText: { 
        fontSize: 24, 
        fontWeight: '800', 
        color: COLORS.BROWN, // Dark text on light background
    }, 
    instructionText: { fontSize: 15, color: COLORS.KHAKI, marginBottom: 8, textAlign: 'center' }, // Khaki for better readability on dark overlay
    swipeHint: { fontSize: 12, color: COLORS.SAND }, // Sand for the lightest hint
    
    // Toast styles (Use the sand color for the toast body, and dark for text/accents)
    toastContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    toastContent: { padding: 20, backgroundColor: COLORS.SAND, borderRadius: 16, shadowColor: COLORS.BROWN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 8, alignItems: 'center', maxWidth: SCREEN_WIDTH * 0.85 },
    toastHeaderText: { fontSize: 20, fontWeight: '700', color: COLORS.OLIVE, marginBottom: 10 }, // Olive for a noticeable header
    toastImage: { width: 200, height: 200, borderRadius: 10, borderWidth: 3, borderColor: COLORS.KHAKI, marginBottom: 10 }, // Khaki border for a natural frame
    captionText: { fontSize: 16, textAlign: 'center', marginTop: 8, color: COLORS.BROWN }, // Brown for primary text on sand background
    
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'center', alignItems: 'center' },
    uploadingText: { fontSize: 24, fontWeight: 'bold', color: COLORS.SAND }, // Sand on dark overlay
    spinner: { marginTop: 10 }
});