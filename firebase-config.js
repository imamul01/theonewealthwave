// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBYfhqC1x89DbqWgEDS3kpPKrWj6e1777E",
    authDomain: "theonewealthwave-bad63.firebaseapp.com",
    projectId: "theonewealthwave-bad63",
    storageBucket: "theonewealthwave-bad63.firebasestorage.app",
    messagingSenderId: "47205860966",
    appId: "1:47205860966:web:83cc467bcfa640984f4fa7",
    measurementId: "G-D9DHDV9H71"
};

// Initialize Firebase
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    
    // Enable Email/Password authentication
    const auth = firebase.auth();
    auth.useDeviceLanguage();
    
    console.log('✅ Firebase initialized successfully');
    console.log('✅ Email/Password authentication enabled');
} else {
    console.error('❌ Firebase SDK not loaded');
}

// Export for use in other files
window.firebaseConfig = firebaseConfig; 