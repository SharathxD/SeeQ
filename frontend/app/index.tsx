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

const AUTO_CAPTURE_INTERVAL = 10000;
const SWIPE_THRESHOLD = 50;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BASE_FLASK_API_URL = 'BACKEND_URL'; 

const speakCaption = (text: string) => {
	Speech.stop();
	Speech.speak(text, {
		language: 'en-US',
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
					setTimeout(() => {
						Animated.timing(animatedScale, {
							toValue: 0,
							duration: 200,
							useNativeDriver: true,
						}).start(onClose);
					}, 4000);
				}
			});
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
}

const processImage = async (fileUri: string, targetEndpoint: string, source: 'home' | 'manual') => {
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
		if (result.caption) speakCaption(result.caption);
		return result.caption;

	} catch (error: any) {
		console.error(`[${source}] Image processing failed:`, error);
		return `Processing failed: ${error.message || error.toString()}`;
	}
};

export default function App() {
	const [permission, requestPermission] = useCameraPermissions();
	const ref = useRef<CameraView>(null);
	const [currentMode, setCurrentMode] = useState<'home' | 'manual'>('home');
	const [facing] = useState<CameraType>('back'); 
	const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
	const [isToastVisible, setIsToastVisible] = useState(false);
	const [currentCaption, setCurrentCaption] = useState<string | null>(null);
	const [isUploading, setIsUploading] = useState(false);

	const takePicture = useCallback(async (source: 'home' | 'manual') => {
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
					if (source === 'manual') endpoint = '/ocr';
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
		if (currentMode === 'home' && permission?.granted) {
			const interval = setInterval(() => {
				if (!isUploading) takePicture('home');
			}, AUTO_CAPTURE_INTERVAL);
			return () => clearInterval(interval);
		}
	}, [currentMode, takePicture, permission, isUploading]);

	const onHandlerStateChange = (event: PanGestureHandlerStateChangeEvent) => {
		if (event.nativeEvent.state === State.END && !isUploading) {
			const { translationX } = event.nativeEvent;
			if (translationX > SWIPE_THRESHOLD && currentMode === 'manual') setCurrentMode('home');
			else if (translationX < -SWIPE_THRESHOLD && currentMode === 'home') setCurrentMode('manual');
		}
	};

	if (!permission) {
		return <SafeAreaView style={styles.centerContainer}><Text style={styles.loadingText}>Loading permissions...</Text></SafeAreaView>;
	}

	if (!permission.granted) {
		return (
			<View style={styles.centerContainer}>
				<Text style={{ textAlign: 'center', color: '#FFF' }}>
					We need your permission to use the camera
				</Text>
				<Button onPress={requestPermission} title="Grant permission" />
			</View>
		);
	}

	const isHome = currentMode === 'home';
	const headerColor = isHome ? '#10B981' : '#F97316';

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<View style={styles.appContainerFull}>
				<PanGestureHandler onHandlerStateChange={onHandlerStateChange}>
					<View style={styles.contentContainer}>
						<TapGestureHandler
							onHandlerStateChange={(event) => {
								if (currentMode === 'manual' && event.nativeEvent.state === State.ACTIVE && !isUploading) {
									takePicture('manual');
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
											<Text style={[styles.headerText, { color: headerColor }]}>
												{isHome ? 'Automatic Capture (VLM)' : 'Manual Capture (OCR)'}
											</Text>
											<Text style={styles.instructionText}>
												{isHome
													? `Calls /vlm every ${AUTO_CAPTURE_INTERVAL / 1000}s. Avoids processing during upload.`
													: 'Double tap anywhere on the screen to capture and hear the OCR description (/ocr).'}
											</Text>
											<Text style={styles.swipeHint}>
												{isHome
													? 'Swipe Left ← for Manual Mode (OCR)'
													: 'Swipe Right → for Automatic Mode (VLM)'}
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
	appContainerFull: { flex: 1, backgroundColor: '#000' },
	centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
	loadingText: { color: '#D1D5DB', fontSize: 18 },
	contentContainer: { flex: 1 },
	camera: StyleSheet.absoluteFillObject,
	fullScreenTouch: { flex: 1 },
	safeOverlay: { backgroundColor: 'rgba(0, 0, 0, 0.4)', paddingHorizontal: 20, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
	overlayContent: { paddingVertical: 10, alignItems: 'center' },
	headerText: { fontSize: 24, fontWeight: '800', marginBottom: 5 },
	instructionText: { fontSize: 15, color: '#D1D5DB', marginBottom: 8, textAlign: 'center' },
	swipeHint: { fontSize: 12, color: '#A1A1AA' },
	toastContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
	toastContent: { padding: 20, backgroundColor: 'white', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 8, alignItems: 'center', maxWidth: SCREEN_WIDTH * 0.85 },
	toastHeaderText: { fontSize: 20, fontWeight: '700', color: '#10B981', marginBottom: 10 },
	toastImage: { width: 200, height: 200, borderRadius: 10, borderWidth: 3, borderColor: '#10B981', marginBottom: 10 },
	captionText: { fontSize: 16, textAlign: 'center', marginTop: 8, color: '#333' },
	loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'center', alignItems: 'center' },
	uploadingText: { fontSize: 24, fontWeight: 'bold', color: 'white' },
	spinner: { marginTop: 10 }
});
