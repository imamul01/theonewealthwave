// DEBUGGING: Open browser console and run:
// testStorage() - to test Firebase Storage connectivity
// testDepositUpload() - to test deposit upload functionality
// checkReferralData() - to debug referral data consistency
// fixReferralData() - to fix referral data inconsistencies
// debugRegistrationIssues() - to comprehensively debug registration issues
// fixMissingReferralData() - to fix missing referral data for existing users
// testRegistration() - to test registration with sample data
// debugDashboardStats() - to debug dashboard stats and force refresh

// Firebase Configuration loaded from firebase-config.js

// Global State
const state = {
    currentUser: null,
    userData: {},
    depositMethods: {},
    chartInstances: {
        selfIncome: null,
        levelIncome: null,
        rewardIncome: null,
        roiIncome: null,
        pulse: null,
    },
    chartsInitialized: false,
    isSubmittingDeposit: false,
    lastDepositTimestamp: 0,
    depositCooldown: 5 * 60 * 1000, // 5 minutes
    // Realtime listeners
    unsubscribeROISettings: null,
    unsubscribeLevelSettings: null,
    // Admin ROI settings cache
    adminROI: null,
    // UI effects
    tiltInitialized: false,
    // Payout scheduler
    payoutCheckIntervalId: null,
    enableClientPayout: false,
    // Wallet pagination
    walletLastVisible: null,
    walletHasMore: false,
    walletCachedRows: [],
    calculating: {
        roi: false,
        level: false
    },
    debounceTimers: {
        roi: null,
        level: null
    }
};

    // Global debug function
    window.debugDashboardStats = async () => {
        if (dataHandlers && typeof dataHandlers.debugDashboardStats === 'function') {
            const stats = await dataHandlers.debugDashboardStats();
            console.log('📊 Dashboard Stats:', stats);
            return stats;
        } else {
            console.error('Debug function not available');
        }
    };

    // Global analytics debug function
    window.debugAnalytics = async () => {
        if (dataHandlers && typeof dataHandlers.loadAnalytics === 'function') {
            console.log('🔍 Debugging Analytics...');
            
            // Force refresh calculations first
            if (dataHandlers.calculateLevelIncome) {
                await dataHandlers.calculateLevelIncome();
                console.log('✅ Level income calculated');
            }
            
            if (dataHandlers.calculateROI) {
                await dataHandlers.calculateROI();
                console.log('✅ ROI calculated');
            }
            
            // Load analytics
            await dataHandlers.loadAnalytics();
            console.log('✅ Analytics debug completed');
        } else {
            console.error('Analytics function not available');
        }
    };

    // Global ROI debug function
    window.debugROI = async () => {
        if (dataHandlers && typeof dataHandlers.calculateROI === 'function') {
            console.log('🔍 Debugging ROI...');
            
            // Check user activation status
            const isActive = await dataHandlers.checkAndUpdateUserActivation();
            console.log('👤 User active status:', isActive);
            
            // Calculate ROI
            await dataHandlers.calculateROI();
            console.log('✅ ROI calculation completed');
            
            // Show current ROI income
            console.log('💰 Current ROI Income:', state.userData.roiIncome || 0);
            console.log('📊 Total Deposits:', state.userData.totalDeposits || 0);
            
        } else {
            console.error('ROI function not available');
        }
    };

    // Global dashboard debug function
    window.debugDashboard = () => {
        console.log('🔍 Debugging Dashboard...');
        console.log('Current User:', state.currentUser);
        console.log('User Data:', state.userData);
        console.log('Dashboard Elements:', {
            totalIncome: document.getElementById('totalIncome'),
            roiIncome: document.getElementById('roiIncome'),
            levelIncome: document.getElementById('levelIncome'),
            todayIncome: document.getElementById('todayIncome'),
            userBalance: document.getElementById('userBalance'),
            totalDeposits: document.getElementById('totalDeposits'),
            totalWithdrawable: document.getElementById('totalWithdrawable')
        });
        
        // Force reload user data
        if (dataHandlers && typeof dataHandlers.loadUserData === 'function') {
            console.log('🔄 Forcing user data reload...');
            dataHandlers.loadUserData();
        }
        
        // Check if elements have content
        const elements = ['totalIncome', 'roiIncome', 'levelIncome', 'todayIncome'];
        elements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                console.log(`${id}:`, element.textContent);
            } else {
                console.log(`${id}: Element not found`);
            }
        });
    };

    // Global function to check user data without writing
    window.checkUserData = async () => {
        console.log('🔍 Checking user data (read-only)...');
        
        if (!state.currentUser) {
            console.error('❌ No user authenticated');
            return;
        }
        
        try {
            const { db } = firebaseServices.initialize();
            console.log('✅ Database initialized successfully');
            
            // Read user document (read-only operation)
            console.log('📖 Attempting to read user document...');
            const userDoc = await db.collection('users').doc(state.currentUser.uid).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                console.log('✅ User document found:', userData);
                console.log('📊 Income Summary:', {
                    balance: userData.balance || 0,
                    totalDeposits: userData.totalDeposits || 0,
                    roiIncome: userData.roiIncome || 0,
                    levelIncome: userData.levelIncome || 0,
                    selfIncome: userData.selfIncome || 0,
                    rewardIncome: userData.rewardIncome || 0,
                    isActive: userData.isActive || false
                });
                
                // Update the UI with this data
                if (dataHandlers && typeof dataHandlers.loadUserData === 'function') {
                    console.log('🔄 Updating UI with loaded data...');
                    dataHandlers.loadUserData();
                }
            } else {
                console.log('⚠️ User document does not exist');
                console.log('🔄 Creating new user document...');
                
                // Create a basic user document
                await db.collection('users').doc(state.currentUser.uid).set({
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'active',
                    userId: state.currentUser.uid.substring(0, 8),
                    firebaseUid: state.currentUser.uid,
                    balance: 0,
                    name: state.currentUser.email?.split('@')[0] || 'User',
                    email: state.currentUser.email || '',
                    country: 'Unknown',
                    referralCode: state.currentUser.uid.substring(0, 8),
                    referrals: 0,
                    selfDeposit: 0,
                    teamBusiness: 0,
                    directJoining: 0,
                    isBlocked: false,
                    profileCompleted: false,
                    isActive: false,
                    totalDeposits: 0,
                    roiIncome: 0,
                    levelIncome: 0,
                    selfIncome: 0,
                    rewardIncome: 0,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                console.log('✅ New user document created');
                
                // Reload data
                await dataHandlers.initializeUserData();
            }
            
        } catch (error) {
            console.error('❌ Error checking user data:', error);
            console.error('Error details:', error.code, error.message);
            
            // Show user-friendly error message
            if (error.code === 'permission-denied') {
                utils.showToast('Permission denied. Please contact admin.', 'error');
            } else if (error.code === 'unavailable') {
                utils.showToast('Service temporarily unavailable. Please try again.', 'error');
            } else {
                utils.showToast(`Error: ${error.message}`, 'error');
            }
        }
    };

    // Global function to test Firebase connection
    window.testFirebaseConnection = () => {
        console.log('🔍 Testing Firebase connection...');
        
        try {
            // Check if Firebase is loaded
            if (typeof firebase === 'undefined') {
                console.error('❌ Firebase SDK not loaded');
                return;
            }
            
            console.log('✅ Firebase SDK loaded');
            console.log('Firebase apps:', firebase.apps?.length || 0);
            
            // Check if user is authenticated
            if (!state.currentUser) {
                console.error('❌ No user authenticated');
                return;
            }
            
            console.log('✅ User authenticated:', state.currentUser.uid);
            
            // Test database connection
            const { db } = firebaseServices.initialize();
            if (db) {
                console.log('✅ Database connection successful');
                
                // Test a simple read operation
                db.collection('users').doc(state.currentUser.uid).get()
                    .then(doc => {
                        if (doc.exists) {
                            console.log('✅ User document read successful');
                            console.log('Document data:', doc.data());
                        } else {
                            console.log('⚠️ User document does not exist');
                        }
                    })
                    .catch(error => {
                        console.error('❌ Database read error:', error);
                        console.error('Error code:', error.code);
                        console.error('Error message:', error.message);
                    });

                // Also sanity check ROI settings (read-only)
                db.collection('adminSettings').doc('roi').get()
                  .then(doc => {
                    if (doc.exists) {
                      console.log('✅ ROI settings found:', doc.data());
                    } else {
                      console.warn('⚠️ ROI settings missing; using safe defaults in UI');
                    }
                  })
                  .catch(err => {
                    console.warn('ROI settings read failed:', err?.code || '', err?.message || '');
                  });
            } else {
                console.error('❌ Database connection failed');
            }
            
        } catch (error) {
            console.error('❌ Firebase connection test error:', error);
        }
    };

  // Create a minimal approved test deposit for the logged-in user
  window.createTestDeposit = async () => {
    const { db } = firebaseServices.initialize();
    if (!db || !state.currentUser) {
      utils.showToast('Please log in first', 'error');
      return;
    }
    try {
      const depositRef = db.collection('deposits').doc();
      await depositRef.set({
        userId: state.currentUser.uid,
        amount: 100,
        status: 'approved',
        method: 'TEST',
        approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      utils.showToast('Test deposit created (approved)', 'success');
      // Recompute incomes and update UI
      if (typeof dataHandlers.calculateROI === 'function') await dataHandlers.calculateROI();
      if (typeof window.refreshDashboardStats === 'function') await window.refreshDashboardStats();
    } catch (e) {
      console.error('Create test deposit failed:', e);
      utils.showToast('Failed to create test deposit', 'error');
    }
  };

  // Create a manual deposit with custom fields
  window.createManualDeposit = async ({ method = 'UPI', amount = 100, utr = '', status = 'approved' } = {}) => {
    const { db } = firebaseServices.initialize();
    if (!db || !state.currentUser) {
      utils.showToast('Please log in first', 'error');
      return;
    }
    try {
      const docRef = db.collection('deposits').doc();
      const payload = {
        userId: state.currentUser.uid,
        method,
        amount: Number(amount) || 0,
        utr: String(utr || ''),
        status,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (status === 'approved') {
        payload.approvedAt = firebase.firestore.FieldValue.serverTimestamp();
      }
      await docRef.set(payload);
      utils.showToast('Deposit created', 'success');
      if (typeof window.refreshDashboardStats === 'function') await window.refreshDashboardStats();
    } catch (e) {
      console.error('createManualDeposit failed:', e);
      utils.showToast('Failed to create deposit (check Firestore rules)', 'error');
    }
  };

    // Global function to add sample data for testing
    window.addSampleData = async () => {
        console.log('🔍 Adding sample data for testing...');
        
        if (!state.currentUser) {
            console.error('❌ No user authenticated');
            return;
        }
        
        try {
            const { db } = firebaseServices.initialize();
            
            // Check if user document exists first
            const userDoc = await db.collection('users').doc(state.currentUser.uid).get();
            
            if (!userDoc.exists) {
                console.log('⚠️ User document does not exist, creating new one...');
                // Create new user document with sample data
                await db.collection('users').doc(state.currentUser.uid).set({
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'active',
                    userId: state.currentUser.uid.substring(0, 8),
                    firebaseUid: state.currentUser.uid,
                    balance: 100.00,
                    name: state.currentUser.email?.split('@')[0] || 'User',
                    email: state.currentUser.email || '',
                    country: 'Unknown',
                    referralCode: state.currentUser.uid.substring(0, 8),
                    referrals: 0,
                    selfDeposit: 0,
                    teamBusiness: 0,
                    directJoining: 0,
                    isBlocked: false,
                    profileCompleted: false,
                    isActive: true,
                    totalDeposits: 500.00,
                    roiIncome: 25.50,
                    levelIncome: 15.75,
                    selfIncome: 10.25,
                    rewardIncome: 5.00,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                console.log('✅ User document exists, updating with sample data...');
                // Update existing user document with sample data
                await db.collection('users').doc(state.currentUser.uid).update({
                    balance: 100.00,
                    totalDeposits: 500.00,
                    roiIncome: 25.50,
                    levelIncome: 15.75,
                    selfIncome: 10.25,
                    rewardIncome: 5.00,
                    isActive: true,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            console.log('✅ Sample data added successfully');
            console.log('🔄 Reloading user data...');
            
            // Reload user data
            await dataHandlers.initializeUserData();
            
        } catch (error) {
            console.error('❌ Error adding sample data:', error);
            console.error('Error details:', error.code, error.message);
            
            // Show user-friendly error message
            if (error.code === 'permission-denied') {
                utils.showToast('Permission denied. Please contact admin.', 'error');
            } else if (error.code === 'unavailable') {
                utils.showToast('Service temporarily unavailable. Please try again.', 'error');
            } else {
                utils.showToast(`Error: ${error.message}`, 'error');
            }
        }
    };

    // Global chart debug function
    window.debugCharts = () => {
        console.log('🔍 Debugging Charts...');
        
        // Check Chart.js availability
        console.log('📊 Chart.js available:', typeof Chart !== 'undefined');
        
        // Check chart references
        console.log('📈 Analytics chart:', window.analyticsChart);
        console.log('📊 Income charts:', window.incomeCharts);
        console.log('💓 Pulse chart:', window.pulseChart);
        
        // Check chart canvas elements
        const analyticsCanvas = document.getElementById('analyticsChart');
        console.log('🎨 Analytics canvas:', analyticsCanvas);
        
        if (analyticsCanvas) {
            console.log('🎨 Canvas context available:', !!analyticsCanvas.getContext('2d'));
        }
        
        // Test chart creation
        if (typeof Chart !== 'undefined' && analyticsCanvas) {
            try {
                const testChart = new Chart(analyticsCanvas.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: ['Test'],
                        datasets: [{
                            label: 'Test',
                            data: [1],
                            borderColor: 'red'
                        }]
                    }
                });
                console.log('✅ Test chart created successfully');
                testChart.destroy();
                console.log('✅ Test chart destroyed successfully');
            } catch (error) {
                console.error('❌ Test chart creation failed:', error);
            }
        }
    };

    // Global support ticket debug function
    window.debugSupportTickets = async () => {
        console.log('🔍 Debugging Support Tickets...');
        
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) {
            console.error('❌ Database or user not initialized');
            return;
        }
        
        try {
            // Check user's tickets
            const ticketsSnapshot = await db.collection('tickets')
                .where('userId', '==', state.currentUser.uid)
                .get();
            
            console.log('📝 User tickets found:', ticketsSnapshot.size);
            
            ticketsSnapshot.docs.forEach((doc, index) => {
                const ticket = doc.data();
                console.log(`📋 Ticket ${index + 1}:`, {
                    id: doc.id,
                    subject: ticket.subject,
                    message: ticket.message?.substring(0, 50) + '...',
                    status: ticket.status,
                    createdAt: ticket.createdAt?.toDate?.() || ticket.createdAt,
                    userEmail: ticket.userEmail,
                    userName: ticket.userName
                });
            });
            
            // Check all tickets in system
            const allTicketsSnapshot = await db.collection('tickets').get();
            console.log('📝 Total tickets in system:', allTicketsSnapshot.size);
            
            // Check supportTickets collection
            const supportTicketsSnapshot = await db.collection('supportTickets').get();
            console.log('📝 Total supportTickets in system:', supportTicketsSnapshot.size);
            
        } catch (error) {
            console.error('❌ Error debugging support tickets:', error);
        }
    };

// Utility Functions
const utils = {
    showToast(message, type) {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            console.error('Toast container not found');
            return;
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type} show`;
        toast.innerHTML = window.DOMPurify?.sanitize(message) || message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    generateReferralCode(uid) {
        return btoa(uid).slice(0, 8).toUpperCase();
    },

    generateUserId() {
        // Generate a random 8-digit number
        return Math.floor(10000000 + Math.random() * 90000000).toString();
    },

    formatCurrency(amount) {
        return `$${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
    },

    formatDate(timestamp) {
        if (timestamp instanceof Date && !isNaN(timestamp)) {
            return timestamp.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        } else if (timestamp?.toDate?.()) {
            return timestamp.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        }
        return 'N/A';
    },

    calculateTodayIncome(userData, today) {
        // Calculate today's total income from all sources
        let todayIncome = 0;
        
        // Check if user has income history
        if (userData.incomeHistory && Array.isArray(userData.incomeHistory)) {
            userData.incomeHistory.forEach(income => {
                if (income.date && new Date(income.date).toDateString() === today) {
                    todayIncome += (income.amount || 0);
                }
            });
        }
        
        // If no income history, estimate from daily ROI
        if (todayIncome === 0 && userData.roiIncome && userData.totalDeposits) {
            // Estimate daily ROI (assuming 1.2% daily)
            const dailyROI = (userData.totalDeposits * 0.012) || 0;
            todayIncome += dailyROI;
        }
        
        return todayIncome;
    },

    createElement(tag, attributes = {}, ...children) {
        const element = document.createElement(tag);
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'class' || key === 'className') element.className = value;
            else if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), value);
            else element.setAttribute(key, value);
        });
        children.forEach(child => {
            if (typeof child === 'string') element.appendChild(document.createTextNode(child));
            else if (child instanceof HTMLElement) element.appendChild(child);
        });
        return element;
    },

    sanitize(input) {
        return window.DOMPurify ? window.DOMPurify.sanitize(input) : input;
    },

    generateCSRFToken() {
        return btoa(Math.random().toString(36).substring(2, 15));
    },

    // Test Firebase Storage connectivity
    async testStorageConnection() {
        try {
            const { auth, storage } = firebaseServices.initialize();
            if (!auth.currentUser) {
                console.log('No authenticated user for storage test');
                return false;
            }
            
            console.log('Testing storage connection...');
            console.log('Authenticated user:', auth.currentUser.uid);
            console.log('Storage instance:', storage);
            console.log('Storage bucket:', storage.app.options.storageBucket);
            
            // Try to create a test reference
            const testRef = storage.ref(`test/${auth.currentUser.uid}/test.txt`);
            console.log('Test reference created:', testRef);
            console.log('Test reference full path:', testRef.fullPath);
            
            // Test if we can create a reference to the deposits folder
            const depositsRef = storage.ref(`deposits/${auth.currentUser.uid}/test.txt`);
            console.log('Deposits reference created:', depositsRef);
            console.log('Deposits reference full path:', depositsRef.fullPath);
            
            // Try to create a small test file to verify permissions
            try {
                const testBlob = new Blob(['test'], { type: 'text/plain' });
                const testRef = storage.ref(`test/${auth.currentUser.uid}/permission-test.txt`);
                console.log('Attempting to upload test file...');
                await testRef.put(testBlob);
                console.log('Test file upload successful - permissions are working');
                
                // Clean up test file
                try {
                    await testRef.delete();
                    console.log('Test file cleaned up');
                } catch (cleanupError) {
                    console.warn('Could not clean up test file:', cleanupError);
                }
            } catch (testUploadError) {
                console.error('Test upload failed - this indicates a permissions issue:', testUploadError);
                console.error('Error code:', testUploadError.code);
                console.error('Error message:', testUploadError.message);
            }
            
            return true;
        } catch (error) {
            console.error('Storage test failed:', error);
            return false;
        }
    },

    // Test deposit upload specifically
    async testDepositUpload() {
        try {
            const { auth, storage } = firebaseServices.initialize();
            if (!auth.currentUser) {
                console.log('No authenticated user for deposit test');
                return false;
            }
            
            console.log('Testing deposit upload...');
            console.log('User UID:', auth.currentUser.uid);
            
            // Create a test image blob
            const canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 100;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'red';
            ctx.fillRect(0, 0, 100, 100);
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.fillText('TEST', 30, 50);
            
            const testBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
            console.log('Test image created, size:', testBlob.size);
            
            // Try to upload to deposits folder
            const timestamp = Date.now();
            const storageRef = storage.ref(`deposits/${auth.currentUser.uid}/${timestamp}_test.jpg`);
            console.log('Uploading to:', storageRef.fullPath);
            
            await storageRef.put(testBlob);
            console.log('Deposit upload test successful!');
            
            const downloadURL = await storageRef.getDownloadURL();
            console.log('Download URL:', downloadURL);
            
            // Clean up
            try {
                await storageRef.delete();
                console.log('Test file cleaned up');
            } catch (cleanupError) {
                console.warn('Could not clean up test file:', cleanupError);
            }
            
            return true;
        } catch (error) {
            console.error('Deposit upload test failed:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            return false;
        }
    },

    // Debug referral data consistency
    async checkReferralData() {
        const { auth, db } = firebaseServices.initialize();
        if (!auth.currentUser || !db) {
            console.error('❌ No authenticated user or database available');
            return;
        }

        const currentUserId = auth.currentUser.uid;
        console.log('🔍 === REFERRAL DATA DEBUGGING ===');
        console.log('👤 Current user ID:', currentUserId);

        try {
            // 1. Check user's own document
            const userDoc = await db.collection('users').doc(currentUserId).get();
            if (!userDoc.exists) {
                console.log('❌ User document not found');
                return;
            }

                const userData = userDoc.data();
            console.log('📋 User data:', {
                    name: userData.name,
                    email: userData.email,
                    referralCode: userData.referralCode,
                    userId: userData.userId,
                    referredBy: userData.referredBy || 'NOT SET',
                    referrals: userData.referrals || 0
                });

            // 2. Check referrals where this user is the referrer
            console.log('🔍 Checking referrals where user is referrer...');
            const referralsSnapshot = await db.collection('referrals').where('referrerId', '==', currentUserId).get();
            
            console.log(`📊 Found ${referralsSnapshot.docs.length} referrals where user is referrer`);
            
            const referralIssues = [];
            for (const doc of referralsSnapshot.docs) {
                const referral = doc.data();
                console.log('📋 Referral document:', {
                    id: doc.id,
                    referrerId: referral.referrerId,
                    referredId: referral.referredId,
                    referredUserId: referral.referredUserId,
                    referrerCode: referral.referrerCode,
                    createdAt: referral.createdAt
                });

                // Check if referred user document exists
                const referredUserDoc = await db.collection('users').doc(referral.referredId).get();
                if (!referredUserDoc.exists) {
                    referralIssues.push(`❌ Referred user document not found: ${referral.referredId}`);
                } else {
                    const referredUserData = referredUserDoc.data();
                    console.log('✅ Referred user found:', {
                        name: referredUserData.name,
                        email: referredUserData.email,
                        referredBy: referredUserData.referredBy || 'NOT SET',
                        shouldBeReferredBy: currentUserId
                    });

                    // Check if referredBy field is set correctly
                    if (referredUserData.referredBy !== currentUserId) {
                        referralIssues.push(`❌ referredBy mismatch: expected ${currentUserId}, got ${referredUserData.referredBy || 'NOT SET'}`);
                    }
                }
            }

            // 3. Check if user was referred by someone
            if (userData.referredBy) {
                console.log('🔍 Checking referrer...');
                const referrerDoc = await db.collection('users').doc(userData.referredBy).get();
                if (!referrerDoc.exists) {
                    referralIssues.push(`❌ Referrer document not found: ${userData.referredBy}`);
                } else {
                    const referrerData = referrerDoc.data();
                    console.log('✅ Referrer found:', {
                        name: referrerData.name,
                        email: referrerData.email,
                        referralCode: referrerData.referralCode
                    });
                }
            }

            // 4. Summary
            console.log('📊 === REFERRAL DEBUG SUMMARY ===');
            console.log(`Total referrals: ${referralsSnapshot.docs.length}`);
            console.log(`Issues found: ${referralIssues.length}`);
            
            if (referralIssues.length > 0) {
                console.log('❌ Issues found:');
                referralIssues.forEach(issue => console.log(issue));
                } else {
                console.log('✅ No issues found - referral data is consistent');
            }

            return {
                totalReferrals: referralsSnapshot.docs.length,
                issues: referralIssues,
                userData: userData
            };

        } catch (error) {
            console.error('❌ Error during referral debugging:', error);
            return null;
        }
    },
    // Fix referral data inconsistencies
    async fixReferralData() {
        const { auth, db } = firebaseServices.initialize();
        if (!auth.currentUser || !db) {
            console.error('❌ No authenticated user or database available');
            return;
        }

        const currentUserId = auth.currentUser.uid;
        console.log('🔧 === FIXING REFERRAL DATA ===');
        console.log('👤 Current user ID:', currentUserId);

        try {
            // 1. Get all referrals where this user is the referrer
            const referralsSnapshot = await db.collection('referrals').where('referrerId', '==', currentUserId).get();
            console.log(`📊 Found ${referralsSnapshot.docs.length} referrals to fix`);

            let fixedCount = 0;
            let errorCount = 0;

            for (const doc of referralsSnapshot.docs) {
                const referral = doc.data();
                console.log('🔧 Processing referral:', referral);

                try {
                    // Get the referred user's document
                    const referredUserDoc = await db.collection('users').doc(referral.referredId).get();
                    
                    if (referredUserDoc.exists) {
                        const referredUserData = referredUserDoc.data();
                        
                        // Check if referredBy field is missing or incorrect
                        if (referredUserData.referredBy !== currentUserId) {
                            console.log('🔧 Fixing referredBy field for user:', referredUserData.name);
                            
                            // Update the referred user's document
                            await db.collection('users').doc(referral.referredId).update({
                                referredBy: currentUserId
                            });
                            
                            console.log('✅ Fixed referredBy field for:', referredUserData.name);
                            fixedCount++;
                        } else {
                            console.log('✅ referredBy field already correct for:', referredUserData.name);
                        }
                    } else {
                        console.log('❌ Referred user document not found:', referral.referredId);
                        errorCount++;
                    }
                } catch (error) {
                    console.error('❌ Error fixing referral:', error);
                    errorCount++;
                }
            }

            console.log('📊 === REFERRAL FIX SUMMARY ===');
            console.log(`Total referrals processed: ${referralsSnapshot.docs.length}`);
            console.log(`Fixed: ${fixedCount}`);
            console.log(`Errors: ${errorCount}`);

            if (fixedCount > 0) {
                utils.showToast(`Fixed ${fixedCount} referral data inconsistencies`, 'success');
            } else if (errorCount > 0) {
                utils.showToast(`Found ${errorCount} errors while fixing referrals`, 'warning');
            } else {
                utils.showToast('All referral data is consistent', 'success');
            }

            return {
                total: referralsSnapshot.docs.length,
                fixed: fixedCount,
                errors: errorCount
            };

        } catch (error) {
            console.error('❌ Error during referral fixing:', error);
            utils.showToast('Error fixing referral data', 'error');
            return null;
        }
    },

    // Debug registration process
    async debugRegistrationProcess() {
        const { auth, db } = firebaseServices.initialize();
        if (!auth || !db) {
            console.error('❌ Firebase not initialized');
            return;
        }

        console.log('🔍 === REGISTRATION PROCESS DEBUG ===');
        
        try {
            // Check current user
            const currentUser = auth.currentUser;
            console.log('👤 Current user:', currentUser ? currentUser.uid : 'None');
            
            if (!currentUser) {
                console.log('❌ No user authenticated');
                return;
            }

            // Check if user document exists
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            console.log('📋 User document exists:', userDoc.exists);
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                console.log('📄 User data:', {
                    name: userData.name,
                    email: userData.email,
                    referralCode: userData.referralCode,
                    referredBy: userData.referredBy || 'NOT SET',
                    referrals: userData.referrals || 0
                });
            }

            // Check referrals where this user is referrer
            const referralsSnapshot = await db.collection('referrals').where('referrerId', '==', currentUser.uid).get();
            console.log(`📊 Referrals where user is referrer: ${referralsSnapshot.docs.length}`);
            
            referralsSnapshot.docs.forEach((doc, index) => {
                const referral = doc.data();
                console.log(`📋 Referral ${index + 1}:`, {
                    id: doc.id,
                    referrerId: referral.referrerId,
                        referredId: referral.referredId,
                    referredUserId: referral.referredUserId,
                    referrerCode: referral.referrerCode,
                    createdAt: referral.createdAt
                });
            });

            // Check if user was referred by someone
            const referredBySnapshot = await db.collection('referrals').where('referredId', '==', currentUser.uid).get();
            console.log(`📊 Referrals where user was referred: ${referredBySnapshot.docs.length}`);
            
            if (referredBySnapshot.docs.length > 0) {
                const referral = referredBySnapshot.docs[0].data();
                console.log('👤 User was referred by:', referral.referrerId);
            }

            // Check all users with same referral code
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (userData.referralCode) {
                    const sameCodeUsers = await db.collection('users').where('referralCode', '==', userData.referralCode).get();
                    console.log(`📊 Users with same referral code (${userData.referralCode}): ${sameCodeUsers.docs.length}`);
                }
            }

        } catch (error) {
            console.error('❌ Error during registration debug:', error);
        }
    },
    // Test registration with sample data
    async testRegistration() {
        console.log('🧪 === TESTING REGISTRATION ===');
        
        const { auth, db } = firebaseServices.initialize();
        if (!auth || !db) {
            console.error('❌ Firebase not initialized');
            return;
        }

        try {
            // Create a test user
            const testEmail = `test${Date.now()}@example.com`;
            const testPassword = 'TestPassword123!';
            const testName = 'Test User';
            const testReferralCode = '12345678'; // Use a valid referral code from your system

            console.log('📝 Test registration data:', {
                email: testEmail,
                name: testName,
                referralCode: testReferralCode
            });

            // Create user
            const userCredential = await auth.createUserWithEmailAndPassword(testEmail, testPassword);
            const firebaseUid = userCredential.user.uid;
            const newUserId = utils.generateUserId();

            console.log('✅ User created:', firebaseUid);
            console.log('✅ Generated user ID:', newUserId);

            // Create user document
            await db.collection('users').doc(firebaseUid).set({
                name: testName,
                email: testEmail,
                country: 'Test Country',
                referralCode: newUserId,
                balance: 0,
                referrals: 0,
                status: 'inactive',
                userId: newUserId,
                firebaseUid: firebaseUid,
                selfDeposit: 0,
                teamBusiness: 0,
                directJoining: 0,
                isBlocked: false,
                profileCompleted: false,
                isActive: false,
                totalDeposits: 0,
                roiIncome: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });

            console.log('✅ User document created');

            // Process referral
            const referralSnapshot = await db.collection('users').where('referralCode', '==', testReferralCode).get();
            
            if (referralSnapshot && !referralSnapshot.empty) {
                const referrerDoc = referralSnapshot.docs[0];
                const referrerId = referrerDoc.id;
                const referrerData = referrerDoc.data();

                console.log('✅ Found referrer:', referrerId, 'Name:', referrerData.name);

                // Update user document with referredBy
                await db.collection('users').doc(firebaseUid).update({
                    referredBy: referrerId
                });

                // Create referral document
                const referralData = {
                    referrerId: referrerId,
                    referredId: firebaseUid,
                    referredUserId: newUserId,
                    referrerCode: testReferralCode,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                const referralDocRef = await db.collection('referrals').add(referralData);
                console.log('✅ Referral document created:', referralDocRef.id);

                // Update referrer count
                await db.collection('users').doc(referrerId).update({
                    referrals: firebase.firestore.FieldValue.increment(1)
                });

                console.log('✅ Referrer count updated');
                console.log('✅ Test registration completed successfully!');

                // Clean up - delete test user
                await userCredential.user.delete();
                console.log('🧹 Test user cleaned up');

            } else {
                console.log('❌ No referrer found for test code:', testReferralCode);
            }

        } catch (error) {
            console.error('❌ Test registration failed:', error);
        }
    },
    // Comprehensive debugging function for registration issues
    async debugRegistrationIssues() {
        console.log('🔍 === COMPREHENSIVE REGISTRATION DEBUG ===');
        
        const { auth, db } = firebaseServices.initialize();
        if (!auth || !db) {
            console.error('❌ Firebase not initialized');
            return;
        }

        try {
            // 1. Check Firebase initialization
            console.log('✅ Firebase initialized successfully');
            console.log('📊 Firebase state:', {
                auth: !!auth,
                db: !!db,
                firestore: !!firebase.firestore,
                currentUser: auth.currentUser?.uid || 'None'
            });

            // 2. Check current user
            const currentUser = auth.currentUser;
            if (!currentUser) {
                console.log('❌ No authenticated user');
                return;
            }

            console.log('👤 Current user:', currentUser.uid);

            // 3. Check user document
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            console.log('📋 User document exists:', userDoc.exists);
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                console.log('📄 User data:', {
                        name: userData.name,
                        email: userData.email,
                    referralCode: userData.referralCode,
                    referredBy: userData.referredBy || 'NOT SET',
                    referrerCode: userData.referrerCode || 'NOT SET',
                    referrerName: userData.referrerName || 'NOT SET',
                    referralDate: userData.referralDate || 'NOT SET',
                    referrals: userData.referrals || 0
                });
            }

            // 4. Check referrals where user is referrer
            const referralsSnapshot = await db.collection('referrals').where('referrerId', '==', currentUser.uid).get();
            console.log(`📊 Referrals where user is referrer: ${referralsSnapshot.docs.length}`);
            
            referralsSnapshot.docs.forEach((doc, index) => {
                const referral = doc.data();
                console.log(`📋 Referral ${index + 1}:`, {
                    id: doc.id,
                    referrerId: referral.referrerId,
                    referredId: referral.referredId,
                    referredUserId: referral.referredUserId,
                    referrerCode: referral.referrerCode,
                    referrerName: referral.referrerName,
                    createdAt: referral.createdAt
                });
            });

            // 5. Check if user was referred by someone
            const referredBySnapshot = await db.collection('referrals').where('referredId', '==', currentUser.uid).get();
            console.log(`📊 Referrals where user was referred: ${referredBySnapshot.docs.length}`);
            
            if (referredBySnapshot.docs.length > 0) {
                const referral = referredBySnapshot.docs[0].data();
                console.log('👤 User was referred by:', {
                    referrerId: referral.referrerId,
                    referrerCode: referral.referrerCode,
                    referrerName: referral.referrerName,
                    createdAt: referral.createdAt
                });
            }

            // 6. Check available referral codes
            const allUsers = await db.collection('users').limit(20).get();
            console.log(`📊 Total users in system: ${allUsers.docs.length}`);
            
            const usersWithCodes = allUsers.docs.filter(doc => {
                const data = doc.data();
                return data.referralCode && data.referralCode.length >= 8;
            });
            
            console.log(`📊 Users with valid referral codes: ${usersWithCodes.length}`);
            usersWithCodes.forEach(doc => {
                const data = doc.data();
                console.log(`  - ${data.name}: ${data.referralCode}`);
            });

            // 7. Check for any Firestore errors
            console.log('🔍 Checking for common Firestore issues...');
            
            // Test a simple query
            try {
                const testQuery = await db.collection('users').limit(1).get();
                console.log('✅ Basic query test passed');
        } catch (error) {
                console.error('❌ Basic query test failed:', error);
            }

            // Test a where query
            try {
                const testWhereQuery = await db.collection('users').where('referralCode', '==', 'test').get();
                console.log('✅ Where query test passed');
            } catch (error) {
                console.error('❌ Where query test failed:', error);
            }

            console.log('✅ Comprehensive debug completed');

        } catch (error) {
            console.error('❌ Debug error:', error);
        }
    },

    // Destroy all charts to prevent conflicts
    destroyAllCharts() {
        console.log('🗑️ Destroying all charts...');
        
        // Destroy analytics chart
        if (window.analyticsChart && typeof window.analyticsChart.destroy === 'function') {
            try {
                window.analyticsChart.destroy();
                console.log('✅ Analytics chart destroyed');
            } catch (error) {
                console.warn('⚠️ Error destroying analytics chart:', error);
            }
            window.analyticsChart = null;
        } else if (window.analyticsChart) {
            console.log('🗑️ Clearing analytics chart reference');
            window.analyticsChart = null;
        }
        
        // Destroy income charts
        if (window.incomeCharts) {
            Object.values(window.incomeCharts).forEach(chart => {
                if (chart && typeof chart.destroy === 'function') {
                    try {
                        chart.destroy();
                    } catch (error) {
                        console.warn('⚠️ Error destroying income chart:', error);
                    }
                }
            });
            window.incomeCharts = {};
            console.log('✅ Income charts destroyed');
        }
        
        // Destroy pulse chart
        if (window.pulseChart && typeof window.pulseChart.destroy === 'function') {
            try {
                window.pulseChart.destroy();
                console.log('✅ Pulse chart destroyed');
            } catch (error) {
                console.warn('⚠️ Error destroying pulse chart:', error);
            }
            window.pulseChart = null;
        } else if (window.pulseChart) {
            console.log('🗑️ Clearing pulse chart reference');
            window.pulseChart = null;
        }
        
        console.log('✅ All charts destroyed successfully');
    },

    // Load real-time referral count
    async loadRealTimeReferralCount() {
        const { auth, db } = firebaseServices.initialize();
        if (!db || !auth.currentUser) {
            return 0;
        }

        try {
            const referralsSnapshot = await db.collection('referrals')
                .where('referrerId', '==', auth.currentUser.uid)
                .get();
            
            const count = referralsSnapshot.size;
            console.log('📊 Real-time referral count:', count);
            return count;
        } catch (error) {
            console.error('❌ Error loading referral count:', error);
            return 0;
        }
    },
    // Get users for a specific level
    async getLevelUsers(userId, level) {
        const { db } = firebaseServices.initialize();
        if (!db) return [];

        try {
            if (level === 1) {
                // Direct referrals
                const referralsSnapshot = await db.collection('referrals')
                    .where('referrerId', '==', userId)
                    .get();
                
                const levelUsers = [];
                for (const doc of referralsSnapshot.docs) {
                    const referral = doc.data();
                    const userDoc = await db.collection('users').doc(referral.referredId).get();
                    
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        levelUsers.push({
                            userId: referral.referredId,
                            name: userData.name || 'Unknown',
                            email: userData.email || 'N/A',
                            mobile: userData.mobile || 'N/A',
                            status: userData.status || 'Active',
                            joinDate: userData.createdAt,
                            selfDeposit: userData.selfDeposit || 0
                        });
                    }
                }
                return levelUsers;
            } else {
                // Get users from previous level
                const previousLevelUsers = await this.getLevelUsers(userId, level - 1);
                const currentLevelUsers = [];
                
                for (const user of previousLevelUsers) {
                    const userReferrals = await db.collection('referrals')
                        .where('referrerId', '==', user.userId)
                        .get();
                    
                    for (const doc of userReferrals.docs) {
                        const referral = doc.data();
                        const userDoc = await db.collection('users').doc(referral.referredId).get();
                        
                        if (userDoc.exists) {
                            const userData = userDoc.data();
                            currentLevelUsers.push({
                                userId: referral.referredId,
                                name: userData.name || 'Unknown',
                                email: userData.email || 'N/A',
                                mobile: userData.mobile || 'N/A',
                                status: userData.status || 'Active',
                                joinDate: userData.createdAt,
                                selfDeposit: userData.selfDeposit || 0
                            });
                        }
                    }
                }
                
                return currentLevelUsers;
            }
        } catch (error) {
            console.error(`❌ Error getting level ${level} users:`, error);
            return [];
        }
    },

    // Get team members at specific level
    async getTeamMembersAtLevel(userId, level) {
        const { db } = firebaseServices.initialize();
        if (!db) return [];

        try {
            if (level === 1) {
                // Direct referrals
                const referralsSnapshot = await db.collection('referrals')
                    .where('referrerId', '==', userId)
                    .get();
                
                const levelUsers = [];
                for (const doc of referralsSnapshot.docs) {
                    const referral = doc.data();
                    const userDoc = await db.collection('users').doc(referral.referredId).get();
                    
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        levelUsers.push({
                            userId: referral.referredId,
                            name: userData.name || 'Unknown',
                            email: userData.email || 'N/A',
                            mobile: userData.mobile || 'N/A',
                            status: userData.status || 'Active',
                            joinDate: userData.createdAt,
                            selfDeposit: userData.selfDeposit || 0
                        });
                    }
                }
                return levelUsers;
            } else {
                // Get users from previous level
                const previousLevelUsers = await this.getTeamMembersAtLevel(userId, level - 1);
                const currentLevelUsers = [];
                
                for (const user of previousLevelUsers) {
                    const userReferrals = await db.collection('referrals')
                        .where('referrerId', '==', user.userId)
                        .get();
                    
                    for (const doc of userReferrals.docs) {
                        const referral = doc.data();
                        const userDoc = await db.collection('users').doc(referral.referredId).get();
                        
                        if (userDoc.exists) {
                            const userData = userDoc.data();
                            currentLevelUsers.push({
                                userId: referral.referredId,
                                name: userData.name || 'Unknown',
                                email: userData.email || 'N/A',
                                mobile: userData.mobile || 'N/A',
                                status: userData.status || 'Active',
                                joinDate: userData.createdAt,
                                selfDeposit: userData.selfDeposit || 0
                            });
                        }
                    }
                }
                
                return currentLevelUsers;
            }
        } catch (error) {
            console.error(`❌ Error getting team members at level ${level}:`, error);
            return [];
        }
    },

    // Fix missing referral data for existing users
    async fixMissingReferralData() {
        console.log('🔧 === FIXING MISSING REFERRAL DATA ===');
        
        const { auth, db } = firebaseServices.initialize();
        if (!auth || !db) {
            console.error('❌ Firebase not initialized');
            return;
        }

        try {
            const currentUser = auth.currentUser;
            if (!currentUser) {
                console.log('❌ No authenticated user');
                return;
            }

            // Get user document
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            if (!userDoc.exists) {
                console.log('❌ User document not found');
                return;
            }

            const userData = userDoc.data();
            let fixedCount = 0;

            // Check if user has referredBy but missing other fields
            if (userData.referredBy && (!userData.referrerCode || !userData.referrerName)) {
                console.log('🔧 Fixing missing referral fields...');
                
                try {
                    const referrerDoc = await db.collection('users').doc(userData.referredBy).get();
                    if (referrerDoc.exists) {
                        const referrerData = referrerDoc.data();
                        
                        const updateData = {};
                        if (!userData.referrerCode) {
                            updateData.referrerCode = referrerData.referralCode;
                        }
                        if (!userData.referrerName) {
                            updateData.referrerName = referrerData.name;
                        }
                        if (!userData.referralDate) {
                            updateData.referralDate = userData.createdAt;
                        }
                        
                        if (Object.keys(updateData).length > 0) {
                            await db.collection('users').doc(currentUser.uid).update(updateData);
                            console.log('✅ Fixed missing referral fields:', updateData);
                            fixedCount++;
                        }
                    }
                } catch (error) {
                    console.error('❌ Error fixing referral fields:', error);
                }
            }

            // Check if referral document exists but user document is missing referral data
            const referralDoc = await db.collection('referrals').where('referredId', '==', currentUser.uid).get();
            if (!referralDoc.empty && !userData.referredBy) {
                console.log('🔧 Fixing missing referredBy field...');
                
                const referral = referralDoc.docs[0].data();
                await db.collection('users').doc(currentUser.uid).update({
                    referredBy: referral.referrerId,
                    referrerCode: referral.referrerCode,
                    referrerName: referral.referrerName,
                    referralDate: referral.createdAt
                });
                
                console.log('✅ Fixed missing referredBy field');
                fixedCount++;
            }

            if (fixedCount > 0) {
                console.log(`✅ Fixed ${fixedCount} issues`);
                utils.showToast(`Fixed ${fixedCount} referral data issues`, 'success');
            } else {
                console.log('✅ No issues found');
                utils.showToast('No referral data issues found', 'success');
            }

        } catch (error) {
            console.error('❌ Error fixing referral data:', error);
        }
    }
};

// Firebase Services
const firebaseServices = {
    initialize() {
        try {
            // Check if Firebase is available
            if (typeof firebase === 'undefined') {
                console.error('❌ Firebase SDK not loaded');
                utils.showToast('Firebase SDK not loaded', 'error');
                return { auth: null, db: null, storage: null };
            }
            
            // Check if already initialized to prevent multiple initializations
            if (window.firebaseInitialized) {
                console.log('✅ Firebase already initialized, reusing existing instance');
                const auth = firebase.auth ? firebase.auth() : null;
                const db = firebase.firestore ? firebase.firestore() : null;
                const storage = firebase.storage ? firebase.storage() : null;
                return { auth, db, storage };
            }
            
            // Check if Firebase apps exist
            if (!firebase.apps || firebase.apps.length === 0) {
                console.log('⚠️ No Firebase apps found, checking firebase-config.js');
                // Firebase should be initialized in firebase-config.js
                if (typeof firebaseConfig !== 'undefined') {
                    console.log('✅ Firebase config found, initializing...');
                    firebase.initializeApp(firebaseConfig);
                } else {
                    console.error('❌ Firebase config not found');
                    utils.showToast('Firebase configuration missing', 'error');
                    return { auth: null, db: null, storage: null };
                }
            }
            
            const auth = firebase.auth ? firebase.auth() : null;
            const db = firebase.firestore ? firebase.firestore() : null;
            const storage = firebase.storage ? firebase.storage() : null;
            
            if (!auth || !db) {
                console.error('❌ Firebase services unavailable:', { auth: !!auth, db: !!db, storage: !!storage });
                utils.showToast('Firebase services unavailable', 'error');
                return { auth: null, db: null, storage: null };
            }
            
            console.log('✅ Firebase services initialized successfully');
            console.log('Auth:', !!auth, 'Firestore:', !!db, 'Storage:', !!storage);
            
            // Mark as initialized
            window.firebaseInitialized = true;
            return { auth, db, storage };
            
        } catch (error) {
            console.error('❌ Firebase initialization error:', error);
            utils.showToast(`Firebase error: ${error.message}`, 'error');
            return { auth: null, db: null, storage: null };
        }
    },

    async safeGet(ref) {
        try {
            return await ref.get();
        } catch (error) {
            console.error(`Error getting document at ${ref.path}:`, error.message);
            return { exists: false, data: () => ({}) };
        }
    },

    async safeQuery(query) {
        try {
            if (!query) throw new Error('Invalid query object');
            return await query.get();
        } catch (error) {
            if (error?.code === 'permission-denied') {
                // Silently return empty set to avoid noisy console logs
                return { docs: [], empty: true };
            }
            console.error('Query error:', error.message);
            return { docs: [], empty: true };
        }
    }
};
// Authentication Handlers
const authHandlers = {
    toggleForms(mode) {
        const elements = {
            authTitle: document.getElementById('authTitle'),
            authForm: document.getElementById('authForm'),
            forgotPasswordForm: document.getElementById('forgotPasswordForm'),
            authToggle: document.getElementById('authToggle'),
            forgotPasswordToggle: document.getElementById('forgotPasswordToggle'),
            nameInput: document.getElementById('name'),
            confirmPasswordInput: document.getElementById('confirmPassword'),
            referralCodeInput: document.getElementById('referralCode'),
            countryInput: document.getElementById('country'),
            authSubmit: document.getElementById('authSubmit'),
            nameHint: document.getElementById('nameHint'),
            confirmPasswordHint: document.getElementById('confirmPasswordHint'),
            referralCodeHint: document.getElementById('referralCodeHint'),
            countryHint: document.getElementById('countryHint')
        };

        if (!elements.authForm || !elements.forgotPasswordForm || !elements.authTitle) {
            console.error('Authentication forms not found:', {
                authForm: !!elements.authForm,
                forgotPasswordForm: !!elements.forgotPasswordForm,
                authTitle: !!elements.authTitle
            });
            utils.showToast('Form initialization error', 'error');
            return;
        }

        console.log('Toggling form to mode:', mode);
        elements.authForm.style.display = mode === 'forgot' ? 'none' : 'block';
        elements.forgotPasswordForm.style.display = mode === 'forgot' ? 'block' : 'none';
        elements.authTitle.textContent = mode === 'login' ? 'Login' : mode === 'register' ? 'Register' : 'Reset Password';
        if (elements.nameInput) elements.nameInput.style.display = mode === 'register' ? 'block' : 'none';
        if (elements.nameHint) elements.nameHint.style.display = mode === 'register' ? 'block' : 'none';
        if (elements.confirmPasswordInput) elements.confirmPasswordInput.style.display = mode === 'register' ? 'block' : 'none';
        if (elements.confirmPasswordHint) elements.confirmPasswordHint.style.display = mode === 'register' ? 'block' : 'none';
        if (elements.referralCodeInput) elements.referralCodeInput.style.display = mode === 'register' ? 'block' : 'none';
        if (elements.referralCodeHint) elements.referralCodeHint.style.display = mode === 'register' ? 'block' : 'none';
        if (elements.countryInput) elements.countryInput.style.display = mode === 'register' ? 'block' : 'none';
        if (elements.countryHint) elements.countryHint.style.display = mode === 'register' ? 'block' : 'none';
        if (elements.authSubmit) elements.authSubmit.textContent = mode === 'login' ? 'Login' : 'Register';
        if (elements.authToggle) elements.authToggle.innerHTML = mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Login';
        if (elements.forgotPasswordToggle) elements.forgotPasswordToggle.style.display = mode === 'login' ? 'block' : 'none';
    },

    async handleAuth(event) {
        event.preventDefault();
        console.log('Auth form submitted');
        const { auth, db } = firebaseServices.initialize();
        if (!auth || !db) {
            console.error('Authentication or database unavailable');
            utils.showToast('Authentication unavailable', 'error');
            return;
        }

        const elements = {
            authForm: document.getElementById('authForm'),
            forgotPasswordForm: document.getElementById('forgotPasswordForm'),
            messageBox: document.getElementById('message'),
            email: document.getElementById('email')?.value?.trim(),
            password: document.getElementById('password')?.value,
            name: document.getElementById('name')?.value?.trim(),
            confirmPassword: document.getElementById('confirmPassword')?.value,
            referralCode: document.getElementById('referralCode')?.value?.trim(),
            country: document.getElementById('country')?.value?.trim(),
            forgotEmail: document.getElementById('forgotEmail')?.value?.trim()
        };

        if (!elements.authForm || !elements.forgotPasswordForm || !elements.messageBox) {
            console.error('Missing authentication form elements:', {
                authForm: !!elements.authForm,
                forgotPasswordForm: !!elements.forgotPasswordForm,
                messageBox: !!elements.messageBox
            });
            utils.showToast('Form error', 'error');
            return;
        }

        elements.messageBox.style.display = 'none';

        const isLoginForm = elements.authForm.style.display === 'block' && 
                           document.getElementById('name')?.style.display !== 'block';
        const isRegisterForm = elements.authForm.style.display === 'block' && 
                              document.getElementById('name')?.style.display === 'block';
        const isForgotPasswordForm = elements.forgotPasswordForm.style.display === 'block';

        if (isLoginForm) {
            if (!elements.email || !elements.password) {
                console.warn('Missing email or password');
                elements.messageBox.style.display = 'block';
                elements.messageBox.className = 'messageBox error';
                elements.messageBox.textContent = 'Please fill in email and password';
                utils.showToast('Please fill in email and password', 'error');
                return;
            }
            try {
                console.log('Attempting login with email:', elements.email);
                const userCredential = await auth.signInWithEmailAndPassword(elements.email, elements.password);
                console.log('Login successful, user:', userCredential.user.uid);
                utils.showToast('Login successful!', 'success');
                await db.collection('users').doc(userCredential.user.uid).update({
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                });
            } catch (error) {
                console.error('Login error:', error.code, error.message);
                elements.messageBox.style.display = 'block';
                elements.messageBox.className = 'messageBox error';
                elements.messageBox.textContent = error.message || 'Login failed';
                utils.showToast(`Login failed: ${error.message}`, 'error');
            }
        } else if (isRegisterForm) {
            if (!elements.email || !elements.password || !elements.name || !elements.confirmPassword || !elements.country || !elements.referralCode) {
                console.warn('Missing required fields for registration');
                elements.messageBox.style.display = 'block';
                elements.messageBox.className = 'messageBox error';
                elements.messageBox.textContent = 'Please fill in all required fields including referral code';
                utils.showToast('Please fill in all required fields including referral code', 'error');
                return;
            }
            if (elements.password !== elements.confirmPassword) {
                console.warn('Passwords do not match');
                elements.messageBox.style.display = 'block';
                elements.messageBox.className = 'messageBox error';
                elements.messageBox.textContent = 'Passwords do not match';
                utils.showToast('Passwords do not match', 'error');
                return;
            }

            // Note: Referral code validation will happen after user creation
            // to avoid permission issues with unauthenticated queries
            try {
                console.log('Attempting registration with email:', elements.email);
                console.log('Registration data:', {
                    name: elements.name,
                    email: elements.email,
                    country: elements.country,
                    referralCode: elements.referralCode
                });
                
                const userCredential = await auth.createUserWithEmailAndPassword(elements.email, elements.password);
                const firebaseUid = userCredential.user.uid;
                const newUserId = utils.generateUserId(); // Generate 8-digit user ID
                console.log('User created with Firebase UID:', firebaseUid);
                console.log('Generated 8-digit user ID:', newUserId);
                
                // Create user document first
                try {
                    await db.collection('users').doc(firebaseUid).set({
                        name: elements.name,
                        email: elements.email,
                        country: elements.country,
                        referralCode: newUserId, // Use 8-digit ID as referral code
                        balance: 0,
                        referrals: 0,
                        status: 'inactive', // User starts as inactive
                        userId: newUserId, // 8-digit user ID
                        firebaseUid: firebaseUid, // Store Firebase UID for reference
                        selfDeposit: 0,
                        teamBusiness: 0,
                        directJoining: 0,
                        isBlocked: false,
                        profileCompleted: false, // Track if profile is completed
                        isActive: false, // User starts as inactive
                        totalDeposits: 0,
                        roiIncome: 0,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    console.log('User document created successfully');
                } catch (userError) {
                    console.error('Error creating user document:', userError);
                    throw new Error(`Failed to create user profile: ${userError.message}`);
                }
                
                // Create user settings
                try {
                    await db.collection('userSettings').doc(firebaseUid).set({
                        userId: firebaseUid,
                        theme: 'theme-blue',
                        notifications: true,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    console.log('User settings created successfully');
                } catch (settingsError) {
                    console.error('Error creating user settings:', settingsError);
                    // Don't throw error for settings, continue
                }
                
                // Handle referral if provided - ENHANCED VERSION
                if (elements.referralCode && elements.referralCode.trim()) {
                    try {
                        console.log('🔗 === PROCESSING REFERRAL CODE ===');
                        console.log('📝 Referral code:', elements.referralCode.trim());
                        
                        // Validate referral code format
                        const trimmedCode = elements.referralCode.trim();
                        if (!trimmedCode || trimmedCode.length < 8) {
                            console.log('❌ Invalid referral code format:', trimmedCode);
                            utils.showToast('Invalid referral code format', 'warning');
                            return;
                        }
                        
                        // Check if Firebase is properly initialized
                        if (!db || !firebase.firestore) {
                            console.error('❌ Firebase not properly initialized');
                            throw new Error('Firebase not initialized');
                        }
                        
                        // First validate the referral code and get referrer info
                        console.log('🔍 Searching for referrer with code:', trimmedCode);
                        const referralSnapshot = await db.collection('users')
                            .where('referralCode', '==', trimmedCode)
                            .limit(1)
                            .get();
                        
                        console.log('📊 Referral query result:', {
                            empty: referralSnapshot.empty,
                            size: referralSnapshot.size,
                            docs: referralSnapshot.docs.length
                        });
                            
                            if (referralSnapshot && !referralSnapshot.empty) {
                                const referrerDoc = referralSnapshot.docs[0];
                                const referrerId = referrerDoc.id;
                                const referrerData = referrerDoc.data();
                            
                            console.log('✅ Found referrer:', {
                                id: referrerId,
                                name: referrerData.name,
                                email: referrerData.email,
                                referralCode: referrerData.referralCode
                            });
                            
                            // Prevent self-referral
                            if (referrerId === firebaseUid) {
                                console.log('❌ Self-referral detected');
                                utils.showToast('Cannot refer yourself', 'warning');
                                return;
                            }
                            
                            // Update the new user's document with comprehensive referral data
                            const userUpdateData = {
                                referredBy: referrerId,
                                referrerCode: trimmedCode,
                                referrerName: referrerData.name || 'Unknown',
                                referralDate: firebase.firestore.FieldValue.serverTimestamp()
                            };
                            
                            console.log('📝 Updating user document with referral data:', userUpdateData);
                            await db.collection('users').doc(firebaseUid).update(userUpdateData);
                            console.log('✅ User document updated with referral data');
                            
                            // Create comprehensive referral document
                                const referralData = {
                                    referrerId: referrerId,
                                referredId: firebaseUid, // Firebase UID of the new user
                                    referredUserId: newUserId, // 8-digit user ID
                                referrerCode: trimmedCode,
                                referrerName: referrerData.name || 'Unknown',
                                referredName: elements.name,
                                referredEmail: elements.email,
                                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                                };
                                
                            console.log('📝 Creating referral document:', referralData);
                                const referralDocRef = await db.collection('referrals').add(referralData);
                                console.log('✅ Referral document created with ID:', referralDocRef.id);
                                
                                // Update referrer's referral count
                            console.log('📝 Updating referrer count for:', referrerId);
                                await db.collection('users').doc(referrerId).update({
                                    referrals: firebase.firestore.FieldValue.increment(1)
                                });
                            console.log('✅ Referrer count updated');
                                
                                // Verify the referral was created
                                const createdReferral = await referralDocRef.get();
                                if (createdReferral.exists) {
                                    console.log('✅ Referral verification successful');
                                console.log('📄 Final referral data:', createdReferral.data());
                                    utils.showToast(`Successfully referred by ${referrerData.name}`, 'success');
                                } else {
                                    console.log('❌ Referral verification failed');
                                throw new Error('Referral document not found after creation');
                            }
                            
                            // Log success summary
                            console.log('🎉 === REFERRAL PROCESSING SUCCESS ===');
                            console.log('✅ User document updated with referral data');
                            console.log('✅ Referral document created');
                            console.log('✅ Referrer count incremented');
                            console.log('✅ All verification passed');
                            
                            } else {
                            console.log('❌ No referrer found for code:', trimmedCode);
                            console.log('🔍 Available referral codes in system:');
                            
                            // Debug: Show some available referral codes
                            try {
                                const allUsers = await db.collection('users').limit(10).get();
                                allUsers.docs.forEach(doc => {
                                    const userData = doc.data();
                                    if (userData.referralCode) {
                                        console.log(`  - ${userData.name}: ${userData.referralCode}`);
                                    }
                                });
                            } catch (debugError) {
                                console.log('Could not fetch available codes for debugging');
                            }
                            
                            utils.showToast('Referral code not found', 'warning');
                        }
                    } catch (referralError) {
                        console.error('❌ === REFERRAL PROCESSING ERROR ===');
                        console.error('Error details:', {
                            code: elements.referralCode,
                            firebaseUid: firebaseUid,
                            error: referralError.message,
                            stack: referralError.stack
                        });
                        
                        // Log Firebase state
                        console.error('Firebase state:', {
                            db: !!db,
                            firestore: !!firebase.firestore,
                            auth: !!auth,
                            currentUser: auth.currentUser?.uid
                        });
                        
                        // Don't throw error for referral, continue with registration
                        utils.showToast('Registration successful, but referral could not be processed', 'warning');
                    }
                } else {
                    console.log('ℹ️ No referral code provided during registration');
                }
                
                console.log('Registration successful, user:', firebaseUid, 'with 8-digit ID:', newUserId);
                
                // Clear referral code from localStorage after successful registration
                localStorage.removeItem('referralCode');
                
                utils.showToast('Registration successful!', 'success');
            } catch (error) {
                console.error('Registration error:', error.code, error.message);
                console.error('Full error object:', error);
                elements.messageBox.style.display = 'block';
                elements.messageBox.className = 'messageBox error';
                elements.messageBox.textContent = error.message || 'Registration failed';
                utils.showToast(`Registration failed: ${error.message}`, 'error');
            }
        } else if (isForgotPasswordForm) {
            if (!elements.forgotEmail) {
                console.warn('Missing forgot email');
                elements.messageBox.style.display = 'block';
                elements.messageBox.className = 'messageBox error';
                elements.messageBox.textContent = 'Please enter your email';
                utils.showToast('Please enter your email', 'error');
                return;
            }
            try {
                console.log('Sending password reset email to:', elements.forgotEmail);
                await auth.sendPasswordResetEmail(elements.forgotEmail);
                utils.showToast('Password reset email sent!', 'success');
                setTimeout(() => authHandlers.toggleForms('login'), 1000);
            } catch (error) {
                console.error('Password reset error:', error.code, error.message);
                elements.messageBox.style.display = 'block';
                elements.messageBox.className = 'messageBox error';
                elements.messageBox.textContent = error.message || 'Password reset failed';
                utils.showToast(`Password reset failed: ${error.message}`, 'error');
            }
        }
    }
};
// Data Handlers
const dataHandlers = {
    async initializeUserData() {
        console.log('🔍 Starting user data initialization...');
        console.log('Current user:', state.currentUser?.uid);
        
        const { db } = firebaseServices.initialize();
        console.log('Database instance:', !!db);
        
        if (!state.currentUser || !db) {
            console.error('❌ User or database not initialized');
            console.error('User:', !!state.currentUser, 'DB:', !!db);
            utils.showToast('Please log in to view your data', 'error');
            return;
        }

        try {
            console.log('Initializing user data for:', state.currentUser.uid);
            const [
                userDoc,
                ticketsSnapshot,
                incomeSnapshot,
                referralsSnapshot,
                kycDoc,
                depositsSnapshot,
                withdrawalsSnapshot,
                activityLogSnapshot,
                paymentMethodsSnapshot,
                timelineSnapshot,
                recentActivitySnapshot,
                settingsDoc
            ] = await Promise.all([
                firebaseServices.safeGet(db.collection('users').doc(state.currentUser.uid)),
                firebaseServices.safeQuery(db.collection('tickets').where('userId', '==', state.currentUser.uid)),
                firebaseServices.safeQuery(db.collection('income').where('userId', '==', state.currentUser.uid)),
                firebaseServices.safeQuery(db.collection('referrals').where('referrerId', '==', state.currentUser.uid)),
                firebaseServices.safeGet(db.collection('kyc').doc(state.currentUser.uid)),
                firebaseServices.safeQuery(db.collection('deposits').where('userId', '==', state.currentUser.uid)),
                firebaseServices.safeQuery(db.collection('withdrawals').where('userId', '==', state.currentUser.uid)),
                firebaseServices.safeQuery(db.collection('activityLog').where('userId', '==', state.currentUser.uid).orderBy('createdAt', 'desc').limit(10)),
                firebaseServices.safeQuery(db.collection('paymentMethods').where('userId', '==', state.currentUser.uid)),
                firebaseServices.safeQuery(db.collection('userTimeline').where('userId', '==', state.currentUser.uid).orderBy('timestamp', 'desc').limit(5)),
                firebaseServices.safeQuery(db.collection('recentActivity').where('userId', '==', state.currentUser.uid).orderBy('timestamp', 'desc').limit(3)),
                firebaseServices.safeGet(db.collection('userSettings').doc(state.currentUser.uid))
            ]);

            if (!userDoc.exists) {
                console.log('User document does not exist, initializing new user');
                await dataHandlers.initializeNewUser();
                return;
            }

            state.userData = userDoc.data();
            console.log('🔍 Loaded user data:', state.userData);
            const settingsData = settingsDoc.exists ? settingsDoc.data() : await dataHandlers.initializeDefaultSettings();

            await dataHandlers.calculateLevelIncome();
            await dataHandlers.checkAndUpdateUserActivation();
            await dataHandlers.calculateROI();
            await dataHandlers.ensurePaymentMethodsExist();
            dataHandlers.loadDepositMethods();
            dataHandlers.loadUserData();
            dataHandlers.loadPaymentMethods(paymentMethodsSnapshot);
            dataHandlers.loadSupportTickets(ticketsSnapshot);
            dataHandlers.loadIncomeData(incomeSnapshot);
            dataHandlers.loadReferrals(referralsSnapshot);
            dataHandlers.loadKYCStatus(kycDoc);
            dataHandlers.loadDeposits(depositsSnapshot);
            dataHandlers.loadWithdrawals(withdrawalsSnapshot);
            dataHandlers.loadActivityLog(activityLogSnapshot);
            
            // Load optional features with error handling
            try {
                dataHandlers.loadTimeline(timelineSnapshot);
            } catch (error) {
                console.warn('Timeline loading failed:', error);
            }
            
            try {
                dataHandlers.loadRecentActivity(recentActivitySnapshot);
            } catch (error) {
                console.warn('Recent activity loading failed:', error);
            }
            
            dataHandlers.applySettings(settingsData);

            if (window.Chart && !state.chartsInitialized) {
                await dataHandlers.initPulseChart();
                await dataHandlers.initIncomeCharts();
                state.chartsInitialized = true;
            }

            dataHandlers.initializeChatListener();
            dataHandlers.loadNotifications();
            
            // Check if profile needs to be completed
            if (!state.userData.profileCompleted) {
                dataHandlers.showProfileCompletionPopup();
            }
            
            // Force refresh dashboard stats after initialization
            setTimeout(() => {
                if (window.refreshDashboardStats) {
                    window.refreshDashboardStats();
                }
                // Also directly update dashboard elements
                if (window.updateDashboardElements) {
                    window.updateDashboardElements();
                }
                
                // Debug: Force update dashboard elements after 1 second
                console.log('🔍 Debug: Forcing dashboard update after 1 second...');
                dataHandlers.loadUserData();
            }, 1000);
            
            console.log('User data initialized successfully');
        } catch (error) {
            console.error('Data initialization error:', error.message);
            console.error('Error details:', error.code, error.message);
            
            // Show user-friendly error message
            if (error.code === 'permission-denied') {
                utils.showToast('Permission denied. Please contact admin.', 'error');
            } else if (error.code === 'unavailable') {
                utils.showToast('Service temporarily unavailable. Please try again.', 'error');
            } else {
                utils.showToast(`Error loading data: ${error.message}`, 'error');
            }
        }
    },

    async initializeNewUser() {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) {
            console.error('Database or user not initialized');
            utils.showToast('Authentication or database unavailable', 'error');
            return;
        }

        try {
            const batch = db.batch();
            const userRef = db.collection('users').doc(state.currentUser.uid);
            const newUserId = utils.generateUserId();
            batch.set(userRef, {
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active',
                userId: newUserId, // 8-digit user ID
                firebaseUid: state.currentUser.uid, // Keep Firebase UID for reference
                balance: 0,
                name: state.currentUser.email?.split('@')[0] || 'User',
                email: state.currentUser.email || '',
                country: 'Unknown', // Default country
                                        referralCode: newUserId, // Use 8-digit ID as referral code
                        referrals: 0,
                selfDeposit: 0,
                teamBusiness: 0,
                directJoining: 0,
                        isBlocked: false,
                        profileCompleted: false, // Track if profile is completed
                        isActive: false, // User starts as inactive
                        totalDeposits: 0,
                        roiIncome: 0
            });
            batch.set(db.collection('userSettings').doc(state.currentUser.uid), {
                theme: 'theme-blue',
                notifications: true,
                userId: state.currentUser.uid,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await batch.commit();
            console.log('New user profile created');
            utils.showToast('New user profile created!', 'success');
            
            // Ensure payment methods exist for new users
            await dataHandlers.ensurePaymentMethodsExist();
            
            await dataHandlers.initializeUserData();
        } catch (error) {
            console.error('User initialization failed:', error.message);
            utils.showToast('Failed to create user profile', 'error');
        }
    },

    async initializeDefaultSettings() {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) {
            console.error('Database or user not initialized');
            utils.showToast('Authentication or database unavailable', 'error');
            return { theme: 'theme-blue', notifications: true };
        }
        try {
            const defaultSettings = {
                theme: 'theme-blue',
                notifications: true,
                userId: state.currentUser.uid,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await db.collection('userSettings').doc(state.currentUser.uid).set(defaultSettings);
            console.log('Default settings initialized');
            return defaultSettings;
        } catch (error) {
            console.error('Failed to initialize settings:', error.message);
            utils.showToast('Using default settings', 'warning');
            return { theme: 'theme-blue', notifications: true };
        }
    },

    async ensurePaymentMethodsExist() {
        const { db } = firebaseServices.initialize();
        if (!db) {
            console.error('Database not initialized for payment methods');
            return;
        }

        try {
            // Check if payment methods document exists
            const methodsDoc = await db.collection('adminSettings').doc('paymentMethods').get();
            
            if (!methodsDoc.exists) {
                console.log('Creating default payment methods document');
                const defaultMethods = {
                    usdtBep20: '0x1234567890abcdef...',
                    usdtTrc20: 'TRC20Address...',
                    upiId: 'admin@upi',
                    bankDetails: 'Bank: Example Bank, Account: 1234567890, IFSC: EXBK0001234',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                await db.collection('adminSettings').doc('paymentMethods').set(defaultMethods);
                console.log('Default payment methods created');
            }
        } catch (error) {
            console.error('Error ensuring payment methods exist:', error);
        }
    },

    async calculateLevelIncome() {
        const { db } = firebaseServices.initialize();
        if (!db) {
            console.error('Database not initialized');
            return;
        }
        
        if (!state.currentUser || !state.currentUser.uid) {
            console.error('User not initialized or user UID missing');
            return;
        }

        try {
            const userDoc = await firebaseServices.safeGet(db.collection('users').doc(state.currentUser.uid));
            if (!userDoc.exists) {
                console.log('User document not found for level income calculation');
                return;
            }

            const userData = userDoc.data();
            
            // Get level income settings from admin
            const levelIncomeSettings = await firebaseServices.safeGet(db.collection('settings').doc('levelIncomeList'));
            const levelSettings = levelIncomeSettings.exists ? levelIncomeSettings.data().levels || [] : [];
            
            if (levelSettings.length === 0) {
                console.log('No level income settings found');
                return;
            }

            // Get user's team data
            const teamData = await dataHandlers.getUserTeamData(state.currentUser.uid);
            let totalLevelIncome = 0;
            let dailyLevelIncome = 0;

            // Calculate income for each level
            for (let levelIndex = 0; levelIndex < levelSettings.length; levelIndex++) {
                const levelSetting = levelSettings[levelIndex];
                
                if (levelSetting.blocked) continue;

                const levelTeam = teamData[levelIndex] || [];
                
                // Check if user meets conditions for this level
                const meetsConditions = await dataHandlers.checkLevelConditions(userData, levelTeam, levelSetting);
                
                if (meetsConditions) {
                    // Calculate income for this level (cumulative)
                    const levelBusiness = levelTeam.reduce((sum, user) => sum + (user.selfDeposit || 0), 0);
                    const levelIncome = levelBusiness * (levelSetting.incomePercent / 100);
                    
                    totalLevelIncome += levelIncome;
                    
                    // Calculate today's level income for active downlines
                    const dailyIncomeForLevel = levelTeam.reduce((sum, user) => {
                        if (user.status === 'active' && user.selfDeposit > 0) {
                            return sum + (user.selfDeposit * (levelSetting.incomePercent / 100));
                        }
                        return sum;
                    }, 0);
                    
                    dailyLevelIncome += dailyIncomeForLevel;
                }
            }

            // Update user's level income (cumulative)
            await db.collection('users').doc(state.currentUser.uid).update({
                levelIncome: totalLevelIncome
            });

            state.userData.levelIncome = totalLevelIncome;
            // Store today's level income in state for UI display
            state.userData.todayLevel = dailyLevelIncome;
            
            console.log('Level income calculated:', { totalLevelIncome, dailyLevelIncome });
        } catch (error) {
            console.error('Error calculating level income:', error);
        }
    },

    async checkAndUpdateUserActivation() {
        const { db } = firebaseServices.initialize();
        if (!db) {
            console.error('Database not initialized');
            return;
        }
        
        if (!state.currentUser || !state.currentUser.uid) {
            console.error('User not initialized or user UID missing');
            return;
        }

        try {
            // Read user document
            const userDoc = await firebaseServices.safeGet(db.collection('users').doc(state.currentUser.uid));
            if (!userDoc.exists) {
                console.log('User document not found for activation check');
                return;
            }

            const userData = userDoc.data();
            const currentBalance = userData.balance || 0;

            // Compute approved deposits sum live to avoid stale totalDeposits
            const approvedDepositsSnap = await firebaseServices.safeQuery(
                db.collection('deposits').where('userId', '==', state.currentUser.uid).where('status', '==', 'approved')
            );
            let approvedDepositsTotal = 0;
            approvedDepositsSnap.docs.forEach(d => { approvedDepositsTotal += (d.data().amount || 0); });

            // Activation criteria: either wallet balance >= 20 OR approved deposits >= 20
            const isUserActive = (currentBalance >= 20) || (approvedDepositsTotal >= 20);
            const shouldUpdateStatus = (userData.isActive !== isUserActive) || ((userData.totalDeposits || 0) !== approvedDepositsTotal);

            if (shouldUpdateStatus) {
                // Update user's activation status
                await db.collection('users').doc(state.currentUser.uid).update({
                    isActive: isUserActive,
                    status: isUserActive ? 'active' : 'inactive',
                    totalDeposits: approvedDepositsTotal,
                    lastActivationCheck: firebase.firestore.FieldValue.serverTimestamp()
                });

                // Update local state
                state.userData.isActive = isUserActive;
                state.userData.status = isUserActive ? 'active' : 'inactive';
                state.userData.totalDeposits = approvedDepositsTotal;

                console.log('User activation status updated:', { 
                    userId: state.currentUser.uid, 
                    isActive: isUserActive, 
                    balance: currentBalance,
                    approvedDepositsTotal
                });

                // Show notification to user
                if (isUserActive) {
                    utils.showToast('Congratulations! Your account is now active. You can now earn ROI income.', 'success');
                } else {
                    utils.showToast('Your account is inactive. Add $20 or more to your wallet to activate and earn ROI income.', 'warning');
                }
            }

            return isUserActive;
        } catch (error) {
            console.error('Error checking user activation:', error);
            return false;
        }
    },

    async calculateROI() {
        const { db } = firebaseServices.initialize();
        if (!db) {
            console.error('Database not initialized');
            return;
        }
        if (!state.currentUser || !state.currentUser.uid) {
            console.error('User not initialized or user UID missing');
            return;
        }
        try {
            const isUserActive = await dataHandlers.checkAndUpdateUserActivation();
            const adminSettingsDoc = await firebaseServices.safeGet(db.collection('adminSettings').doc('roi'));
            // Provide safe defaults if admin settings missing so UI isn't stuck at 0 forever
            const roiSettings = adminSettingsDoc.exists ? adminSettingsDoc.data() : { dailyROI: 0.01, maxROI: 0.30 };
            state.adminROI = roiSettings;
            const dailyROI = roiSettings.dailyROI || 0.01;
            const maxROI = roiSettings.maxROI || 0.30;

            const depositsSnapshot = await firebaseServices.safeQuery(
                db.collection('deposits').where('userId', '==', state.currentUser.uid).where('status', '==', 'approved')
            );

            let totalDeposits = 0, totalROIEarned = 0, dailyROIEarned = 0;
            depositsSnapshot.docs.forEach(doc => { totalDeposits += (doc.data().amount || 0); });

            if (isUserActive) {
                depositsSnapshot.docs.forEach(doc => {
                    const dep = doc.data();
                    const amount = dep.amount || 0;
                    const approvedAt = dep.approvedAt?.toDate() || dep.createdAt?.toDate() || new Date();
                    // Inclusive of current day so ROI reflects immediately on approval day
                    const daysSinceInclusive = Math.floor((Date.now() - approvedAt.getTime()) / (1000*60*60*24)) + 1;
                    const maxDays = Math.floor(maxROI / dailyROI);
                    const roiDays = Math.max(0, Math.min(daysSinceInclusive, maxDays));
                    totalROIEarned += amount * dailyROI * roiDays;
                    dailyROIEarned += amount * dailyROI;
                });
                state.userData.todayROI = dailyROIEarned;
            } else {
                state.userData.todayROI = 0;
            }

            // IMPORTANT: Do not write to users doc here to avoid client-side permission issues.
            // Persistence is handled by daily payout (walletTransactions + user balance) at 10 AM.
            state.userData.roiIncome = totalROIEarned;
            state.userData.totalDeposits = totalDeposits;
            console.log('ROI calculated:', { totalDeposits, totalROIEarned, dailyROIEarned, dailyROI, maxROI, isUserActive });
        } catch (error) {
            console.error('Error calculating ROI:', error);
        }
    },

    loadDepositMethods() {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) {
            console.error('Database or user not initialized');
            return;
        }

        // Load deposit methods from admin settings with better error handling
        firebaseServices.safeGet(db.collection('adminSettings').doc('paymentMethods'))
            .then(doc => {
            if (doc.exists) {
                    const methods = doc.data();
                    state.depositMethods = {
                        usdtBep20: methods.usdtBep20 || '',
                        usdtTrc20: methods.usdtTrc20 || '',
                        upiId: methods.upiId || '',
                        bankDetails: methods.bankDetails || ''
                    };
                    console.log('Deposit methods loaded from admin settings:', state.depositMethods);
                } else {
                    console.warn('No deposit methods found in admin settings, using fallback');
                    // Set default methods if none exist
                    state.depositMethods = {
                        usdtBep20: '0x1234567890abcdef...',
                        usdtTrc20: 'TRC20Address...',
                        upiId: 'admin@upi',
                        bankDetails: 'Bank: Example Bank, Account: 1234567890, IFSC: EXBK0001234'
                    };
                }
                
                // Always populate the dropdown, even with fallback methods
                    const depositMethodSelect = document.getElementById('depositMethod');
                    if (depositMethodSelect) {
                        depositMethodSelect.innerHTML = '<option value="" disabled selected>Choose a Method</option>';
                    
                    // Only show methods that have values
                    if (state.depositMethods.usdtBep20 && state.depositMethods.usdtBep20.trim()) {
                            depositMethodSelect.innerHTML += '<option value="USDT BEP20">USDT BEP20</option>';
                        }
                    if (state.depositMethods.usdtTrc20 && state.depositMethods.usdtTrc20.trim()) {
                            depositMethodSelect.innerHTML += '<option value="USDT TRC20">USDT TRC20</option>';
                        }
                    if (state.depositMethods.upiId && state.depositMethods.upiId.trim()) {
                            depositMethodSelect.innerHTML += '<option value="UPI">UPI</option>';
                        }
                    if (state.depositMethods.bankDetails && state.depositMethods.bankDetails.trim()) {
                            depositMethodSelect.innerHTML += '<option value="Bank">Bank Transfer</option>';
                        }
                    
                    // If no methods are available, show a message
                    if (depositMethodSelect.children.length === 1) {
                        depositMethodSelect.innerHTML = '<option value="" disabled selected>No payment methods available</option>';
                    }
                    
                        // Add change event listener for method details
                        depositMethodSelect.addEventListener('change', () => {
                            const selectedMethod = depositMethodSelect.value;
                            const depositMethodDetails = document.getElementById('depositMethodDetails');
                            if (depositMethodDetails) {
                                let detailsHtml = '';
                                if (selectedMethod === 'USDT BEP20' && state.depositMethods.usdtBep20) {
                                    detailsHtml = `<p><strong>USDT BEP20 Address:</strong> ${state.depositMethods.usdtBep20}</p>`;
                                } else if (selectedMethod === 'USDT TRC20' && state.depositMethods.usdtTrc20) {
                                    detailsHtml = `<p><strong>USDT TRC20 Address:</strong> ${state.depositMethods.usdtTrc20}</p>`;
                                } else if (selectedMethod === 'UPI' && state.depositMethods.upiId) {
                                    detailsHtml = `<p><strong>UPI ID:</strong> ${state.depositMethods.upiId}</p>`;
                                } else if (selectedMethod === 'Bank' && state.depositMethods.bankDetails) {
                                    detailsHtml = `<p><strong>Bank Details:</strong> ${state.depositMethods.bankDetails}</p>`;
                                }
                                depositMethodDetails.innerHTML = detailsHtml;
                            }
                        });
                }
            })
            .catch(error => {
                console.error('Error loading deposit methods:', error);
                // Set fallback methods and populate dropdown
                state.depositMethods = {
                    usdtBep20: '0x1234567890abcdef...',
                    usdtTrc20: 'TRC20Address...',
                    upiId: 'admin@upi',
                    bankDetails: 'Bank: Example Bank, Account: 1234567890, IFSC: EXBK0001234'
                };
                
                const depositMethodSelect = document.getElementById('depositMethod');
                if (depositMethodSelect) {
                    depositMethodSelect.innerHTML = `
                        <option value="" disabled selected>Choose a Method</option>
                        <option value="USDT BEP20">USDT BEP20</option>
                        <option value="USDT TRC20">USDT TRC20</option>
                        <option value="UPI">UPI</option>
                        <option value="Bank">Bank Transfer</option>
                    `;
                    
                    // Add change event listener
                    depositMethodSelect.addEventListener('change', () => {
                        const selectedMethod = depositMethodSelect.value;
                        const depositMethodDetails = document.getElementById('depositMethodDetails');
                        if (depositMethodDetails) {
                            let detailsHtml = '';
                            if (selectedMethod === 'USDT BEP20') {
                                detailsHtml = `<p><strong>USDT BEP20 Address:</strong> ${state.depositMethods.usdtBep20}</p>`;
                            } else if (selectedMethod === 'USDT TRC20') {
                                detailsHtml = `<p><strong>USDT TRC20 Address:</strong> ${state.depositMethods.usdtTrc20}</p>`;
                            } else if (selectedMethod === 'UPI') {
                                detailsHtml = `<p><strong>UPI ID:</strong> ${state.depositMethods.upiId}</p>`;
                            } else if (selectedMethod === 'Bank') {
                                detailsHtml = `<p><strong>Bank Details:</strong> ${state.depositMethods.bankDetails}</p>`;
                            }
                            depositMethodDetails.innerHTML = detailsHtml;
                        }
                    });
                }
        });
    },

    loadUserData() {
        // Check if user data is available
        if (!state.userData) {
            console.warn('⚠️ User data not available, skipping loadUserData');
            return;
        }
        
        const elements = {
            userNameDisplay: document.getElementById('userNameDisplay'),
            userId: document.getElementById('userId'),
            userBalance: document.getElementById('userBalance'),
            totalIncome: document.getElementById('totalIncome'),
            totalIncomeCard: document.getElementById('totalIncomeCard'),
            totalDeposits: document.getElementById('totalDeposits'),
            totalReferrals: document.getElementById('totalReferrals'),
            pendingTickets: document.getElementById('pendingTickets'),
            levelIncome: document.getElementById('levelIncome'),
            roiIncome: document.getElementById('roiIncome'),
            todayIncome: document.getElementById('todayIncome'),
            principalAmount: document.getElementById('principalAmount'),
            totalWithdrawable: document.getElementById('totalWithdrawable'),
            referralLink: document.getElementById('referralLink'),
            profilePic: document.getElementById('profilePic'),
            editName: document.getElementById('editName'),
            editEmail: document.getElementById('editEmail'),
            editMobile: document.getElementById('editMobile'),
            profileStatusText: document.getElementById('profileStatusText'),
            blockedStatus: document.getElementById('blockedStatus')
        };

        if (!elements.userNameDisplay || !elements.userId || !elements.userBalance || !elements.totalIncome || !elements.referralLink) {
            console.error('Missing user data elements:', {
                userNameDisplay: !!elements.userNameDisplay,
                userId: !!elements.userId,
                userBalance: !!elements.userBalance,
                totalIncome: !!elements.totalIncome,
                referralLink: !!elements.referralLink
            });
            utils.showToast('Error loading user interface', 'error');
            return;
        }

        elements.userNameDisplay.textContent = state.userData.name || 'User';
        
        // Handle case where currentUser might be null
        const userId = state.userData.userId || (state.currentUser && state.currentUser.uid ? state.currentUser.uid.substring(0, 8) : 'N/A');
        elements.userId.textContent = userId;
        
        elements.userBalance.textContent = utils.formatCurrency(state.userData.balance || 0);
        
        // Show activation status
        const activationStatus = state.userData.isActive ? 'Active' : 'Inactive';
        const activationColor = state.userData.isActive ? 'var(--success)' : 'var(--danger)';
        const activationBgColor = state.userData.isActive ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 0, 0, 0.1)';
        
        if (elements.userId) {
            const displayUserId = state.userData.userId || (state.currentUser && state.currentUser.uid ? state.currentUser.uid.substring(0, 8) : 'N/A');
            elements.userId.innerHTML = `${displayUserId} <span style="color: ${activationColor}; font-size: 12px; margin-left: 8px;">(${activationStatus})</span>`;
        }
        
        // Show activation status banner
        const activationStatusDiv = document.getElementById('activationStatus');
        const activationStatusText = document.getElementById('activationStatusText');
        if (activationStatusDiv && activationStatusText) {
            activationStatusDiv.style.display = 'block';
            activationStatusDiv.style.backgroundColor = activationBgColor;
            activationStatusDiv.style.color = activationColor;
            activationStatusDiv.style.border = `1px solid ${activationColor}`;
            
            if (state.userData.isActive) {
                activationStatusText.textContent = '✅ Account Active - You can earn ROI income!';
            } else {
                const currentBalance = state.userData.balance || 0;
                const neededAmount = Math.max(0, 20 - currentBalance);
                activationStatusText.textContent = `⚠️ Account Inactive - Add $${neededAmount.toFixed(2)} more to activate and earn ROI income`;
            }
        }
        
        // Calculate total income from various sources
        console.log('🔍 Calculating total income from:', {
            selfIncome: state.userData.selfIncome,
            levelIncome: state.userData.levelIncome,
            rewardIncome: state.userData.rewardIncome,
            roiIncome: state.userData.roiIncome
        });
        
        // Dashboard requirement: Total Income = ROI (cumulative) + Level (cumulative)
        const totalIncome = (state.userData.levelIncome || 0) + (state.userData.roiIncome || 0);
        elements.totalIncome.textContent = utils.formatCurrency(totalIncome);
        if (elements.totalIncomeCard) elements.totalIncomeCard.textContent = utils.formatCurrency(totalIncome);
        console.log('📊 Total income (ROI+Level) updated:', utils.formatCurrency(totalIncome));
        
        // Show total deposits
        if (elements.totalDeposits) elements.totalDeposits.textContent = utils.formatCurrency(state.userData.totalDeposits || 0);
        
        // Show total referrals - ENHANCED VERSION
        if (elements.totalReferrals) {
            // Get real-time referral count from database
            if (dataHandlers && typeof dataHandlers.loadRealTimeReferralCount === 'function') {
                dataHandlers.loadRealTimeReferralCount().then(count => {
                    elements.totalReferrals.textContent = count;
                    console.log('📊 Total referrals updated:', count);
                }).catch(() => {
                    // Fallback to stored value
                    elements.totalReferrals.textContent = state.userData.referrals || 0;
                    console.log('📊 Total referrals fallback:', state.userData.referrals || 0);
                });
            } else {
                // Fallback to stored value if function not available
                elements.totalReferrals.textContent = state.userData.referrals || 0;
                console.log('📊 Total referrals from state:', state.userData.referrals || 0);
            }
        }
        
        // Show pending tickets count
        if (elements.pendingTickets) {
            dataHandlers.loadPendingTicketsCount().then(count => {
                elements.pendingTickets.textContent = count;
                console.log('📊 Pending tickets updated:', count);
            }).catch(() => {
                elements.pendingTickets.textContent = '0';
                console.log('📊 Pending tickets fallback: 0');
            });
        }
        
        // Show level income today (From Referrals card requirement)
        if (elements.levelIncome) {
            const todayLevel = state.userData.todayLevel || state.userData.todayLevelIncome || 0;
            elements.levelIncome.textContent = utils.formatCurrency(todayLevel);
            console.log('📊 Level daily updated:', utils.formatCurrency(todayLevel));
        }
        
        // Show ROI income today (Daily Returns card requirement)
        if (elements.roiIncome) {
            const todayRoi = state.userData.todayROI || 0;
            elements.roiIncome.textContent = utils.formatCurrency(todayRoi);
            console.log('📊 ROI daily updated:', utils.formatCurrency(todayRoi));
        }
        
        // Today's Total = today's ROI + today's Level
        if (elements.todayIncome) {
            const todayTotal = (state.userData.todayROI || 0) + (state.userData.todayLevel || state.userData.todayLevelIncome || 0);
            elements.todayIncome.textContent = utils.formatCurrency(todayTotal);
            console.log('📊 Today\'s income updated (ROI+Level):', utils.formatCurrency(todayTotal));
        }
        
        // Show principal amount (total deposits)
        if (elements.principalAmount) {
            const principalAmount = state.userData.totalDeposits || 0;
            elements.principalAmount.textContent = utils.formatCurrency(principalAmount);
            console.log('📊 Principal amount updated:', utils.formatCurrency(principalAmount));
        }
        
        // Show available income amount (not principal)
        if (elements.totalWithdrawable) {
            const availableIncome = (state.userData.selfIncome || 0) + (state.userData.levelIncome || 0) + 
                                   (state.userData.rewardIncome || 0) + (state.userData.roiIncome || 0);
            elements.totalWithdrawable.textContent = utils.formatCurrency(availableIncome);
            console.log('📊 Available income updated:', utils.formatCurrency(availableIncome));
        }
        
        const referralCode = state.userData.referralCode || state.userData.userId || (state.currentUser && state.currentUser.uid ? utils.generateReferralCode(state.currentUser.uid) : 'N/A');
        elements.referralLink.value = `https://theonewealthwave.com/index.html?ref=${referralCode}`;
        if (elements.profilePic) elements.profilePic.src = state.userData.profilePic || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        if (elements.editName) elements.editName.value = state.userData.name || '';
        if (elements.editEmail) elements.editEmail.value = state.userData.email || '';
        if (elements.editMobile) elements.editMobile.value = state.userData.mobile || '';
        
        // Load new profile fields
        const editAddress = document.getElementById('editAddress');
        const editCountry = document.getElementById('editCountry');
        const lastUpdated = document.getElementById('lastUpdated');
        
        if (editAddress) editAddress.value = state.userData.address || '';
        if (editCountry) editCountry.value = state.userData.country || '';
        if (lastUpdated) lastUpdated.textContent = state.userData.updatedAt ? utils.formatDate(state.userData.updatedAt) : 'Never';
        
        if (elements.profileStatusText) elements.profileStatusText.textContent = state.userData.status || 'Active';
        if (elements.blockedStatus) elements.blockedStatus.style.display = state.userData.isBlocked ? 'block' : 'none';
            
            // Update profile section visibility based on completion status
            dataHandlers.updateProfileSectionVisibility();
    },

    loadPaymentMethods(snapshot) {
        const elements = {
            depositDropdown: document.getElementById('depositMethod'),
            withdrawalDropdown: document.getElementById('withdrawalMethod')
        };

        if (!elements.depositDropdown || !elements.withdrawalDropdown) {
            console.error('Missing payment method elements:', {
                depositDropdown: !!elements.depositDropdown,
                withdrawalDropdown: !!elements.withdrawalDropdown
            });
            utils.showToast('Error loading payment methods', 'error');
            return;
        }

        snapshot.forEach(doc => {
            const method = doc.data();
            if (method.userId !== state.currentUser.uid) return;
            const option = utils.createElement('option', { value: doc.id }, method.name);
            if (method.deposit) elements.depositDropdown.appendChild(option.cloneNode(true));
            if (method.withdrawal) elements.withdrawalDropdown.appendChild(option.cloneNode(true));
        });
    },

    loadSupportTickets(snapshot) {
        const ticketsBody = document.getElementById('supportTicketsBody');
        if (!ticketsBody) {
            console.error('Missing supportTicketsBody');
            utils.showToast('Error loading support tickets', 'error');
            return;
        }

        ticketsBody.innerHTML = snapshot.empty
            ? '<tr><td colspan="4">No tickets available</td></tr>'
            : snapshot.docs.map(doc => {
                const ticket = doc.data();
                if (ticket.userId !== state.currentUser.uid) return '';
                return `<tr>
                    <td>${doc.id.substring(0, 8)}</td>
                    <td>${utils.sanitize(ticket.subject) || 'N/A'}</td>
                    <td>${ticket.status || 'Open'}</td>
                    <td><button class="view-ticket" data-id="${doc.id}">View</button></td>
                </tr>`;
            }).join('');

        document.querySelectorAll('.view-ticket').forEach(btn => {
            btn.addEventListener('click', async () => {
                const ticketId = btn.getAttribute('data-id');
                const { db } = firebaseServices.initialize();
                const ticketDoc = await firebaseServices.safeGet(db.collection('tickets').doc(ticketId));
                if (ticketDoc.exists && ticketDoc.data().userId === state.currentUser.uid) {
                    utils.showToast(`Ticket: ${ticketDoc.data().subject}\nMessage: ${ticketDoc.data().message}`, 'success');
                } else {
                    utils.showToast('Access denied or ticket not found', 'error');
                }
            });
        });
    },

    loadIncomeData(snapshot) {
        const elements = {
            selfIncomeBody: document.getElementById('selfIncomeBody'),
            levelIncomeBody: document.getElementById('levelIncomeBody'),
            rewardIncomeBody: document.getElementById('rewardIncomeBody'),
            roiIncomeBody: document.getElementById('roiIncomeBody'),
            levelIncomeDetails: document.getElementById('levelIncomeDetails')
        };

        if (!elements.selfIncomeBody || !elements.levelIncomeBody || !elements.rewardIncomeBody || !elements.roiIncomeBody || !elements.levelIncomeDetails) {
            console.error('Missing income elements:', {
                selfIncomeBody: !!elements.selfIncomeBody,
                levelIncomeBody: !!elements.levelIncomeBody,
                rewardIncomeBody: !!elements.rewardIncomeBody,
                roiIncomeBody: !!elements.roiIncomeBody,
                levelIncomeDetails: !!elements.levelIncomeDetails
            });
            utils.showToast('Error loading income data', 'error');
            return;
        }

        Object.values(elements).forEach(body => {
            if (body.id !== 'levelIncomeDetails') body.innerHTML = '';
        });
        const incomeData = { self: [], level: [], reward: [], roi: [] };

        snapshot.forEach(doc => {
            const income = doc.data();
            if (income.userId !== state.currentUser.uid) return;
            const row = utils.createElement('tr', {},
                utils.createElement('td', {}, utils.formatDate(income.createdAt)),
                utils.createElement('td', {}, utils.formatCurrency(income.amount)),
                income.type === 'level' ? utils.createElement('td', {}, income.level || 'N/A') :
                income.type === 'reward' ? utils.createElement('td', {}, income.rank || 'N/A') :
                income.type === 'roi' ? utils.createElement('td', {}, income.status || 'N/A') : utils.createElement('td', {})
            );

            if (income.type === 'self') {
                elements.selfIncomeBody.appendChild(row);
                incomeData.self.push({ date: utils.formatDate(income.createdAt), amount: income.amount || 0 });
            } else if (income.type === 'level') {
                elements.levelIncomeBody.appendChild(row);
                incomeData.level.push({ date: utils.formatDate(income.createdAt), amount: income.amount || 0 });
            } else if (income.type === 'reward') {
                elements.rewardIncomeBody.appendChild(row);
                incomeData.reward.push({ date: utils.formatDate(income.createdAt), amount: income.amount || 0 });
            } else if (income.type === 'roi') {
                elements.roiIncomeBody.appendChild(row);
                incomeData.roi.push({ date: utils.formatDate(income.createdAt), amount: income.amount || 0 });
            }
        });

        elements.levelIncomeDetails.innerHTML = incomeData.level.length
            ? incomeData.level.map(d => `<p>Date: ${d.date}, Amount: ${utils.formatCurrency(d.amount)}</p>`).join('')
            : '<p>No level income data available</p>';

        if (window.Chart && !state.chartsInitialized) {
            dataHandlers.initIncomeCharts(incomeData);
        }
    },

    async loadReferrals(snapshot) {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) {
            console.error('❌ Database or user not initialized');
            utils.showToast('Authentication or database unavailable', 'error');
            return;
        }

        const referralsBody = document.getElementById('referralsTableBody');
        if (!referralsBody) {
            console.error('❌ Missing referralsTableBody');
            utils.showToast('Error loading referrals', 'error');
            return;
        }

        console.log('🔄 === LOADING REFERRALS ===');
        console.log('👤 Current user ID:', state.currentUser.uid);
        
        try {
            // Always query directly to ensure we get the latest data
            console.log('📡 Querying referrals for user:', state.currentUser.uid);
            const directReferralsSnapshot = await db.collection('referrals').where('referrerId', '==', state.currentUser.uid).get();
            
            console.log('📊 Direct referrals found:', directReferralsSnapshot.docs.length);
            
            // Log all referral documents for debugging
            directReferralsSnapshot.docs.forEach((doc, index) => {
                console.log(`📋 Referral ${index + 1}:`, {
                    id: doc.id,
                    data: doc.data()
                });
            });
            
            if (directReferralsSnapshot.empty) {
                console.log('📭 No direct referrals found');
                referralsBody.innerHTML = '<tr><td colspan="6">No referrals available</td></tr>';
                return;
            }

            // Process direct referrals with improved error handling
            const directReferrals = [];
            const failedReferrals = [];
            
            for (const doc of directReferralsSnapshot.docs) {
                const referral = doc.data();
                console.log('🔄 Processing referral:', referral);
                
                try {
                    // Primary method: Use referredId (Firebase UID)
                    let referredUserId = referral.referredId;
                    let userDoc = null;
                    
                    if (referredUserId) {
                        console.log('🔍 Looking up user by Firebase UID:', referredUserId);
                        userDoc = await db.collection('users').doc(referredUserId).get();
                    }
                    
                    // Fallback method: If not found, try to find by referredUserId (8-digit ID)
                    if (!userDoc || !userDoc.exists) {
                        const referredUserId8Digit = referral.referredUserId;
                        if (referredUserId8Digit) {
                            console.log('🔍 Fallback: Looking up user by 8-digit ID:', referredUserId8Digit);
                            const userQuery = await db.collection('users').where('userId', '==', referredUserId8Digit).get();
                            if (!userQuery.empty) {
                                userDoc = userQuery.docs[0];
                                referredUserId = userDoc.id; // Update to Firebase UID
                                console.log('✅ Found user by 8-digit ID fallback');
                            }
                        }
                    }
                    
                    if (userDoc && userDoc.exists) {
                        const userData = userDoc.data();
                        console.log('✅ User data found:', {
                                    name: userData.name,
                                    email: userData.email,
                                    status: userData.status,
                            referralCode: userData.referralCode,
                            referredBy: userData.referredBy || 'NOT SET'
                        });
                        
                        // Verify referral consistency
                        if (userData.referredBy !== state.currentUser.uid) {
                            console.warn('⚠️ Referral inconsistency detected:', {
                                expected: state.currentUser.uid,
                                actual: userData.referredBy || 'NOT SET',
                                userName: userData.name
                            });
                        }
                        
                        directReferrals.push({
                            userId: referredUserId,
                            name: userData.name || 'Unknown',
                            email: userData.email || 'N/A',
                            mobile: userData.mobile || 'N/A',
                            status: userData.status || 'Active',
                            referralCode: userData.referralCode,
                            createdAt: referral.createdAt,
                            joinDate: userData.createdAt,
                            referredBy: userData.referredBy,
                            selfDeposit: userData.selfDeposit || 0
                        });
                        console.log('✅ Added referral:', userData.name);
                    } else {
                        console.log('❌ User document not found for referral:', referral);
                        failedReferrals.push({
                            referralId: doc.id,
                            referredId: referral.referredId,
                            referredUserId: referral.referredUserId,
                            referrerCode: referral.referrerCode
                        });
                        
                        // Add a placeholder entry for debugging
                        directReferrals.push({
                            userId: referral.referredId || 'Unknown',
                            name: 'User Not Found',
                            email: 'N/A',
                            status: 'Unknown',
                            referralCode: 'N/A',
                            createdAt: referral.createdAt,
                            joinDate: referral.createdAt,
                            referredBy: 'NOT SET'
                        });
                    }
                } catch (userError) {
                    console.error('❌ Error fetching user data:', userError);
                    failedReferrals.push({
                        referralId: doc.id,
                        error: userError.message
                    });
                }
            }

            console.log('📊 Processed referrals:', directReferrals.length);
            if (failedReferrals.length > 0) {
                console.warn('⚠️ Failed referrals:', failedReferrals);
            }

            if (directReferrals.length === 0) {
                referralsBody.innerHTML = '<tr><td colspan="6">No referrals available</td></tr>';
                return;
            }

            // Build table HTML with compact display
            let tableHTML = `<tr class="level-header">
                <td colspan="8" style="background: rgba(59, 130, 246, 0.1); font-weight: bold; text-align: center; padding: 8px;">
                    Level 1 - ${directReferrals.length} Users
                </td>
            </tr>`;
            
            directReferrals.forEach(user => {
                const statusColor = user.status === 'Active' ? 'var(--success)' : 'var(--danger)';
                const statusStyle = `color: ${statusColor}; font-weight: bold; font-size: 11px;`;
                
                tableHTML += `<tr class="level-1-user" style="font-size: 12px;">
                    <td style="padding: 6px 8px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${utils.sanitize(user.name)}">${utils.sanitize(user.name)}</td>
                    <td style="padding: 6px 8px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${user.email}">${user.email}</td>
                    <td style="padding: 6px 8px; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${user.mobile || 'N/A'}">${user.mobile || 'N/A'}</td>
                    <td style="padding: 6px 8px; font-family: monospace; font-size: 11px;">${user.userId.substring(0, 8)}</td>
                    <td style="padding: 6px 8px; font-size: 11px;">${utils.formatDate(user.joinDate || user.createdAt)}</td>
                    <td style="${statusStyle} padding: 6px 8px;">${user.status}</td>
                    <td style="padding: 6px 8px; font-size: 11px; font-weight: bold;">${utils.formatCurrency(user.selfDeposit || 0)}</td>
                    <td style="padding: 6px 8px;">
                        <button class="copy-link" style="padding: 4px 8px; font-size: 10px; border-radius: 4px;" data-link="https://theonewealthwave.com/index.html?ref=${user.referralCode || user.userId.substring(0, 8)}">Copy</button>
                    </td>
                </tr>`;
            });

            // Add complete team button if not already present
            const completeTeamButton = document.getElementById('completeTeamButton');
            if (!completeTeamButton) {
                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'complete-team-container';
                buttonContainer.innerHTML = `
                    <button id="completeTeamButton" class="complete-team-btn">
                        <i class="fas fa-layer-group"></i>
                        View Team Levels
                    </button>
                `;
                referralsBody.parentElement.insertBefore(buttonContainer, referralsBody);
                
                // Add event listener
                document.getElementById('completeTeamButton').addEventListener('click', async () => {
                    console.log('🚀 Team levels button clicked');
                    try {
                        // Try direct function call first
                        if (typeof window.showTeamLevels === 'function') {
                            await window.showTeamLevels();
                        } else if (dataHandlers && typeof dataHandlers.showTeamLevels === 'function') {
                            await dataHandlers.showTeamLevels();
                        } else {
                            console.error('❌ showTeamLevels function not available');
                            utils.showToast('Team levels feature not available', 'error');
                        }
                    } catch (error) {
                        console.error('❌ Error in button click:', error);
                        utils.showToast('Error loading team levels', 'error');
                    }
                });
            }

            referralsBody.innerHTML = tableHTML;
            console.log('✅ Referrals table updated successfully');

            // Add event listeners for copy buttons
            document.querySelectorAll('.copy-link').forEach(btn => {
                btn.addEventListener('click', () => {
                    navigator.clipboard.writeText(btn.getAttribute('data-link'))
                        .then(() => utils.showToast('Referral link copied!', 'success'))
                        .catch(() => utils.showToast('Failed to copy link', 'error'));
                });
            });

            // Show summary in console
            console.log('📊 === REFERRAL LOADING SUMMARY ===');
            console.log(`Total referrals processed: ${directReferrals.length}`);
            console.log(`Failed referrals: ${failedReferrals.length}`);
            if (failedReferrals.length > 0) {
                console.log('Consider running checkReferralData() to debug issues');
            }

        } catch (error) {
            console.error('❌ Error loading referrals:', error);
            utils.showToast('Error loading referrals', 'error');
            referralsBody.innerHTML = '<tr><td colspan="6">Error loading referrals</td></tr>';
        }
    },

    async getAllReferralLevels(userId, maxLevels = 30) {
        const { db } = firebaseServices.initialize();
        if (!db) return [];

        const levels = [];
        let currentLevelUsers = [userId];
        
        for (let level = 0; level < maxLevels; level++) {
            if (currentLevelUsers.length === 0) break;
            
            const levelUsers = [];
            
            // Get all users referred by current level users
            for (const referrerId of currentLevelUsers) {
                const referralsSnapshot = await firebaseServices.safeQuery(
                    db.collection('referrals').where('referrerId', '==', referrerId)
                );
                
                for (const doc of referralsSnapshot.docs) {
                    const referral = doc.data();
                    const userDoc = await firebaseServices.safeGet(
                        db.collection('users').doc(referral.referredId)
                    );
                    
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        levelUsers.push({
                            userId: referral.referredId,
                            name: userData.name,
                            email: userData.email,
                            status: userData.status,
                            referralCode: userData.referralCode,
                            createdAt: referral.createdAt
                        });
                    }
                }
            }
            
            if (levelUsers.length > 0) {
                levels.push(levelUsers);
                currentLevelUsers = levelUsers.map(user => user.userId);
            } else {
                break;
            }
        }
        
        return levels;
    },

    async getUserTeamData(userId) {
        const { db } = firebaseServices.initialize();
        if (!db) {
            console.error('Database not initialized');
            return [];
        }

        try {
            const teamData = [];
            let currentLevel = [userId];
            
            for (let level = 0; level < 30; level++) {
                const nextLevel = [];
                
                for (const currentUserId of currentLevel) {
                    const referralsSnapshot = await firebaseServices.safeQuery(
                        db.collection('referrals').where('referrerId', '==', currentUserId)
                    );
                    
                    for (const doc of referralsSnapshot.docs) {
                        const referral = doc.data();
                        const userDoc = await firebaseServices.safeGet(db.collection('users').doc(referral.referredId));
                        
                        if (userDoc.exists) {
                            nextLevel.push(userDoc.data());
                        }
                    }
                }
                
                if (nextLevel.length === 0) break;
                teamData.push(nextLevel);
                currentLevel = nextLevel;
            }
            
            return teamData;
        } catch (error) {
            console.error('Error getting user team data:', error);
            return [];
        }
    },

    async checkLevelConditions(userData, levelTeam, levelSetting) {
        // Check self investment condition
        const userTotalInvestment = userData.selfDeposit || 0;
        if (userTotalInvestment < levelSetting.selfInvestmentCondition) {
            return false;
        }

        // Check total team business condition
        const totalTeamBusiness = levelTeam.reduce((sum, user) => sum + (user.selfDeposit || 0), 0);
        if (totalTeamBusiness < levelSetting.totalTeamBusinessCondition) {
            return false;
        }

        // Check total team size condition
        const totalTeamSize = levelTeam.length;
        if (totalTeamSize < levelSetting.totalTeamSizeCondition) {
            return false;
        }

        return true;
    },

    async loadWalletTransactions({ reset = true } = {}) {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) { console.error('Database or user not initialized'); return; }
        try {
            const tbody = document.getElementById('walletTransactionsBody');
            const loadMoreBtn = document.getElementById('loadMoreWalletBtn');
            if (!tbody) return;
            if (reset) {
                tbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
                state.walletLastVisible = null;
                state.walletHasMore = false;
                state.walletCachedRows = [];
            } else {
                if (loadMoreBtn) loadMoreBtn.disabled = true;
            }

            // Base query
            let query = db.collection('walletTransactions')
                .where('userId', '==', state.currentUser.uid)
                .orderBy('postedAt', 'desc');

            // Date filters
            const fromEl = document.getElementById('walletFromDate');
            const toEl = document.getElementById('walletToDate');
            const fromVal = fromEl?.value;
            const toVal = toEl?.value;
            if (fromVal) {
                const fromDate = new Date(fromVal);
                fromDate.setHours(0,0,0,0);
                query = query.where('postedAt', '>=', fromDate);
            }
            if (toVal) {
                const toDate = new Date(toVal);
                toDate.setHours(23,59,59,999);
                query = query.where('postedAt', '<=', toDate);
            }

            // Pagination
            const pageSize = 50;
            if (state.walletLastVisible && !reset) {
                query = query.startAfter(state.walletLastVisible);
            }
            query = query.limit(pageSize + 1);

            const snap = await query.get();

            let docs = snap.docs;
            if (docs.length > pageSize) {
                state.walletHasMore = true;
                state.walletLastVisible = docs[pageSize - 1];
                docs = docs.slice(0, pageSize);
            } else {
                state.walletHasMore = false;
                state.walletLastVisible = docs[docs.length - 1] || state.walletLastVisible;
            }

            const rows = docs.map(doc => {
                const tx = doc.data();
                const dateStr = tx.postedAt?.toDate ? tx.postedAt.toDate().toLocaleString() : (tx.postedAt || '');
                const amount = utils.formatCurrency(tx.amount || 0);
                const type = tx.type || 'N/A';
                const note = utils.sanitize(tx.note || '');
                const breakdown = (tx.roiPortion || tx.levelPortion) ?
                    `ROI: ${utils.formatCurrency(tx.roiPortion || 0)} | Level: ${utils.formatCurrency(tx.levelPortion || 0)}` : '-';
                return { dateStr, type, amount, breakdown, note };
            });

            if (reset) state.walletCachedRows = rows; else state.walletCachedRows.push(...rows);

            // Apply search filter to cached rows
            const term = (document.getElementById('walletSearch')?.value || '').toLowerCase();
            const filtered = state.walletCachedRows.filter(r => (
                r.dateStr.toLowerCase().includes(term) ||
                r.type.toLowerCase().includes(term) ||
                r.amount.toLowerCase().includes(term) ||
                r.breakdown.toLowerCase().includes(term) ||
                r.note.toLowerCase().includes(term)
            ));

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5">No transactions found</td></tr>';
            } else {
                tbody.innerHTML = filtered.map(r => `<tr>
                    <td>${r.dateStr}</td>
                    <td>${r.type}</td>
                    <td>${r.amount}</td>
                    <td>${r.breakdown}</td>
                    <td>${r.note}</td>
                </tr>`).join('');
            }

            if (loadMoreBtn) {
                loadMoreBtn.style.display = state.walletHasMore ? 'inline-block' : 'none';
                loadMoreBtn.disabled = false;
            }
        } catch (e) {
            console.error('Error loading wallet transactions:', e);
            const tbody = document.getElementById('walletTransactionsBody');
            if (tbody) {
                if (String(e.message || '').includes('index') && String(e.message || '').includes('create it here')) {
                    const match = String(e.message).match(/https?:\/\/[^\s]+indexes[^\s]+/);
                    const url = match ? match[0] : '#';
                    tbody.innerHTML = `<tr><td colspan="5">Index required. <a href="${url}" target="_blank" rel="noopener">Create index</a> then refresh.</td></tr>`;
        } else {
                    tbody.innerHTML = '<tr><td colspan="5">Failed to load transactions</td></tr>';
                }
            }
        }
    },

    exportWalletCSV() {
        try {
            const rows = state.walletCachedRows || [];
            if (!rows.length) {
                utils.showToast('No data to export', 'warning');
                return;
            }
            const headers = ['Date','Type','Amount','Breakdown','Note'];
            const lines = [headers.join(',')].concat(rows.map(r => {
                const safe = [r.dateStr, r.type, r.amount, r.breakdown, r.note].map(v => '"' + String(v).replaceAll('"','""') + '"');
                return safe.join(',');
            }));
            const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `wallet_transactions_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            utils.showToast('CSV exported', 'success');
        } catch (e) {
            console.error('CSV export failed:', e);
            utils.showToast('Export failed', 'error');
        }
    },

    loadDeposits(snapshot) {
        const elements = {
            depositStatusText: document.getElementById('depositStatusText'),
            depositHistory: document.getElementById('depositHistory')
        };

        if (!elements.depositStatusText || !elements.depositHistory) {
            console.error('Missing deposit elements:', {
                depositStatusText: !!elements.depositStatusText,
                depositHistory: !!elements.depositHistory
            });
            utils.showToast('Error loading deposits', 'error');
            return;
        }

        elements.depositStatusText.textContent = snapshot.docs[0]?.data().status || 'No Deposits';
        elements.depositHistory.innerHTML = snapshot.empty
            ? '<tr><td colspan="4">No deposit history available</td></tr>'
            : snapshot.docs.map(doc => {
                const deposit = doc.data();
                if (deposit.userId !== state.currentUser.uid) return '';
                return `<tr>
                    <td>${utils.formatDate(deposit.createdAt)}</td>
                    <td>${utils.formatCurrency(deposit.amount)}</td>
                    <td>${utils.sanitize(deposit.method) || 'N/A'}</td>
                    <td>${deposit.status || 'Pending'}</td>
                </tr>`;
            }).join('');
    },

    async loadWithdrawals(snapshot) {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) {
            console.error('Database or user not initialized');
            utils.showToast('Authentication or database unavailable', 'error');
            return;
        }

        const elements = {
            withdrawalStatusText: document.getElementById('withdrawalStatusText'),
            withdrawalHistory: document.getElementById('withdrawalHistory'),
            withdrawalMethodDetails: document.getElementById('withdrawalMethodDetails')
        };

        if (!elements.withdrawalStatusText || !elements.withdrawalHistory || !elements.withdrawalMethodDetails) {
            console.error('Missing withdrawal elements:', {
                withdrawalStatusText: !!elements.withdrawalStatusText,
                withdrawalHistory: !!elements.withdrawalHistory,
                withdrawalMethodDetails: !!elements.withdrawalMethodDetails
            });
            utils.showToast('Error loading withdrawals', 'error');
            return;
        }

        elements.withdrawalStatusText.textContent = snapshot.docs[0]?.data().status || 'No Withdrawals';
        elements.withdrawalHistory.innerHTML = snapshot.empty
            ? '<tr><td colspan="5">No withdrawal history available</td></tr>'
            : snapshot.docs.map(doc => {
                const withdrawal = doc.data();
                if (withdrawal.userId !== state.currentUser.uid) return '';
                return `<tr>
                    <td>${utils.formatDate(withdrawal.createdAt)}</td>
                    <td>${withdrawal.type || 'N/A'}</td>
                    <td>${utils.formatCurrency(withdrawal.amount)}</td>
                    <td>${utils.sanitize(withdrawal.method) || 'N/A'}</td>
                    <td>${withdrawal.status || 'Pending'}</td>
                </tr>`;
            }).join('');

        const kycDoc = await firebaseServices.safeGet(db.collection('kyc').doc(state.currentUser.uid));
        elements.withdrawalMethodDetails.innerHTML = kycDoc.exists && kycDoc.data().userId === state.currentUser.uid
            ? `<p><strong>USDT BEP20:</strong> ${utils.sanitize(kycDoc.data().usdtBep20) || 'N/A'}</p>
               <p><strong>Bank Name:</strong> ${utils.sanitize(kycDoc.data().bankName) || 'N/A'}</p>
               <p><strong>Account Number:</strong> ${utils.sanitize(kycDoc.data().accountNumber) || 'N/A'}</p>
               <p><strong>IFSC Code:</strong> ${utils.sanitize(kycDoc.data().ifsc) || 'N/A'}</p>
               <p><strong>Account Holder:</strong> ${utils.sanitize(kycDoc.data().accountHolder) || 'N/A'}</p>
               <p><strong>UPI ID:</strong> ${utils.sanitize(kycDoc.data().upi) || 'N/A'}</p>`
            : '<p>Please complete KYC to enable withdrawals.</p>';
    },

    loadActivityLog(snapshot) {
        try {
            const activityLog = document.getElementById('activityLog');
            if (!activityLog) {
                return; // Silently return if element not found
            }

            activityLog.innerHTML = snapshot.empty
                ? '<p>No activity log available</p>'
                : snapshot.docs.map(doc => {
                    const activity = doc.data();
                    if (activity.userId !== state.currentUser.uid) return '';
                    return `<div class="activity-item">
                        <span class="activity-time">${utils.formatDate(activity.createdAt)}</span>
                        <span class="activity-description">${utils.sanitize(activity.description) || 'N/A'}</span>
                    </div>`;
                }).join('');
        } catch (error) {
            console.error('Error loading activity log:', error);
            const activityLog = document.getElementById('activityLog');
            if (activityLog) {
                activityLog.innerHTML = '<p>Error loading activity log</p>';
            }
        }
    },

    loadTimeline(snapshot) {
        try {
            const timeline = document.getElementById('userTimeline');
            if (!timeline) {
                return; // Silently return if element not found
            }

            if (!snapshot || !snapshot.docs) {
                timeline.innerHTML = '<div class="timeline-item">No timeline events available</div>';
                return;
            }

            timeline.innerHTML = snapshot.empty
                ? '<div class="timeline-item">No timeline events available</div>'
                : snapshot.docs.map(doc => {
                    const activity = doc.data();
                    if (activity.userId !== state.currentUser.uid) return '';
                    return `<div class="timeline-item">
                        <p>${utils.sanitize(activity.action) || 'Unknown'}</p>
                        <small>${utils.formatDate(activity.timestamp)}</small>
                    </div>`;
                }).join('');
        } catch (error) {
            console.error('Error loading timeline:', error);
            const timeline = document.getElementById('userTimeline');
            if (timeline) {
                timeline.innerHTML = '<div class="timeline-item">Error loading timeline</div>';
            }
        }
    },

    loadRecentActivity(snapshot) {
        try {
            const elements = {
                slideWrapper: document.getElementById('slideWrapper'),
                slideNav: document.getElementById('slideNav')
            };

            if (!elements.slideWrapper || !elements.slideNav) {
                return; // Silently return if elements not found
            }

            if (!snapshot || !snapshot.docs) {
                elements.slideWrapper.innerHTML = '<div class="slide">No recent activity available</div>';
                return;
            }

            elements.slideWrapper.innerHTML = snapshot.empty
                ? '<div class="slide">No recent activity available</div>'
                : snapshot.docs.map(doc => {
                    const activity = doc.data();
                    if (activity.userId !== state.currentUser.uid) return '';
                    return `<div class="slide">
                        <p>${utils.sanitize(activity.action) || 'No activity'}</p>
                        <small>${utils.formatDate(activity.timestamp)}</small>
                    </div>`;
                }).join('');

            dataHandlers.initSlides();
        } catch (error) {
            console.error('Error loading recent activity:', error);
            const slideWrapper = document.getElementById('slideWrapper');
            if (slideWrapper) {
                slideWrapper.innerHTML = '<div class="slide">Error loading recent activity</div>';
            }
        }
    },

    async loadNotifications() {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) {
            console.error('Database or user not initialized');
            utils.showToast('Authentication or database unavailable', 'error');
            return;
        }

        const notificationsList = document.getElementById('notificationsList');
        if (!notificationsList) {
            console.error('Missing notificationsList');
            utils.showToast('Error loading notifications', 'error');
            return;
        }

        const snapshot = await firebaseServices.safeQuery(
            db.collection('notifications')
                .where('user', 'in', [state.currentUser.uid, 'all'])
                .orderBy('createdAt', 'desc')
                .limit(10)
        );
        notificationsList.innerHTML = snapshot.empty
            ? '<div class="notification">No notifications available</div>'
            : snapshot.docs.map(doc => {
                const notification = doc.data();
                return `<div class="notification">
                    <p>${utils.sanitize(notification.message) || 'No message'}</p>
                    <small>${utils.formatDate(notification.createdAt)}</small>
                </div>`;
            }).join('');
    },

    // Load pending tickets count
    async loadPendingTicketsCount() {
        try {
            const { db } = firebaseServices.initialize();
            if (!db || !state.currentUser) return 0;
            const snap = await firebaseServices.safeQuery(
                db.collection('supportTickets').where('userId', '==', state.currentUser.uid).where('status', '==', 'pending')
            );
            return snap.size || 0;
        } catch (e) {
            console.error('❌ Error loading pending tickets count:', e);
            // Return 0 on permission errors to avoid noisy UI
            return 0;
        }
    },
    // Debug function to check dashboard stats
    async debugDashboardStats() {
        console.log('🔍 Debugging Dashboard Stats...');
        
        // Check current state
        console.log('Current State:', {
            userData: state.userData,
            currentUser: state.currentUser
        });
        
        // Check elements
        const elements = {
            totalIncome: document.getElementById('totalIncome'),
            pendingTickets: document.getElementById('pendingTickets'),
            levelIncome: document.getElementById('levelIncome'),
            totalReferrals: document.getElementById('totalReferrals')
        };
        
        console.log('Dashboard Elements:', elements);
        
        // Check calculated values
        const totalIncome = (state.userData.selfIncome || 0) + (state.userData.levelIncome || 0) + (state.userData.rewardIncome || 0) + (state.userData.roiIncome || 0);
        console.log('Calculated Values:', {
            totalIncome,
            levelIncome: state.userData.levelIncome || 0,
            referrals: state.userData.referrals || 0,
            selfIncome: state.userData.selfIncome || 0,
            roiIncome: state.userData.roiIncome || 0,
            rewardIncome: state.userData.rewardIncome || 0
        });
        
        // Force refresh dashboard
        this.loadUserData();
        
        // Force refresh calculations
        await this.calculateLevelIncome();
        await this.calculateROI();
        
        // Reload user data after calculations
        this.loadUserData();
        
        return {
            totalIncome,
            levelIncome: state.userData.levelIncome || 0,
            referrals: state.userData.referrals || 0,
            pendingTickets: await this.loadPendingTicketsCount()
        };
    },

    initializeChatListener() {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) {
            // Chat functionality removed - no warning needed
            return;
        }

        // Chat functionality removed - placeholder for future implementation
        console.log('Chat listener initialized (functionality removed)');
    },

    async initIncomeCharts(incomeData = { self: [], level: [], reward: [], roi: [] }) {
        if (!window.Chart) {
            console.warn('Chart.js not loaded');
            utils.showToast('Charts unavailable', 'error');
            return;
        }

        const charts = [
            { id: 'selfIncomeChart', instance: 'selfIncome', data: incomeData.self, label: 'Self Income', type: 'line', borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.2)' },
            { id: 'levelIncomeChart', instance: 'levelIncome', data: incomeData.level, label: 'Level Income', type: 'bar', borderColor: '#22c55e', backgroundColor: '#22c55e' },
            { id: 'rewardIncomeChart', instance: 'rewardIncome', data: incomeData.reward, label: 'Reward Income', type: 'bar', borderColor: '#f59e0b', backgroundColor: '#f59e0b' },
            { id: 'roiIncomeChart', instance: 'roiIncome', data: incomeData.roi, label: 'ROI Income', type: 'line', borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.2)' }
        ];

        charts.forEach(chart => {
            const ctx = document.getElementById(chart.id)?.getContext('2d');
            if (!ctx) {
                console.warn(`Missing canvas for ${chart.id}`);
                return;
            }
            if (state.chartInstances[chart.instance]) state.chartInstances[chart.instance].destroy();
            state.chartInstances[chart.instance] = new Chart(ctx, {
                type: chart.type,
                data: {
                    labels: chart.data.length ? chart.data.map(d => d.date) : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                    datasets: [{
                        label: chart.label,
                        data: chart.data.length ? chart.data.map(d => d.amount) : [0, 0, 0, 0, 0, 0],
                        borderColor: chart.borderColor,
                        backgroundColor: chart.backgroundColor,
                        fill: chart.type === 'line',
                        tension: chart.type === 'line' ? 0.4 : 0
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: { beginAtZero: true, title: { display: true, text: 'Amount ($)' } },
                        x: { title: { display: true, text: 'Date' } }
                    }
                }
            });
        });
    },

    async initPulseChart() {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) {
            console.error('Database or user not initialized');
            utils.showToast('Authentication or database unavailable', 'error');
            return;
        }

        const ctx = document.getElementById('pulseChart')?.getContext('2d');
        if (!ctx || !window.Chart) {
            console.error('Missing pulseChart or Chart.js');
            utils.showToast('Error loading pulse chart', 'error');
            return;
        }

        if (state.chartInstances.pulse) state.chartInstances.pulse.destroy();
        const incomeSnapshot = await firebaseServices.safeQuery(db.collection('income').where('userId', '==', state.currentUser.uid).limit(6));
        const labels = incomeSnapshot.docs.map(doc => utils.formatDate(doc.data().createdAt)).reverse();
        const data = incomeSnapshot.docs.map(doc => doc.data().amount || 0).reverse();

        state.chartInstances.pulse = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.length ? labels : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [{
                    label: 'Income Growth',
                    data: data.length ? data : [0, 10, 20, 30, 40, 50],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Amount ($)' } },
                    x: { title: { display: true, text: 'Date' } }
                }
            }
        });
    },

    initSlides() {
        const elements = {
            slideWrapper: document.getElementById('slideWrapper'),
            slideNav: document.getElementById('slideNav')
        };

        if (!elements.slideWrapper || !elements.slideNav) {
            console.error('Missing slide elements:', {
                slideWrapper: !!elements.slideWrapper,
                slideNav: !!elements.slideNav
            });
            utils.showToast('Error initializing slides', 'error');
            return;
        }

        const slides = elements.slideWrapper.querySelectorAll('.slide');
        if (!slides.length) {
            elements.slideWrapper.innerHTML = '<div class="slide">No slides available</div>';
            elements.slideNav.innerHTML = '';
            return;
        }

        let currentSlide = 0;
        elements.slideNav.innerHTML = Array.from(slides).map((_, i) => `<span class="slide-dot${i === 0 ? ' active' : ''}"></span>`).join('');

        elements.slideNav.querySelectorAll('.slide-dot').forEach((dot, i) => {
            dot.addEventListener('click', () => {
                currentSlide = i;
                elements.slideWrapper.style.transform = `translateX(-${i * 100}%)`;
                elements.slideNav.querySelectorAll('.slide-dot').forEach(d => d.classList.remove('active'));
                dot.classList.add('active');
            });
        });

        setInterval(() => {
            currentSlide = (currentSlide + 1) % slides.length;
            elements.slideWrapper.style.transform = `translateX(-${currentSlide * 100}%)`;
            elements.slideNav.querySelectorAll('.slide-dot').forEach(d => d.classList.remove('active'));
            elements.slideNav.children[currentSlide].classList.add('active');
        }, 5000);
    },

    applySettings(settings) {
        if (settings.theme) {
            document.body.className = '';
            document.body.classList.add(settings.theme);
            localStorage.setItem('theme', settings.theme);
            console.log('Applied theme from settings:', settings.theme);
        }

        const notificationToggle = document.getElementById('toggleNotification');
        if (notificationToggle) {
            notificationToggle.checked = settings.notifications ?? true;
            notificationToggle.addEventListener('change', async () => {
                const { db } = firebaseServices.initialize();
                if (!db || !state.currentUser) {
                    console.error('Database or user not initialized');
                    utils.showToast('Authentication or database unavailable', 'error');
                    return;
                }
                try {
                    await db.collection('userSettings').doc(state.currentUser.uid).update({
                        notifications: notificationToggle.checked,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    utils.showToast('Notification settings updated', 'success');
                } catch (error) {
                    console.error('Error updating notification settings:', error.message);
                    utils.showToast('Error updating notification settings', 'error');
                }
            });
        }
    },

    async handleProfileUpdate(event) {
        event.preventDefault();
        
        // Check if profile is already completed
        if (state.userData.profileCompleted) {
            utils.showToast('Profile is already completed and cannot be modified', 'error');
            return;
        }
        
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) {
            console.error('Database or user not initialized');
            utils.showToast('Authentication or database unavailable', 'error');
            return;
        }

        const elements = {
            name: document.getElementById('editName')?.value?.trim(),
            email: document.getElementById('editEmail')?.value?.trim(),
            mobile: document.getElementById('editMobile')?.value?.trim(),
            address: document.getElementById('editAddress')?.value?.trim(),
            country: document.getElementById('editCountry')?.value
        };

        if (!elements.name || !elements.email) {
            console.warn('Missing required profile fields');
            utils.showToast('Name and email are required', 'error');
            return;
        }

        try {
            const updateData = {
                name: elements.name,
                email: elements.email,
                mobile: elements.mobile || '',
                address: elements.address || '',
                country: elements.country || '',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('users').doc(state.currentUser.uid).update(updateData);
            
            // Update state
            state.userData = { ...state.userData, ...updateData };
            
            utils.showToast('Profile updated successfully', 'success');
            
            // Update last updated timestamp
            const lastUpdated = document.getElementById('lastUpdated');
            if (lastUpdated) {
                lastUpdated.textContent = new Date().toLocaleString();
            }
            
        } catch (error) {
            console.error('Profile update error:', error.message);
            utils.showToast('Error updating profile', 'error');
        }
    },

    async handleProfilePicUpload(event) {
        const { storage, db } = firebaseServices.initialize();
        if (!storage || !db || !state.currentUser) {
            console.error('Storage, database, or user not initialized');
            utils.showToast('Authentication or storage unavailable', 'error');
            return;
        }

        const file = event.target.files[0];
        if (!file) {
            console.warn('No file selected for profile picture');
            utils.showToast('No file selected', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            console.warn('Profile picture size exceeds 5MB');
            utils.showToast('Profile picture must not exceed 5MB', 'error');
            return;
        }

        try {
                            const storageRef = storage.ref(`profile-pics/${state.currentUser.uid}/${Date.now()}`);
            await storageRef.put(file);
            const profilePicUrl = await storageRef.getDownloadURL();
            await db.collection('users').doc(state.currentUser.uid).update({
                profilePic: profilePicUrl,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            state.userData.profilePic = profilePicUrl;
            document.getElementById('profilePic').src = profilePicUrl;
            utils.showToast('Profile picture updated', 'success');
        } catch (error) {
            console.error('Error uploading profile picture:', error.message);
            utils.showToast('Error uploading profile picture', 'error');
        }
    },

    async handleKYCSubmission(event) {
        event.preventDefault();
        const { db, storage } = firebaseServices.initialize();
        if (!db || !storage || !state.currentUser) {
            console.error('Database, storage, or user not initialized');
            utils.showToast('Authentication or storage unavailable', 'error');
            return;
        }

        const kycData = {
            userId: state.currentUser.uid,
            name: utils.sanitize(document.getElementById('kycName')?.value),
            mobile: utils.sanitize(document.getElementById('kycMobile')?.value),
            aadhaar: utils.sanitize(document.getElementById('kycAadhaar')?.value),
            pan: utils.sanitize(document.getElementById('kycPAN')?.value),
            address: utils.sanitize(document.getElementById('kycAddress')?.value),
            accountHolder: utils.sanitize(document.getElementById('kycAccountHolder')?.value),
            bankName: utils.sanitize(document.getElementById('kycBank')?.value),
            ifsc: utils.sanitize(document.getElementById('kycIFSC')?.value),
            branch: utils.sanitize(document.getElementById('kycBranch')?.value),
            accountNumber: utils.sanitize(document.getElementById('kycAccount')?.value),
            upi: utils.sanitize(document.getElementById('kycUPI')?.value),
            usdtBep20: utils.sanitize(document.getElementById('kycUSDT')?.value),
            status: 'submitted',
            submittedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const files = [
            { id: 'kycAadhaarFront', file: document.getElementById('kycAadhaarFront')?.files[0] },
            { id: 'kycAadhaarBack', file: document.getElementById('kycAadhaarBack')?.files[0] },
            { id: 'kycPanFront', file: document.getElementById('kycPanFront')?.files[0] },
            { id: 'kycPassbook', file: document.getElementById('kycPassbook')?.files[0] },
            { id: 'kycSelfie', file: document.getElementById('kycSelfie')?.files[0] },
            { id: 'kycVideo', file: document.getElementById('kycVideo')?.files[0] }
        ].filter(f => f.file);

        for (const [key, value] of Object.entries(kycData)) {
            if (!value && key !== 'upi' && key !== 'usdtBep20' && key !== 'userId' && key !== 'status' && key !== 'submittedAt') {
                console.warn(`Missing KYC field: ${key}`);
                utils.showToast(`Please fill in ${key}`, 'error');
                return;
            }
        }

        for (const file of files) {
            if (file.file.size > (file.id === 'kycVideo' ? 10 * 1024 * 1024 : 5 * 1024 * 1024)) {
                console.warn(`${file.id} size exceeds limit`);
                utils.showToast(`${file.id} size must not exceed ${file.id === 'kycVideo' ? '10MB' : '5MB'}`, 'error');
                return;
            }
        }

        try {
            const kycUploadProgress = document.getElementById('kycUploadProgress');
            if (kycUploadProgress) kycUploadProgress.style.width = '0%';

            const uploadPromises = files.map(async (file, index) => {
                const storageRef = storage.ref(`kyc/${state.currentUser.uid}/${file.id}_${Date.now()}`);
                const uploadTask = storageRef.put(file.file);
                uploadTask.on('state_changed', snapshot => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    if (kycUploadProgress) kycUploadProgress.style.width = `${progress}%`;
                });
                await uploadTask;
                kycData[`${file.id}Url`] = await storageRef.getDownloadURL();
            });
            await Promise.all(uploadPromises);
            await db.collection('kyc').doc(state.currentUser.uid).set(kycData);
            await db.collection('kyc').doc(state.currentUser.uid).collection('history').add({
                ...kycData,
                remarks: 'Submitted for review'
            });
            utils.showToast('KYC submitted successfully', 'success');
            dataHandlers.loadKYCStatus(await firebaseServices.safeGet(db.collection('kyc').doc(state.currentUser.uid)));
            document.getElementById('kycForm')?.reset();
            if (kycUploadProgress) kycUploadProgress.style.width = '0%';
        } catch (error) {
            console.error('Error submitting KYC:', error.message);
            utils.showToast('Error submitting KYC', 'error');
        }
    },

    async handleDeposit(event) {
        event.preventDefault();
        const { auth, db, storage } = firebaseServices.initialize();
        if (!db || !storage || !state.currentUser) {
            console.error('Database, storage, or user not initialized');
            utils.showToast('Authentication or storage unavailable', 'error');
            return;
        }

        // Verify user is authenticated
        if (!auth.currentUser) {
            console.error('User not authenticated');
            utils.showToast('Please log in to submit deposits', 'error');
            return;
        }

        // Verify the authenticated user matches the state user
        if (auth.currentUser.uid !== state.currentUser.uid) {
            console.error('User authentication mismatch');
            utils.showToast('Authentication error. Please log in again.', 'error');
            return;
        }

        const now = Date.now();
        if (now - state.lastDepositTimestamp < state.depositCooldown) {
            console.warn('Deposit cooldown active');
            utils.showToast(`Please wait ${Math.ceil((state.depositCooldown - (now - state.lastDepositTimestamp)) / 1000)} seconds`, 'warning');
            return;
        }

        const elements = {
            step1: document.getElementById('depositStep1'),
            step2: document.getElementById('depositStep2'),
            step3: document.getElementById('depositStep3'),
            method: document.getElementById('depositMethod')?.value,
            amount: parseFloat(document.getElementById('depositAmount')?.value),
            utr: document.getElementById('depositUTR')?.value,
            screenshot: document.getElementById('paymentScreenshot')?.files[0],
            submitDeposit: document.getElementById('submitDepositButton'),
            depositLoading: document.getElementById('depositLoadingIndicator')
        };

        if (!elements.step1 || !elements.step2 || !elements.step3 || !elements.submitDeposit || !elements.depositLoading) {
            console.error('Missing deposit form elements:', {
                step1: !!elements.step1,
                step2: !!elements.step2,
                step3: !!elements.step3,
                submitDeposit: !!elements.submitDeposit,
                depositLoading: !!elements.depositLoading
            });
            utils.showToast('Deposit form error', 'error');
            return;
        }

        if (state.isSubmittingDeposit) {
            console.warn('Deposit submission in progress');
            utils.showToast('A deposit is already being processed', 'warning');
            return;
        }

        if (elements.step1.classList.contains('active')) {
            if (!elements.method || !elements.amount || elements.amount <= 0) {
                console.warn('Invalid deposit method or amount');
                utils.showToast('Select a method and valid amount', 'error');
                return;
            }
            const depositMethodDetails = document.getElementById('depositMethodDetails');
            const paymentDetailsText = document.getElementById('paymentDetailsText');
            if (!depositMethodDetails || !paymentDetailsText) {
                console.error('Missing deposit UI elements:', {
                    depositMethodDetails: !!depositMethodDetails,
                    paymentDetailsText: !!paymentDetailsText
                });
                utils.showToast('Error in deposit form UI', 'error');
                return;
            }
            const methods = [
                state.depositMethods.usdtBep20 && { value: 'USDT BEP20', details: state.depositMethods.usdtBep20 },
                state.depositMethods.usdtTrc20 && { value: 'USDT TRC20', details: state.depositMethods.usdtTrc20 },
                state.depositMethods.upiId && { value: 'UPI', details: state.depositMethods.upiId },
                state.depositMethods.bankDetails && { value: 'Bank', details: state.depositMethods.bankDetails }
            ].filter(Boolean);

            const selected = methods.find(m => m.value === elements.method);
            if (!selected) {
                console.warn('Invalid deposit method selected');
                utils.showToast('Invalid method', 'error');
                return;
            }
            let detailsHtml = `<p><strong>Method:</strong> ${selected.value}</p>`;
            if (['USDT BEP20', 'USDT TRC20'].includes(selected.value)) {
                detailsHtml += `<p><strong>Address:</strong> ${utils.sanitize(selected.details)}</p>`;
            } else if (selected.value === 'Bank') {
                detailsHtml += `<p><strong>Details:</strong> ${utils.sanitize(selected.details)}</p>`;
            } else if (selected.value === 'UPI') {
                detailsHtml += `<p><strong>UPI ID:</strong> ${utils.sanitize(selected.details)}</p>`;
            }
            depositMethodDetails.innerHTML = detailsHtml;
            paymentDetailsText.innerHTML = detailsHtml;
            elements.step1.classList.remove('active');
            elements.step2.classList.add('active');
        } else if (elements.step2.classList.contains('active')) {
            elements.step2.classList.remove('active');
            elements.step3.classList.add('active');
        } else if (elements.step3.classList.contains('active')) {
            if (!elements.utr || !elements.screenshot) {
                console.warn('Missing UTR or screenshot');
                utils.showToast('Enter UTR and upload screenshot', 'error');
                return;
            }
            if (elements.screenshot.size > 5 * 1024 * 1024) {
                console.warn('Screenshot size exceeds limit');
                utils.showToast('Screenshot size must not exceed 5MB', 'error');
                return;
            }
            try {
                state.isSubmittingDeposit = true;
                elements.submitDeposit.disabled = true;
                elements.depositLoading.classList.add('active');

                // Debug: Check authentication state
                console.log('Current user:', state.currentUser);
                console.log('User UID:', state.currentUser?.uid);
                console.log('Storage instance:', storage);
                
                // Verify user is authenticated
                if (!state.currentUser || !state.currentUser.uid) {
                    throw new Error('User not properly authenticated');
                }

                // Try multiple approaches for upload
                let screenshotUrl = null;
                let uploadSuccess = false;
                
                // Approach 1: Direct upload
                try {
                    const storageRef = storage.ref(`deposits/${state.currentUser.uid}/${Date.now()}`);
                    console.log('Storage reference created:', storageRef);
                    
                    console.log('Uploading file:', elements.screenshot.name, 'Size:', elements.screenshot.size);
                    await storageRef.put(elements.screenshot);
                    console.log('File uploaded successfully');
                    
                    screenshotUrl = await storageRef.getDownloadURL();
                    console.log('Download URL obtained:', screenshotUrl);
                    uploadSuccess = true;
                } catch (uploadError) {
                    console.error('Direct upload failed:', uploadError);
                    
                    // Approach 2: Try with different path structure
                    try {
                        const timestamp = Date.now();
                        const fileName = `${timestamp}_${elements.screenshot.name}`;
                        const storageRef = storage.ref(`deposits/${state.currentUser.uid}/${fileName}`);
                        console.log('Retry with structured filename:', fileName);
                        
                        await storageRef.put(elements.screenshot);
                        screenshotUrl = await storageRef.getDownloadURL();
                        console.log('Retry upload successful:', screenshotUrl);
                        uploadSuccess = true;
                    } catch (retryError) {
                        console.error('Retry upload also failed:', retryError);
                        throw retryError; // Re-throw the error to be caught by outer catch
                    }
                }
                
                if (!uploadSuccess || !screenshotUrl) {
                    throw new Error('Failed to upload screenshot after multiple attempts');
                }

                await db.collection('deposits').add({
                    userId: state.currentUser.uid,
                    method: elements.method,
                    amount: elements.amount,
                    utr: elements.utr,
                    screenshotUrl,
                    status: 'pending',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                state.lastDepositTimestamp = now;
                utils.showToast('Deposit submitted successfully!', 'success');
                elements.step3.classList.remove('active');
                elements.step1.classList.add('active');
                document.getElementById('depositForm')?.reset();
                const depositsSnapshot = await firebaseServices.safeQuery(db.collection('deposits').where('userId', '==', state.currentUser.uid));
                dataHandlers.loadDeposits(depositsSnapshot);
            } catch (error) {
                console.error('Error submitting deposit:', error);
                console.error('Error code:', error.code);
                console.error('Error message:', error.message);
                
                let errorMessage = 'Error submitting deposit';
                if (error.code === 'storage/unauthorized') {
                    errorMessage = 'Permission denied. Please check your authentication.';
                    console.error('Storage unauthorized - User UID:', state.currentUser?.uid);
                    console.error('Storage bucket:', storage?.app?.options?.storageBucket);
                } else if (error.code === 'storage/unauthenticated') {
                    errorMessage = 'You must be logged in to upload files.';
                } else if (error.code === 'storage/retry-limit-exceeded') {
                    errorMessage = 'Upload failed. Please try again.';
                } else if (error.code === 'storage/invalid-checksum') {
                    errorMessage = 'File upload failed. Please try again.';
                } else if (error.code === 'storage/bucket-not-found') {
                    errorMessage = 'Storage bucket not found. Please contact support.';
                } else if (error.code === 'storage/project-not-found') {
                    errorMessage = 'Firebase project not found. Please contact support.';
                }
                
                utils.showToast(errorMessage, 'error');
            } finally {
                state.isSubmittingDeposit = false;
                elements.submitDeposit.disabled = false;
                elements.depositLoading.classList.remove('active');
            }
        }
    },

    async handleWithdrawal(event) {
        event.preventDefault();
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) {
            console.error('Database or user not initialized');
            utils.showToast('Authentication or database unavailable', 'error');
            return;
        }

        const elements = {
            type: document.getElementById('withdrawalType')?.value,
            method: document.getElementById('withdrawalMethod')?.value,
            amount: parseFloat(document.getElementById('withdrawalAmount')?.value)
        };

        if (!elements.type || !elements.method || !elements.amount || elements.amount <= 0) {
            console.warn('Invalid withdrawal data:', elements);
            utils.showToast('Please fill all fields with valid values', 'error');
            return;
        }

        // Check KYC status before allowing withdrawal
        try {
            const kycDoc = await firebaseServices.safeGet(db.collection('kyc').doc(state.currentUser.uid));
            if (!kycDoc.exists) {
                utils.showToast('KYC verification required before withdrawal. Please complete your KYC first.', 'error');
                return;
            }
            
            const kycData = kycDoc.data();
            if (kycData.status !== 'approved') {
                utils.showToast('KYC must be approved before withdrawal. Current status: ' + (kycData.status || 'pending'), 'error');
                return;
            }
        } catch (error) {
            console.error('Error checking KYC status:', error);
            utils.showToast('Error checking KYC status. Please try again.', 'error');
            return;
        }

        // Check if user is active (minimum $20 in wallet)
        if (!state.userData.isActive) {
            utils.showToast('Your account is not active. You need minimum $20 in your wallet to make withdrawals. Add more funds to activate your account.', 'error');
            return;
        }

        // Validate minimum amounts
        if (elements.type === 'income' && elements.amount < 10) {
            utils.showToast('Minimum income withdrawal amount is $10', 'error');
            return;
        }

        if (elements.type === 'principal' && elements.amount < 1) {
            utils.showToast('Minimum principal withdrawal amount is $1', 'error');
            return;
        }

        // Check withdrawal date restrictions for income
        if (elements.type === 'income') {
            const today = new Date();
            const dayOfMonth = today.getDate();
            
            // Income withdrawal only allowed on 14th and 28th
            if (dayOfMonth !== 14 && dayOfMonth !== 28) {
                const nextDate = dayOfMonth < 14 ? 14 : (dayOfMonth < 28 ? 28 : 14);
                const nextMonth = dayOfMonth < 14 ? today.getMonth() : (dayOfMonth < 28 ? today.getMonth() : today.getMonth() + 1);
                const nextDateObj = new Date(today.getFullYear(), nextMonth, nextDate);
                
                utils.showToast(`Income withdrawal is only allowed on 14th and 28th of each month. Next available date: ${nextDateObj.toLocaleDateString()}`, 'error');
                return;
            }
        }

        // Check available balance
        let availableBalance = 0;
        let balanceType = '';
        
        if (elements.type === 'income') {
            availableBalance = (state.userData.selfIncome || 0) + (state.userData.levelIncome || 0) + (state.userData.rewardIncome || 0) + (state.userData.roiIncome || 0);
            balanceType = 'income';
        } else if (elements.type === 'principal') {
            availableBalance = state.userData.totalDeposits || 0;
            balanceType = 'principal';
        }

        if (elements.amount > availableBalance) {
            utils.showToast(`Insufficient ${balanceType} balance. Available: ${utils.formatCurrency(availableBalance)}`, 'error');
                return;
            }

        // Show withdrawal calculation
        const withdrawalCalculation = document.getElementById('withdrawalCalculation');
        if (withdrawalCalculation) {
            let processingFee = 0;
            let netAmount = elements.amount;
            
            if (elements.type === 'income') {
                processingFee = elements.amount * 0.10; // 10% fee for income
                netAmount = elements.amount - processingFee;
            } else if (elements.type === 'principal') {
                // Check if user has made any deposits
                const depositsSnapshot = await firebaseServices.safeQuery(
                    db.collection('deposits').where('userId', '==', state.currentUser.uid).where('status', '==', 'approved')
                );
                
                if (!depositsSnapshot.empty) {
                    // Find the earliest deposit date
                    let earliestDepositDate = new Date();
                    depositsSnapshot.docs.forEach(doc => {
                        const deposit = doc.data();
                        const depositDate = deposit.approvedAt?.toDate() || deposit.createdAt?.toDate() || new Date();
                        if (depositDate < earliestDepositDate) {
                            earliestDepositDate = depositDate;
                        }
                    });
                    
                    // Calculate months since first deposit
                    const monthsSinceDeposit = Math.floor((Date.now() - earliestDepositDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
                    
                    if (monthsSinceDeposit < 6) {
                        processingFee = elements.amount * 0.15; // 15% fee if less than 6 months
                        netAmount = elements.amount - processingFee;
                    }
                    // No fee if 6 months or more
                }
            }
            
            // Update withdrawal calculation display
            document.getElementById('requestedAmount').textContent = utils.formatCurrency(elements.amount);
            document.getElementById('processingFee').textContent = utils.formatCurrency(processingFee);
            document.getElementById('netAmount').textContent = utils.formatCurrency(netAmount);
            withdrawalCalculation.style.display = 'block';
        }

        try {
            // Get the calculated values from the display
            const requestedAmount = parseFloat(document.getElementById('requestedAmount')?.textContent?.replace('$', '') || elements.amount);
            const processingFee = parseFloat(document.getElementById('processingFee')?.textContent?.replace('$', '') || 0);
            const netAmount = parseFloat(document.getElementById('netAmount')?.textContent?.replace('$', '') || elements.amount);

            const withdrawalData = {
                userId: state.currentUser.uid,
                type: elements.type,
                method: elements.method,
                amount: elements.amount,
                processingFee: processingFee,
                netAmount: netAmount,
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                userEmail: state.userData.email || '',
                userName: state.userData.name || ''
            };

            await db.collection('withdrawals').add(withdrawalData);
            
            // Update user balance immediately based on withdrawal type
            if (elements.type === 'principal') {
                const newBalance = (state.userData.balance || 0) - elements.amount;
                await db.collection('users').doc(state.currentUser.uid).update({
                    balance: newBalance
                });
                
                // Update local state
                state.userData.balance = newBalance;
                
                // Update UI immediately
                const userBalanceElement = document.getElementById('userBalance');
                if (userBalanceElement) {
                    userBalanceElement.textContent = utils.formatCurrency(newBalance);
                }
            }
            
            utils.showToast('Withdrawal request submitted successfully', 'success');
            
            // Reset form
            document.getElementById('withdrawalForm')?.reset();
            document.getElementById('withdrawalCalculation').style.display = 'none';
            document.getElementById('withdrawalTypeDetails').style.display = 'none';
            
            // Refresh withdrawal history
            const withdrawalsSnapshot = await firebaseServices.safeQuery(
                db.collection('withdrawals').where('userId', '==', state.currentUser.uid)
            );
            dataHandlers.loadWithdrawals(withdrawalsSnapshot);
            
            // Refresh user data to update all stats
            await dataHandlers.initializeUserData();
            
        } catch (error) {
            console.error('Withdrawal error:', error.message);
            utils.showToast('Error submitting withdrawal request', 'error');
        }
    },

    async handleSupportTicket(event) {
        event.preventDefault();
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) {
            console.error('Database or user not initialized');
            utils.showToast('Authentication or database unavailable', 'error');
            return;
        }

        const subject = utils.sanitize(document.getElementById('supportTicketSubject')?.value);
        const message = utils.sanitize(document.getElementById('supportTicketMessage')?.value);

        if (!subject || !message) {
            console.warn('Missing support ticket subject or message');
            utils.showToast('Please fill in all fields', 'error');
            return;
        }

        try {
            console.log('📝 Submitting support ticket...');
            console.log('👤 User ID:', state.currentUser.uid);
            console.log('📧 User Email:', state.userData.email);
            console.log('👤 User Name:', state.userData.name);
            
            await db.collection('tickets').add({
                userId: state.currentUser.uid,
                userEmail: state.userData.email || '',
                userName: state.userData.name || '',
                subject,
                message,
                status: 'open',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log('✅ Support ticket submitted successfully');
            utils.showToast('Ticket submitted successfully', 'success');
            document.getElementById('supportTicketForm')?.reset();
            const ticketsSnapshot = await firebaseServices.safeQuery(db.collection('tickets').where('userId', '==', state.currentUser.uid));
            dataHandlers.loadSupportTickets(ticketsSnapshot);
        } catch (error) {
            console.error('Error submitting ticket:', error.message);
            utils.showToast('Error submitting ticket', 'error');
        }
    },

    async handleChatSubmission(event) {
        if (event.key !== 'Enter' || !event.target.value.trim()) return;
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) {
            console.error('Database or user not initialized');
            utils.showToast('Authentication or database unavailable', 'error');
            return;
        }

        const message = utils.sanitize(event.target.value);
        try {
            await db.collection('chats').add({
                userId: state.currentUser.uid,
                message,
                sender: 'user',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            event.target.value = '';
            utils.showToast('Message sent', 'success');
        } catch (error) {
            console.error('Error sending chat message:', error.message);
            utils.showToast('Error sending message', 'error');
        }
    },

    copyReferralLink() {
        const referralLink = document.getElementById('referralLink')?.value;
        if (!referralLink) {
            utils.showToast('Referral link not found', 'error');
            return;
        }
        navigator.clipboard.writeText(referralLink)
            .then(() => utils.showToast('Referral link copied!', 'success'))
            .catch(() => utils.showToast('Failed to copy', 'error'));
    },

    async handleSettingsUpdate(event) {
        event.preventDefault();
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) {
            console.error('Database or user not initialized');
            utils.showToast('Authentication or database unavailable', 'error');
            return;
        }

        const notificationsEnabled = document.getElementById('toggleNotification')?.checked;

        try {
            await db.collection('userSettings').doc(state.currentUser.uid).update({
                notifications: notificationsEnabled,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            utils.showToast('Settings updated successfully', 'success');
            console.log('Settings updated:', { notifications: notificationsEnabled });
        } catch (error) {
            console.error('Error updating settings:', error.message);
            utils.showToast('Error updating settings', 'error');
        }
    },

    async handleLogout() {
        const { auth } = firebaseServices.initialize();
        if (!auth) {
            console.error('Authentication service unavailable');
            utils.showToast('Authentication unavailable', 'error');
            return;
        }
        try {
            console.log('Attempting logout for user:', state.currentUser?.uid || 'null');
            await auth.signOut();
            state.currentUser = null;
            state.userData = {};
            console.log('Logout successful');
            utils.showToast('Logged out successfully', 'success');
            window.location.href = '/index.html';
        } catch (error) {
            console.error('Logout error:', error.message);
            utils.showToast('Error logging out', 'error');
        }
    },

    async loadAnalytics() {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) {
            console.error('Database or user not initialized');
            return;
        }

        try {
            console.log('📊 === LOADING ANALYTICS ===');
            console.log('👤 Current user:', state.currentUser.uid);
            
            // Load user data
            const userDoc = await firebaseServices.safeGet(db.collection('users').doc(state.currentUser.uid));
            if (!userDoc.exists) {
                console.error('User document not found');
                return;
            }

            const userData = userDoc.data();
            console.log('📄 User data loaded:', {
                name: userData.name,
                email: userData.email,
                referredBy: userData.referredBy || 'NOT SET',
                referrerCode: userData.referrerCode || 'NOT SET',
                referrerName: userData.referrerName || 'NOT SET',
                referralDate: userData.referralDate || 'NOT SET'
            });
            
            const accountCreatedAt = userData.createdAt?.toDate() || new Date();
            const accountAge = Math.floor((Date.now() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24));

            // Load deposits
            const depositsSnapshot = await firebaseServices.safeQuery(
                db.collection('deposits').where('userId', '==', state.currentUser.uid).where('status', '==', 'approved')
            );
            let totalDeposits = 0;
            depositsSnapshot.docs.forEach(doc => {
                totalDeposits += doc.data().amount || 0;
            });



            // Load support tickets
            const ticketsSnapshot = await firebaseServices.safeQuery(
                db.collection('supportTickets').where('userId', '==', state.currentUser.uid)
            );

            // Load referrals where this user is the referrer
            const referralsSnapshot = await firebaseServices.safeQuery(
                db.collection('referrals').where('referrerId', '==', state.currentUser.uid)
            );
            
            console.log('📊 Referrals found:', referralsSnapshot.size);

            // Load upline information (who referred this user) - ENHANCED VERSION
            let uplineInfo = {
                referredBy: 'None',
                referrerCode: 'None',
                referrerName: 'None',
                referralDate: 'None'
            };
            
            // First check if user has referral data in their document
            if (userData.referredBy || userData.referrerCode || userData.referrerName) {
                uplineInfo = {
                    referredBy: userData.referredBy || 'None',
                    referrerCode: userData.referrerCode || 'None',
                    referrerName: userData.referrerName || 'None',
                    referralDate: userData.referralDate ? utils.formatDate(userData.referralDate) : 'None'
                };
                console.log('👤 Upline info from user document:', uplineInfo);
            }
            
            // If still showing None, try to find from referrals collection
            if (uplineInfo.referredBy === 'None') {
                try {
                    console.log('🔍 Searching referrals collection for upline info...');
                    const referralDoc = await db.collection('referrals')
                        .where('referredId', '==', state.currentUser.uid)
                        .limit(1)
                        .get();
                    
                    if (!referralDoc.empty) {
                        const referral = referralDoc.docs[0].data();
                        console.log('📋 Found referral document:', referral);
                        
                        // Get referrer details
                        const referrerDoc = await firebaseServices.safeGet(db.collection('users').doc(referral.referrerId));
                        if (referrerDoc.exists) {
                            const referrerData = referrerDoc.data();
                            uplineInfo = {
                                referredBy: referral.referrerId,
                                referrerCode: referral.referrerCode || referrerData.referralCode || 'Unknown',
                                referrerName: referral.referrerName || referrerData.name || 'Unknown',
                                referralDate: referral.createdAt ? utils.formatDate(referral.createdAt) : 'Unknown'
                            };
                            console.log('👤 Upline info from referral document:', uplineInfo);
                            
                            // Update user document with this information
                            await db.collection('users').doc(state.currentUser.uid).update({
                                referredBy: referral.referrerId,
                                referrerCode: referral.referrerCode,
                                referrerName: referral.referrerName,
                                referralDate: referral.createdAt
                            });
                            console.log('✅ Updated user document with upline info');
                        }
                    } else {
                        console.log('ℹ️ No referral document found - user was not referred by anyone');
                    }
                } catch (error) {
                    console.error('❌ Error loading upline info from referrals:', error);
                }
            }



            // Update analytics display
            const analyticsElements = {
                totalDeposits: document.getElementById('analyticsTotalDeposits'),
                accountAge: document.getElementById('analyticsAccountAge'),
                totalReferrals: document.getElementById('analyticsTotalReferrals'),
                activeReferrals: document.getElementById('analyticsActiveReferrals'),
                referralIncome: document.getElementById('analyticsReferralIncome'),
                teamSize: document.getElementById('analyticsTeamSize'),
                // Upline information elements
                referredBy: document.getElementById('analyticsReferredBy'),
                referrerCode: document.getElementById('analyticsReferrerCode'),
                referrerName: document.getElementById('analyticsReferrerName'),
                referralDate: document.getElementById('analyticsReferralDate')
            };

            // Update basic values with enhanced logging
            if (analyticsElements.totalDeposits) {
                analyticsElements.totalDeposits.textContent = utils.formatCurrency(totalDeposits);
                console.log('📊 Total Deposits updated:', utils.formatCurrency(totalDeposits));
            }
            if (analyticsElements.accountAge) {
                analyticsElements.accountAge.textContent = `${accountAge} days`;
                console.log('📊 Account Age updated:', `${accountAge} days`);
            }
            if (analyticsElements.totalReferrals) {
                analyticsElements.totalReferrals.textContent = referralsSnapshot.size;
                console.log('📊 Total Referrals updated:', referralsSnapshot.size);
            }
            if (analyticsElements.activeReferrals) {
                analyticsElements.activeReferrals.textContent = referralsSnapshot.size;
                console.log('📊 Active Referrals updated:', referralsSnapshot.size);
            }
            if (analyticsElements.referralIncome) {
                analyticsElements.referralIncome.textContent = utils.formatCurrency(userData.levelIncome || 0);
                console.log('📊 Referral Income updated:', utils.formatCurrency(userData.levelIncome || 0));
            }
            if (analyticsElements.teamSize) {
                analyticsElements.teamSize.textContent = referralsSnapshot.size;
                console.log('📊 Team Size updated:', referralsSnapshot.size);
            }
            
            // Update upline information with enhanced logging
            if (analyticsElements.referredBy) {
                analyticsElements.referredBy.textContent = uplineInfo.referredBy;
                console.log('📊 Referred By updated:', uplineInfo.referredBy);
            }
            if (analyticsElements.referrerCode) {
                analyticsElements.referrerCode.textContent = uplineInfo.referrerCode;
                console.log('📊 Referrer Code updated:', uplineInfo.referrerCode);
            }
            if (analyticsElements.referrerName) {
                analyticsElements.referrerName.textContent = uplineInfo.referrerName;
                console.log('📊 Referrer Name updated:', uplineInfo.referrerName);
            }
            if (analyticsElements.referralDate) {
                analyticsElements.referralDate.textContent = uplineInfo.referralDate;
                console.log('📊 Referral Date updated:', uplineInfo.referralDate);
            }

            console.log('✅ Analytics loaded successfully');
            console.log('📊 Upline info displayed:', uplineInfo);

            // Initialize analytics chart
        try {
            // Check if Chart.js is available
            if (typeof Chart === 'undefined') {
                console.warn('⚠️ Chart.js not available, skipping analytics chart initialization');
                return;
            }

            // Destroy existing charts first
            if (dataHandlers && typeof dataHandlers.destroyAllCharts === 'function') {
                dataHandlers.destroyAllCharts();
            }
            
            if (dataHandlers && typeof dataHandlers.initAnalyticsChart === 'function') {
                await dataHandlers.initAnalyticsChart();
            }
        } catch (error) {
            console.error('❌ Error initializing analytics chart:', error);
        }

        } catch (error) {
            console.error('❌ Error loading analytics:', error);
        }
    },

    async initAnalyticsChart() {
        const chartCanvas = document.getElementById('analyticsChart');
        if (!chartCanvas) {
            console.log('📊 Analytics chart canvas not found');
            return;
        }

        try {
            // Check if Chart.js is available
            if (typeof Chart === 'undefined') {
                console.error('❌ Chart.js library not loaded');
                return;
            }

            // Destroy existing chart if it exists and has destroy method
            if (window.analyticsChart && typeof window.analyticsChart.destroy === 'function') {
                console.log('🗑️ Destroying existing analytics chart...');
                try {
                    window.analyticsChart.destroy();
                } catch (destroyError) {
                    console.warn('⚠️ Error destroying existing chart:', destroyError);
                }
                window.analyticsChart = null;
            } else if (window.analyticsChart) {
                console.log('🗑️ Clearing existing analytics chart reference...');
                window.analyticsChart = null;
            }

            const ctx = chartCanvas.getContext('2d');
            if (!ctx) {
                console.error('❌ Could not get chart context');
                return;
            }
            
            // Sample data - you can replace with real data
            const chartData = {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [{
                    label: 'Income',
                    data: [
                        state.userData.selfIncome || 0, 
                        state.userData.levelIncome || 0, 
                        state.userData.roiIncome || 0, 
                        state.userData.rewardIncome || 0, 
                        0, 
                        0
                    ],
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 2,
                    fill: false
                }]
            };

            // Create new chart and store reference
            window.analyticsChart = new Chart(ctx, {
                type: 'line',
                data: chartData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return '$' + value.toFixed(2);
                                }
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            labels: {
                                color: '#e0e6f0'
                            }
                        }
                    }
                }
            });

            console.log('✅ Analytics chart initialized successfully');
        } catch (error) {
            console.error('❌ Error initializing analytics chart:', error);
            // Clear the reference if there was an error
            window.analyticsChart = null;
        }
    },

    showProfileCompletionPopup() {
        const modal = utils.createElement('div', { 
            class: 'modal', 
            style: 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;' 
        });
        
        const modalContent = utils.createElement('div', { 
            class: 'modal-content', 
            style: 'background: #2a2f4a; padding: 30px; border-radius: 15px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;' 
        });
        
        modalContent.innerHTML = `
            <h2 style="color: var(--accent); margin-bottom: 20px; text-align: center;">Complete Your Profile</h2>
            <p style="color: var(--text-secondary); margin-bottom: 25px; text-align: center;">
                Welcome to TheOneWealthWave! Please complete your profile to get started.
            </p>
            <form id="profileCompletionForm">
                <label for="popupName">Full Name *</label>
                <input type="text" id="popupName" placeholder="Enter your full name" required style="width: 100%; margin-bottom: 15px;">
                
                <label for="popupMobile">Mobile Number *</label>
                <input type="tel" id="popupMobile" placeholder="Enter your mobile number" pattern="[0-9]{10,15}" required style="width: 100%; margin-bottom: 15px;">
                
                <label for="popupAddress">Address</label>
                <textarea id="popupAddress" placeholder="Enter your address" style="width: 100%; margin-bottom: 15px; min-height: 80px;"></textarea>
                
                <label for="popupCountry">Country *</label>
                <select id="popupCountry" required style="width: 100%; margin-bottom: 20px;">
                    <option value="" disabled selected>Select Country</option>
                    <option value="India">India</option>
                    <option value="USA">USA</option>
                    <option value="UK">UK</option>
                    <option value="Australia">Australia</option>
                    <option value="Germany">Germany</option>
                    <option value="France">France</option>
                    <option value="Japan">Japan</option>
                    <option value="China">China</option>
                    <option value="Brazil">Brazil</option>
                    <option value="Russia">Russia</option>
                    <option value="South Africa">South Africa</option>
                    <option value="Mexico">Mexico</option>
                    <option value="Italy">Italy</option>
                    <option value="Spain">Spain</option>
                    <option value="Netherlands">Netherlands</option>
                    <option value="Sweden">Sweden</option>
                    <option value="Switzerland">Switzerland</option>
                    <option value="Singapore">Singapore</option>
                    <option value="South Korea">South Korea</option>
                    <option value="Indonesia">Indonesia</option>
                    <option value="Malaysia">Malaysia</option>
                    <option value="Thailand">Thailand</option>
                    <option value="Vietnam">Vietnam</option>
                    <option value="Philippines">Philippines</option>
                </select>
                
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button type="submit" class="primary" style="flex: 1;">Complete Profile</button>
                </div>
            </form>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Handle form submission
        const form = modal.querySelector('#profileCompletionForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await dataHandlers.handleProfileCompletion(modal);
        });
        
        // Pre-fill with existing data if available
        const nameInput = modal.querySelector('#popupName');
        const mobileInput = modal.querySelector('#popupMobile');
        const addressInput = modal.querySelector('#popupAddress');
        const countryInput = modal.querySelector('#popupCountry');
        
        if (state.userData.name && state.userData.name !== state.currentUser.email?.split('@')[0]) {
            nameInput.value = state.userData.name;
        }
        if (state.userData.mobile) {
            mobileInput.value = state.userData.mobile;
        }
        if (state.userData.address) {
            addressInput.value = state.userData.address;
        }
        if (state.userData.country) {
            countryInput.value = state.userData.country;
        }
    },

    async handleProfileCompletion(modal) {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) {
            utils.showToast('Database connection error', 'error');
            return;
        }

        const formData = {
            name: utils.sanitize(modal.querySelector('#popupName').value),
            mobile: utils.sanitize(modal.querySelector('#popupMobile').value),
            address: utils.sanitize(modal.querySelector('#popupAddress').value),
            country: utils.sanitize(modal.querySelector('#popupCountry').value)
        };

        // Validate required fields
        if (!formData.name || !formData.mobile || !formData.country) {
            utils.showToast('Please fill all required fields', 'error');
            return;
        }

        try {
            await db.collection('users').doc(state.currentUser.uid).update({
                ...formData,
                profileCompleted: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Update local state
            state.userData = { ...state.userData, ...formData, profileCompleted: true };
            
            // Update UI
            dataHandlers.loadUserData();
            dataHandlers.updateProfileSectionVisibility();
            
            modal.remove();
            utils.showToast('Profile completed successfully!', 'success');
        } catch (error) {
            console.error('Error completing profile:', error);
            utils.showToast('Error saving profile', 'error');
        }
    },

    updateProfileSectionVisibility() {
        const profileForm = document.getElementById('profileForm');
        const profileStatus = document.getElementById('profileStatus');
        
        if (!profileForm || !profileStatus) return;
        
        if (state.userData.profileCompleted) {
            // Hide the form and show read-only information
            profileForm.style.display = 'none';
            profileStatus.innerHTML = `
                <div class="profile-completed">
                    <h3>✅ Profile Completed</h3>
                    <div class="profile-info">
                        <p><strong>Name:</strong> ${utils.sanitize(state.userData.name)}</p>
                        <p><strong>Email:</strong> ${utils.sanitize(state.userData.email)}</p>
                        <p><strong>Mobile:</strong> ${utils.sanitize(state.userData.mobile)}</p>
                        <p><strong>Address:</strong> ${utils.sanitize(state.userData.address || 'Not provided')}</p>
                        <p><strong>Country:</strong> ${utils.sanitize(state.userData.country)}</p>
                    </div>
                    <p class="profile-locked">
                        Your profile is complete and cannot be modified.
                    </p>
                </div>
            `;
        } else {
            // Show the form for editing
            profileForm.style.display = 'block';
            profileStatus.innerHTML = `
                <p>Profile Status: <span id="profileStatusText">Incomplete</span></p>
                <p class="blocked-status" id="blockedStatus" style="display: none;">Account Blocked</p>
                <p>Last Updated: <span id="lastUpdated">Never</span></p>
            `;
        }
    },

    // Referral code validation functions
    async validateReferralCode(code) {
        console.log('🚀 Starting referral code validation...');
        
        const { db } = firebaseServices.initialize();
        if (!db) {
            console.warn('❌ Database not initialized for referral validation');
            return false;
        }

        if (!code || code.trim().length < 8) {
            console.log('❌ Invalid code length:', code ? code.length : 0);
            dataHandlers.hideReferrerInfo();
            return false;
        }

        const trimmedCode = code.trim();
        console.log('🔍 Validating referral code:', trimmedCode);

        try {
            console.log('📡 Querying database for referral code:', trimmedCode);
            
            // Use a simpler approach - get all users and filter client-side
            // This avoids permission issues with where clauses
            const allUsersSnapshot = await db.collection('users').get();
            console.log('📊 Total users fetched:', allUsersSnapshot.docs.length);
            
            // Find user with matching referral code
            const matchingUser = allUsersSnapshot.docs.find(doc => {
                const userData = doc.data();
                return userData.referralCode === trimmedCode;
            });
            
            if (matchingUser) {
                const referrer = matchingUser.data();
                console.log('📄 Raw referrer data:', referrer);
                
                // Prioritize the name from profile, fallback to email, then unknown
                let referrerName = 'Unknown User';
                if (referrer.name && referrer.name.trim()) {
                    referrerName = referrer.name.trim();
                    console.log('✅ Using name from profile:', referrerName);
                } else if (referrer.email && referrer.email.trim()) {
                    referrerName = referrer.email.trim();
                    console.log('📧 Using email as fallback:', referrerName);
                } else {
                    console.log('❓ No name or email found, using default');
                }
                
                console.log('✅ Valid referral code found for:', referrerName);
                console.log('📋 Referrer data summary:', {
                    id: matchingUser.id,
                    name: referrer.name,
                    email: referrer.email,
                    referralCode: referrer.referralCode,
                    finalName: referrerName
                });
                
                // Show referrer info with better formatting
                console.log('🎯 Calling showReferrerInfo with:', referrerName);
                dataHandlers.showReferrerInfo(referrerName);
                return true;
            } else {
                console.log('❌ Invalid referral code:', trimmedCode);
                console.log('🔍 No user found with this referral code');
                
                // Show available referral codes for debugging
                console.log('📋 Available referral codes:');
                allUsersSnapshot.docs.forEach((doc, index) => {
                    const userData = doc.data();
                    if (userData.referralCode) {
                        console.log(`  ${index + 1}. ${userData.name || 'Unknown'} - ${userData.referralCode}`);
                    }
                });
                
                dataHandlers.hideReferrerInfo();
                
                // Show error toast only if user has typed something substantial
                if (trimmedCode.length >= 8) {
                    utils.showToast('Invalid referral code', 'error');
                }
                return false;
            }
        } catch (error) {
            console.error('❌ Error validating referral code:', error);
            console.error('🔍 Error details:', {
                code: trimmedCode,
                error: error.message,
                stack: error.stack
            });
            dataHandlers.hideReferrerInfo();
            
            // Don't show error toast for permission issues during registration
            if (error.message && !error.message.includes('permission')) {
                utils.showToast('Error validating referral code', 'error');
            }
            return false;
        }
    },

    showReferrerInfo(referrerName) {
        console.log('🎯 showReferrerInfo called with:', referrerName);
        
        const referrerInfo = document.getElementById('referrerInfo');
        const referrerNameSpan = document.getElementById('referrerName');
        
        console.log('🔍 DOM elements check:', {
            referrerInfo: !!referrerInfo,
            referrerNameSpan: !!referrerNameSpan
        });
        
        if (referrerInfo && referrerNameSpan) {
            // Format the referrer name nicely
            const formattedName = referrerName.charAt(0).toUpperCase() + referrerName.slice(1);
            console.log('📝 Setting referrer name to:', formattedName);
            
            referrerNameSpan.textContent = formattedName;
            referrerInfo.style.display = 'block';
            
            // Add a small animation effect
            referrerInfo.style.opacity = '0';
            referrerInfo.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                referrerInfo.style.transition = 'all 0.3s ease';
                referrerInfo.style.opacity = '1';
                referrerInfo.style.transform = 'translateY(0)';
            }, 100);
            
            console.log('✅ Referrer info should now be visible');
            console.log('👤 Showing referrer info for:', formattedName);
            
            // Double check if it's actually visible
            setTimeout(() => {
                const isVisible = referrerInfo.style.display !== 'none';
                const currentName = referrerNameSpan.textContent;
                console.log('🔍 Visibility check:', {
                    isVisible: isVisible,
                    currentName: currentName,
                    displayStyle: referrerInfo.style.display
                });
            }, 500);
            
        } else {
            console.error('❌ Referrer info elements not found!');
            console.error('Missing elements:', {
                referrerInfo: !referrerInfo,
                referrerNameSpan: !referrerNameSpan
            });
        }
    },

    hideReferrerInfo() {
        const referrerInfo = document.getElementById('referrerInfo');
        if (referrerInfo) {
            // Add fade out animation
            referrerInfo.style.transition = 'all 0.3s ease';
            referrerInfo.style.opacity = '0';
            referrerInfo.style.transform = 'translateY(-10px)';
            
            setTimeout(() => {
                referrerInfo.style.display = 'none';
            }, 300);
            
            console.log('👤 Hiding referrer info');
        }
    },

    // Fast Team Levels Display
    async showTeamLevels() {
        console.log('🚀 === FAST TEAM LEVELS LOADING ===');
        
        try {
            const teamContainer = document.getElementById('completeTeamContainer');
            if (!teamContainer) {
                console.error('❌ Team container not found');
                return;
            }

            // Show loading state
            teamContainer.innerHTML = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Loading your team levels...</p>
                </div>
            `;

            const { auth, db } = firebaseServices.initialize();
            if (!auth || !db || !auth.currentUser) {
                throw new Error('Firebase not initialized');
            }

            // Get all referrals at once for better performance
            const allReferralsSnapshot = await db.collection('referrals').get();
            const referralsMap = new Map();
            
            // Build referrals map
            allReferralsSnapshot.docs.forEach(doc => {
                const referral = doc.data();
                if (!referralsMap.has(referral.referrerId)) {
                    referralsMap.set(referral.referrerId, []);
                }
                referralsMap.get(referral.referrerId).push(referral);
            });

            // Get all user IDs from referrals
            const allUserIds = new Set();
            referralsMap.forEach(referrals => {
                referrals.forEach(referral => {
                    allUserIds.add(referral.referredId);
                });
            });

            // Get all users data at once
            const usersData = new Map();
            const userPromises = Array.from(allUserIds).map(async (userId) => {
                try {
                    const userDoc = await db.collection('users').doc(userId).get();
                    if (userDoc.exists) {
                        usersData.set(userId, userDoc.data());
                    }
                } catch (error) {
                    console.warn(`Failed to fetch user ${userId}:`, error);
                }
            });

            await Promise.all(userPromises);

            // Build level structure
            const levels = new Map();
            let currentLevel = [auth.currentUser.uid];
            let levelNumber = 1;

            while (currentLevel.length > 0 && levelNumber <= 30) {
                const nextLevel = [];
                const levelUsers = [];

                for (const userId of currentLevel) {
                    const referrals = referralsMap.get(userId) || [];
                    
                    for (const referral of referrals) {
                        const userData = usersData.get(referral.referredId);
                        if (userData) {
                            levelUsers.push({
                                userId: referral.referredId,
                                name: userData.name || 'Unknown',
                                email: userData.email || 'N/A',
                                mobile: userData.mobile || 'N/A',
                                status: userData.status || 'Active',
                                joinDate: userData.createdAt,
                                selfDeposit: userData.selfDeposit || 0,
                                totalDeposits: userData.totalDeposits || 0
                            });
                            nextLevel.push(referral.referredId);
                        }
                    }
                }

                if (levelUsers.length > 0) {
                    levels.set(levelNumber, levelUsers);
                    currentLevel = nextLevel;
                    levelNumber++;
                } else {
                    break;
                }
            }

            // Build HTML
            let teamHTML = '';
            let totalMembers = 0;
            let totalInvestment = 0;
            let totalActive = 0;

            levels.forEach((levelUsers, level) => {
                totalMembers += levelUsers.length;
                const levelInvestment = levelUsers.reduce((sum, user) => {
                    const invest = (level === 1)
                        ? (Number(user.totalDeposits) || Number(user.selfDeposit) || 0)
                        : (Number(user.selfDeposit) || 0);
                    return sum + invest;
                }, 0);
                totalInvestment += levelInvestment;
                const levelActive = levelUsers.filter(user => user.status === 'Active').length;
                totalActive += levelActive;

                // Show mobile only for Level 1
                const showMobile = level === 1;

                teamHTML += `
                    <div class="level-card ${level === 1 ? 'level-1' : 'level-other'}">
                        <div class="level-header">
                            <div class="level-title">
                                <h4>Level ${level}</h4>
                                ${level === 1 ? '<span class="level-badge">Direct Team</span>' : ''}
                            </div>
                            <div class="level-info">
                                <span class="member-count">
                                    <i class="fas fa-users"></i>
                                    ${levelUsers.length} Members
                                </span>
                                <span class="investment">
                                    <i class="fas fa-dollar-sign"></i>
                                    ${utils.formatCurrency(levelInvestment)}
                                </span>
                                <span class="active-count">
                                    <i class="fas fa-check-circle"></i>
                                    ${levelActive} Active
                                </span>
                            </div>
                        </div>
                        <div class="level-members">
                            ${levelUsers.map(user => `
                                <div class="member-item">
                                    <div class="member-basic">
                                        <div class="member-avatar">
                                            <i class="fas fa-user"></i>
                                        </div>
                                        <div class="member-info">
                                            <span class="member-name">${utils.sanitize(user.name)}</span>
                                            <span class="member-status ${user.status.toLowerCase()}">
                                                <i class="fas fa-circle"></i>
                                                ${user.status}
                                            </span>
                                        </div>
                                    </div>
                                    <div class="member-details">
                                        <div class="detail-row">
                                            <span class="member-email">
                                                <i class="fas fa-envelope"></i>
                                                ${user.email}
                                            </span>
                                            ${showMobile ? `
                                                <span class="member-mobile">
                                                    <i class="fas fa-phone"></i>
                                                    ${user.mobile || 'N/A'}
                                                </span>
                                            ` : ''}
                                        </div>
                                        <div class="detail-row">
                                            <span class="member-id">
                                                <i class="fas fa-id-card"></i>
                                                ${user.userId.substring(0, 8)}
                                            </span>
                                            <span class="member-join">
                                                <i class="fas fa-calendar"></i>
                                                ${utils.formatDate(user.joinDate)}
                                            </span>
                                        </div>
                                        <div class="detail-row">
                                            <span class="member-investment">
                                                <i class="fas fa-coins"></i>
                                                ${utils.formatCurrency((level === 1) ? ((user.totalDeposits || 0) || (user.selfDeposit || 0)) : (user.selfDeposit || 0))}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            });

            // Add summary
            teamHTML = `
                <div class="team-overview">
                    <h3>Your Team Overview</h3>
                    <div class="team-stats">
                        <div class="stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-users"></i>
                            </div>
                            <div class="stat-content">
                                <div class="stat-number">${totalMembers}</div>
                                <div class="stat-label">Total Members</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-check-circle"></i>
                            </div>
                            <div class="stat-content">
                                <div class="stat-number">${totalActive}</div>
                                <div class="stat-label">Active Members</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-dollar-sign"></i>
                            </div>
                            <div class="stat-content">
                                <div class="stat-number">${utils.formatCurrency(totalInvestment)}</div>
                                <div class="stat-label">Total Investment</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="team-levels">
                    ${teamHTML}
                </div>
            `;

            teamContainer.innerHTML = teamHTML;
            console.log(`✅ Fast team loading complete: ${totalMembers} members across ${levels.size} levels`);

        } catch (error) {
            console.error('❌ Error in fast team loading:', error);
            const teamContainer = document.getElementById('completeTeamContainer');
            if (teamContainer) {
                teamContainer.innerHTML = `
                    <div class="error-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Error loading team data. Please try again.</p>
                        <button onclick="showTeamLevels()" style="margin-top: 10px; padding: 8px 16px; background: var(--theme-primary); color: white; border: none; border-radius: 6px; cursor: pointer;">Retry</button>
                    </div>
                `;
            }
        }
    },

    setupRealtimeSettingsListeners() {
        const { db } = firebaseServices.initialize();
        if (!db) return;
        try {
            if (!state.unsubscribeROISettings) {
                state.unsubscribeROISettings = db.collection('adminSettings').doc('roi').onSnapshot((doc) => {
                    if (!doc.exists) return;
                    if (state.debounceTimers.roi) clearTimeout(state.debounceTimers.roi);
                    state.debounceTimers.roi = setTimeout(async () => {
                        if (state.calculating.roi) return;
                        state.calculating.roi = true;
                        try {
                            await dataHandlers.calculateROI();
                            if (typeof window.refreshDashboardStats === 'function') await window.refreshDashboardStats();
                            else if (typeof dataHandlers.loadUserData === 'function') dataHandlers.loadUserData();
                        } finally {
                            state.calculating.roi = false;
                        }
                    }, 400);
                }, (err) => console.warn('ROI settings listener error:', err));
            }
            if (!state.unsubscribeLevelSettings) {
                state.unsubscribeLevelSettings = db.collection('settings').doc('levelIncomeList').onSnapshot((doc) => {
                    if (!doc.exists) return;
                    if (state.debounceTimers.level) clearTimeout(state.debounceTimers.level);
                    state.debounceTimers.level = setTimeout(async () => {
                        if (state.calculating.level) return;
                        state.calculating.level = true;
                        try {
                            await dataHandlers.calculateLevelIncome();
                            if (typeof window.refreshDashboardStats === 'function') await window.refreshDashboardStats();
                            else if (typeof dataHandlers.loadUserData === 'function') dataHandlers.loadUserData();
                        } finally {
                            state.calculating.level = false;
                        }
                    }, 400);
                }, (err) => console.warn('Level settings listener error:', err));
            }
        } catch (e) {
            console.warn('Failed to attach realtime listeners:', e);
        }
    },

    teardownRealtimeSettingsListeners() {
        try {
            if (state.unsubscribeROISettings) {
                state.unsubscribeROISettings();
                state.unsubscribeROISettings = null;
            }
            if (state.unsubscribeLevelSettings) {
                state.unsubscribeLevelSettings();
                state.unsubscribeLevelSettings = null;
            }
        } catch (e) {
            console.warn('Failed to detach realtime listeners:', e);
        }
    },

    getStartOfDay(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d;
    },

    getDateAt10AM(date) {
        const d = new Date(date);
        d.setHours(10, 0, 0, 0);
        return d;
    },

    getNextPayoutTime() {
        const today10 = this.getDateAt10AM(new Date());
        const now = new Date();
        return now <= today10 ? today10 : this.getDateAt10AM(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    },

    async computeDailyROIForDate(targetDate) {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) return 0;
        try {
            const adminSettingsDoc = await firebaseServices.safeGet(db.collection('adminSettings').doc('roi'));
            const roiSettings = adminSettingsDoc.exists ? adminSettingsDoc.data() : {};
            const dailyROI = roiSettings.dailyROI || 0.01;
            const maxROI = roiSettings.maxROI || 0.30;

            const depositsSnapshot = await firebaseServices.safeQuery(
                db.collection('deposits').where('userId', '==', state.currentUser.uid).where('status', '==', 'approved')
            );
            let daily = 0;
            depositsSnapshot.docs.forEach(doc => {
                const dep = doc.data();
                const amount = dep.amount || 0;
                const approvedAt = dep.approvedAt?.toDate() || dep.createdAt?.toDate() || new Date();
                const daysSinceDepositAtTarget = Math.floor((dataHandlers.getStartOfDay(targetDate).getTime() - dataHandlers.getStartOfDay(approvedAt).getTime()) / (1000 * 60 * 60 * 24));
                const maxROIDays = Math.floor(maxROI / dailyROI);
                // Yesterday's accrual counts if daysSinceDepositAtTarget >= 0 and still below cap
                if (daysSinceDepositAtTarget >= 0 && daysSinceDepositAtTarget < maxROIDays) {
                    daily += amount * dailyROI;
                }
            });
            return daily;
        } catch (e) {
            console.warn('computeDailyROIForDate error:', e);
            return 0;
        }
    },

    async computeDailyLevelForDate(targetDate) {
        // Without historical snapshots, approximate with current active team and settings
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) return 0;
        try {
            const levelIncomeSettings = await firebaseServices.safeGet(db.collection('settings').doc('levelIncomeList'));
            const levelSettings = levelIncomeSettings.exists ? levelIncomeSettings.data().levels || [] : [];
            if (levelSettings.length === 0) return 0;
            const teamData = await dataHandlers.getUserTeamData(state.currentUser.uid);
            const userDoc = await firebaseServices.safeGet(db.collection('users').doc(state.currentUser.uid));
            const userData = userDoc.exists ? userDoc.data() : {};

            let daily = 0;
            for (let i = 0; i < levelSettings.length; i++) {
                const setting = levelSettings[i];
                if (setting.blocked) continue;
                const levelTeam = teamData[i] || [];
                const meets = await dataHandlers.checkLevelConditions(userData, levelTeam, setting);
                if (!meets) continue;
                const dailyForLevel = levelTeam.reduce((sum, u) => {
                    if (u.status === 'active' && u.selfDeposit > 0) {
                        return sum + (u.selfDeposit * (setting.incomePercent / 100));
                    }
                    return sum;
                }, 0);
                daily += dailyForLevel;
            }
            return daily;
        } catch (e) {
            console.warn('computeDailyLevelForDate error:', e);
            return 0;
        }
    },

    async postDailyIncomeIfDue() {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) return;
        try {
            const userId = state.currentUser.uid;
            const payoutRef = db.collection('userPayouts').doc(userId);
            const payoutDoc = await firebaseServices.safeGet(payoutRef);
            const now = new Date();
            const today = dataHandlers.getStartOfDay(now);
            const today10 = dataHandlers.getDateAt10AM(now);

            let lastPayoutAt = null;
            if (payoutDoc.exists) {
                const d = payoutDoc.data();
                lastPayoutAt = d.lastPayoutAt?.toDate ? d.lastPayoutAt.toDate() : (d.lastPayoutAt ? new Date(d.lastPayoutAt) : null);
            }

            // We post yesterday's income at today 10:00 AM
            const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
            const shouldPostNow = now >= today10 && (!lastPayoutAt || lastPayoutAt < today10);
            if (!shouldPostNow) return;

            // Compute yesterday's incomes
            const roiDaily = await dataHandlers.computeDailyROIForDate(yesterday);
            const levelDaily = await dataHandlers.computeDailyLevelForDate(yesterday);
            const totalDaily = roiDaily + levelDaily;
            if (totalDaily <= 0) {
                // Update lastPayoutAt to avoid re-checking continuously with zero
                await payoutRef.set({
                    lastPayoutAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                return;
            }

            // Create wallet transaction and update user balance atomically
            await db.runTransaction(async (tx) => {
                const userDocRef = db.collection('users').doc(userId);
                const userSnap = await tx.get(userDocRef);
                const currentBalance = userSnap.exists ? (userSnap.data().balance || 0) : 0;
                const newBalance = currentBalance + totalDaily;
                tx.update(userDocRef, { balance: newBalance });

                const txRef = db.collection('walletTransactions').doc();
                tx.set(txRef, {
                    id: txRef.id,
                    userId,
                    type: 'dailyIncome',
                    amount: totalDaily,
                    roiPortion: roiDaily,
                    levelPortion: levelDaily,
                    forDate: dataHandlers.getStartOfDay(yesterday).toISOString(),
                    postedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    note: 'Daily income posted at 10:00 AM'
                });

                tx.set(payoutRef, {
                    lastPayoutAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });

            // Update local state and UI
            state.userData.balance = (state.userData.balance || 0) + totalDaily;
            const userBalanceElement = document.getElementById('userBalance');
            if (userBalanceElement) userBalanceElement.textContent = utils.formatCurrency(state.userData.balance || 0);
            if (typeof window.refreshDashboardStats === 'function') await window.refreshDashboardStats();
            utils.showToast('Daily income credited to your wallet', 'success');
        } catch (e) {
            console.error('postDailyIncomeIfDue error:', e);
        }
    },

    async loadRealTimeReferralCount() {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) return 0;
        try {
            const snap = await firebaseServices.safeQuery(
                db.collection('referrals').where('referrerId', '==', state.currentUser.uid)
            );
            return snap.size || 0;
        } catch (e) {
            console.warn('loadRealTimeReferralCount failed:', e);
            return 0;
        }
    },

    loadKYCStatus(kycDoc) {
        try {
            const statusTextEl = document.getElementById('kycStatusText');
            const historyBody = document.getElementById('kycHistory');
            if (!statusTextEl) return;

            if (!kycDoc || !kycDoc.exists) {
                statusTextEl.textContent = 'Not submitted';
                if (historyBody) historyBody.innerHTML = '<tr><td colspan="3">No KYC submissions</td></tr>';
                return;
            }
            const data = kycDoc.data();
            const status = data.status || 'pending';
            const remarks = data.remarks || '-';
            const submittedAt = (data.createdAt?.toDate ? data.createdAt.toDate() : new Date()).toLocaleString();
            statusTextEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
            if (historyBody) {
                historyBody.innerHTML = `<tr>
                    <td>${submittedAt}</td>
                    <td>${status}</td>
                    <td>${utils.sanitize(remarks)}</td>
                </tr>`;
            }
        } catch (e) {
            console.warn('loadKYCStatus failed:', e);
        }
    },

    async computeWalletIncomeAggregates() {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) return;
        try {
            // Fetch all daily income transactions for this user
            const snap = await firebaseServices.safeQuery(
                db.collection('walletTransactions')
                  .where('userId', '==', state.currentUser.uid)
                  .where('type', '==', 'dailyIncome')
            );
            let total = 0;
            let totalROI = 0;
            let totalLevel = 0;
            let todayTotal = 0;
            const todayStart = new Date(); todayStart.setHours(0,0,0,0);
            const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
            (snap.docs || []).forEach(doc => {
                const tx = doc.data();
                const amt = Number(tx.amount || 0) || 0;
                const roi = Number(tx.roiPortion || 0) || 0;
                const lvl = Number(tx.levelPortion || 0) || 0;
                total += amt;
                totalROI += roi;
                totalLevel += lvl;
                const postedAt = tx.postedAt?.toDate ? tx.postedAt.toDate() : (tx.postedAt ? new Date(tx.postedAt) : null);
                if (postedAt && postedAt >= todayStart && postedAt <= todayEnd) {
                    todayTotal += amt;
                }
            });
            // Update UI cards
            const elTotalIncome = document.getElementById('totalIncome');
            const elTotalIncomeCard = document.getElementById('totalIncomeCard');
            const elLevelIncome = document.getElementById('levelIncome');
            const elROIIncome = document.getElementById('roiIncome');
            const elTodayIncome = document.getElementById('todayIncome');
            const elWithdrawable = document.getElementById('totalWithdrawable');
            if (elTotalIncome) elTotalIncome.textContent = utils.formatCurrency(total);
            if (elTotalIncomeCard) elTotalIncomeCard.textContent = utils.formatCurrency(total);
            if (elLevelIncome) elLevelIncome.textContent = utils.formatCurrency(totalLevel);
            if (elROIIncome) elROIIncome.textContent = utils.formatCurrency(totalROI);
            if (elTodayIncome) elTodayIncome.textContent = utils.formatCurrency(todayTotal);
            if (elWithdrawable) elWithdrawable.textContent = utils.formatCurrency(total);
            console.log('✅ Income cards updated from wallet payouts:', { total, totalROI, totalLevel, todayTotal });
        } catch (e) {
            console.warn('Wallet aggregates failed:', e?.message || e);
        }
    }
};
async function initializeApp() {
    const { auth, db } = firebaseServices.initialize();
    if (!auth || !db) {
        console.error('Firebase auth or database not initialized', { auth: !!auth, db: !!db });
        utils.showToast('Authentication unavailable', 'error');
        return;
    }

    console.log('🚀 Initializing application...');
    
    // Initialize referral code validation
    initializeReferralCodeValidation();

    // Handle authentication state changes
    auth.onAuthStateChanged(async user => {
        console.log('Auth state changed, user:', user ? user.uid : 'null');
        const authSection = document.getElementById('authSection');
        const dashboardContainer = document.getElementById('dashboardContainer');
        const messageBox = document.getElementById('message');

        if (!authSection || !dashboardContainer || !messageBox) {
            console.error('Missing UI elements:', {
                authSection: !!authSection,
                dashboardContainer: !!dashboardContainer,
                messageBox: !!messageBox
            });
            utils.showToast('UI initialization error', 'error');
            return;
        }

        if (user) {
            state.currentUser = user;
            authSection.style.display = 'none';
            dashboardContainer.style.display = 'block';
            messageBox.style.display = 'none';
            console.log('User authenticated, initializing data for:', user.uid);

            // Attach realtime settings listeners now that user is active
            dataHandlers.setupRealtimeSettingsListeners();
            
            // Test storage connection
            await utils.testStorageConnection();
            
            await dataHandlers.initializeUserData();
            
            // Wallet-based aggregates for income cards
            try { await dataHandlers.computeWalletIncomeAggregates(); } catch(_) {}

            // Start payout scheduler (client-side) only if enabled via flag
            if (state.enableClientPayout) {
                try {
                    await dataHandlers.postDailyIncomeIfDue();
                } catch(_) {}
                if (state.payoutCheckIntervalId) clearInterval(state.payoutCheckIntervalId);
                state.payoutCheckIntervalId = setInterval(() => {
                    dataHandlers.postDailyIncomeIfDue();
                }, 60 * 1000);
            }

            // Initialize navigation after user data is loaded and DOM is ready
            setTimeout(() => {
                initializeNavigation();
            }, 100);
        } else {
            dataHandlers.teardownRealtimeSettingsListeners();
            if (state.payoutCheckIntervalId) { clearInterval(state.payoutCheckIntervalId); state.payoutCheckIntervalId = null; }
            state.currentUser = null;
            state.userData = {};
            authSection.style.display = 'block';
            dashboardContainer.style.display = 'none';
            console.log('No user authenticated, showing auth section');
            authHandlers.toggleForms('login');
        }
    });

    // Form event listeners
    // ... existing code ...
}

// Patch refresh to also update income cards from wallet
(function patchRefreshToUpdateIncomeCards(){
    const orig = window.refreshDashboardStats;
    if (typeof orig === 'function') {
        window.refreshDashboardStats = async function() {
            const result = await orig.apply(this, arguments);
            try { await dataHandlers.computeWalletIncomeAggregates(); } catch(_) {}
            return result;
        }
    }
})();

// ... existing code ...
// Initialize referral code validation
function initializeReferralCodeValidation() {
    // Add event listener for referral code validation
    const referralInput = document.getElementById('referralCode');
    if (referralInput) {
        let validationTimeout;
        
        referralInput.addEventListener('input', function() {
            const code = this.value.trim();
            
            // Clear previous timeout
            if (validationTimeout) {
                clearTimeout(validationTimeout);
            }
            
            if (code.length >= 8) {
                // Add delay to avoid too many requests
                validationTimeout = setTimeout(() => {
                    dataHandlers.validateReferralCode(code);
                }, 500);
            } else {
                dataHandlers.hideReferrerInfo();
            }
        });
        
        // Add blur event for better validation
        referralInput.addEventListener('blur', function() {
            const code = this.value.trim();
            if (code.length >= 8) {
                dataHandlers.validateReferralCode(code);
            }
        });
        
        // Add keypress event for Enter key
        referralInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const code = this.value.trim();
                if (code.length >= 8) {
                    dataHandlers.validateReferralCode(code);
                }
            }
        });
    }
    
    // Handle auto-filled referral codes
    const urlParams = new URLSearchParams(window.location.search);
    const referralCodeFromUrl = urlParams.get('ref');
    const referralCodeFromStorage = localStorage.getItem('referralCode');
    
    if (referralCodeFromUrl || referralCodeFromStorage) {
        const referralCode = referralCodeFromUrl || referralCodeFromStorage;
        if (referralInput) {
            referralInput.value = referralCode;
            console.log('🔗 Referral code auto-filled:', referralCode);
            // Validate the referral code and show referrer name
            setTimeout(() => {
                dataHandlers.validateReferralCode(referralCode);
            }, 1500); // Increased delay to ensure Firebase is initialized
        }
    }
}

// Global test functions for debugging
window.testStorage = () => utils.testStorageConnection();
window.testDepositUpload = () => utils.testDepositUpload();

(function addRefreshThrottle(){
    let lastRefreshAt = 0;
    const orig = window.refreshDashboardStats;
    if (typeof orig === 'function') {
        window.refreshDashboardStats = async function() {
            const now = Date.now();
            if (now - lastRefreshAt < 1000) return; // 1s throttle to reduce spam
            lastRefreshAt = now;
            return orig.apply(this, arguments);
        };
    }
})();
// Global debugging function for new user issues
window.debugNewUserIssues = async () => {
    console.log('🔍 Debugging new user issues...');
    
    const { auth, db } = firebaseServices.initialize();
    if (!auth || !db) {
        console.error('❌ Firebase not initialized');
        return;
    }
    
    const user = auth.currentUser;
    if (!user) {
        console.log('❌ No user logged in');
        return;
    }
    
    console.log('✅ User logged in:', user.uid);
    
    try {
        // Check user document
        const userDoc = await db.collection('users').doc(user.uid).get();
        console.log('📄 User document exists:', userDoc.exists);
        if (userDoc.exists) {
            console.log('📄 User data:', userDoc.data());
        }
        
        // Check payment methods
        const paymentMethodsDoc = await db.collection('adminSettings').doc('paymentMethods').get();
        console.log('💳 Payment methods exist:', paymentMethodsDoc.exists);
        if (paymentMethodsDoc.exists) {
            console.log('💳 Payment methods:', paymentMethodsDoc.data());
        }
        
        // Check user settings
        const settingsDoc = await db.collection('userSettings').doc(user.uid).get();
        console.log('⚙️ User settings exist:', settingsDoc.exists);
        
        console.log('🔍 Debug complete');
    } catch (error) {
        console.error('❌ Debug error:', error);
    }
};

// Global debugging function for referral code issues
window.debugReferralCode = async (code) => {
    console.log('🔍 Debugging referral code:', code);
    
    const { auth, db } = firebaseServices.initialize();
    if (!auth || !db) {
        console.error('❌ Firebase not initialized');
        return;
    }
    
    try {
        // Check if code exists in users collection
        const usersSnapshot = await db.collection('users').where('referralCode', '==', code).get();
        console.log('📊 Users with this referral code:', usersSnapshot.size);
        
        if (!usersSnapshot.empty) {
            usersSnapshot.forEach(doc => {
                const userData = doc.data();
                console.log('✅ Found user:', {
                    id: doc.id,
                    name: userData.name,
                    email: userData.email,
                    referralCode: userData.referralCode,
                    userId: userData.userId
                });
            });
        } else {
            console.log('❌ No user found with referral code:', code);
            
            // Check all users to see what referral codes exist
            const allUsersSnapshot = await db.collection('users').limit(10).get();
            console.log('📋 Sample of existing referral codes:');
            allUsersSnapshot.forEach(doc => {
                const userData = doc.data();
                if (userData.referralCode) {
                    console.log(`- ${userData.name}: ${userData.referralCode}`);
                }
            });
        }
        
        // Test validation function
        console.log('🧪 Testing validation function...');
        const isValid = await dataHandlers.validateReferralCode(code);
        console.log('✅ Validation result:', isValid);
        
    } catch (error) {
        console.error('❌ Debug error:', error);
    }
};

// Global debugging function for referral system
window.debugReferralSystem = async () => {
    console.log('🔍 Debugging referral system...');
    
    const { auth, db } = firebaseServices.initialize();
    if (!auth || !db) {
        console.error('❌ Firebase not initialized');
        return;
    }
    
    const user = auth.currentUser;
    if (!user) {
        console.log('❌ No user logged in');
        return;
    }
    
    console.log('✅ User logged in:', user.uid);
    
    try {
        // Check user's referral code
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            console.log('📄 User data:', {
                name: userData.name,
                referralCode: userData.referralCode,
                userId: userData.userId
            });
        }
        
        // Check all referrals in database
        const allReferralsSnapshot = await db.collection('referrals').get();
        console.log('📊 Total referrals in database:', allReferralsSnapshot.docs.length);
        
        // Check user's direct referrals
        const userReferralsSnapshot = await db.collection('referrals').where('referrerId', '==', user.uid).get();
        console.log('👥 User\'s direct referrals:', userReferralsSnapshot.docs.length);
        
        userReferralsSnapshot.docs.forEach((doc, index) => {
            const referral = doc.data();
            console.log(`Referral ${index + 1}:`, {
                id: doc.id,
                referrerId: referral.referrerId,
                referredId: referral.referredId,
                userId: referral.userId,
                referrerCode: referral.referrerCode
            });
        });
        
        // Check if user is referred by someone
        const userReferredSnapshot = await db.collection('referrals').where('referredId', '==', user.uid).get();
        console.log('🔗 User is referred by:', userReferredSnapshot.docs.length, 'people');
        
        if (!userReferredSnapshot.empty) {
            const referral = userReferredSnapshot.docs[0].data();
            console.log('Referrer details:', {
                referrerId: referral.referrerId,
                referrerCode: referral.referrerCode
            });
        }
        
        console.log('🔍 Referral system debug complete');
        
    } catch (error) {
        console.error('❌ Debug error:', error);
    }
};

// Global function to test referral code validation
window.testReferralCodeValidation = async (code) => {
    console.log('🧪 Testing referral code validation for:', code);
    
    if (!code || code.trim().length < 8) {
        console.log('❌ Invalid code length');
        return;
    }
    
    try {
        const result = await dataHandlers.validateReferralCode(code);
        console.log('✅ Validation result:', result);
        
        // Check if referrer info is showing
        const referrerInfo = document.getElementById('referrerInfo');
        const referrerNameSpan = document.getElementById('referrerName');
        
        if (referrerInfo && referrerNameSpan) {
            console.log('📋 Referrer info display:', {
                visible: referrerInfo.style.display !== 'none',
                name: referrerNameSpan.textContent
            });
        } else {
            console.log('❌ Referrer info elements not found');
        }
        
    } catch (error) {
        console.error('❌ Test error:', error);
    }
};
// Comprehensive debugging function for referral code issues
window.debugReferralCodeIssue = async () => {
    console.log('🔍 Comprehensive referral code debugging...');
    
    const { auth, db } = firebaseServices.initialize();
    if (!auth || !db) {
        console.error('❌ Firebase not initialized');
        return;
    }
    
    // Check if we're on the right page
    const referralInput = document.getElementById('referralCode');
    const referrerInfo = document.getElementById('referrerInfo');
    const referrerNameSpan = document.getElementById('referrerName');
    
    console.log('📋 Page elements check:', {
        referralInput: !!referralInput,
        referrerInfo: !!referrerInfo,
        referrerNameSpan: !!referrerNameSpan
    });
    
    if (!referralInput) {
        console.error('❌ Referral input not found - make sure you are on registration page');
        return;
    }
    
    // Check current referral code value
    const currentCode = referralInput.value;
    console.log('📝 Current referral code:', currentCode);
    
    // Check all users in database
    try {
        const allUsersSnapshot = await db.collection('users').limit(20).get();
        console.log('📊 Total users in database:', allUsersSnapshot.docs.length);
        
        console.log('📋 Available referral codes:');
        allUsersSnapshot.docs.forEach((doc, index) => {
            const userData = doc.data();
            if (userData.referralCode) {
                console.log(`${index + 1}. ${userData.name || 'Unknown'} - ${userData.referralCode}`);
            }
        });
        
        // Test with first available referral code
        if (allUsersSnapshot.docs.length > 0) {
            const firstUser = allUsersSnapshot.docs[0].data();
            if (firstUser.referralCode) {
                console.log('🧪 Testing with first available referral code:', firstUser.referralCode);
                await dataHandlers.validateReferralCode(firstUser.referralCode);
            }
        }
        
    } catch (error) {
        console.error('❌ Error checking users:', error);
    }
    
    // Check if validation function is working
    console.log('🧪 Testing validation function directly...');
    try {
        const testResult = await dataHandlers.validateReferralCode('12345678');
        console.log('✅ Direct validation test result:', testResult);
    } catch (error) {
        console.error('❌ Direct validation test failed:', error);
    }
};
// Simple step-by-step test function
window.testReferralStepByStep = async () => {
    console.log('🧪 Step-by-step referral code test...');
    
    // Step 1: Check if we're on registration page
    console.log('📋 Step 1: Checking page elements...');
    const referralInput = document.getElementById('referralCode');
    if (!referralInput) {
        console.error('❌ Not on registration page! Please go to registration page first.');
        return;
    }
    console.log('✅ Registration page found');
    
    // Step 2: Check if there are any users in database
    console.log('📋 Step 2: Checking database...');
    const { auth, db } = firebaseServices.initialize();
    if (!db) {
        console.error('❌ Database not available');
        return;
    }
    
    try {
        const usersSnapshot = await db.collection('users').limit(5).get();
        console.log(`✅ Found ${usersSnapshot.docs.length} users in database`);
        
        if (usersSnapshot.docs.length === 0) {
            console.error('❌ No users in database! Please create some users first.');
            return;
        }
        
        // Step 3: Show available referral codes
        console.log('📋 Step 3: Available referral codes:');
        usersSnapshot.docs.forEach((doc, index) => {
            const userData = doc.data();
            if (userData.referralCode) {
                console.log(`  ${index + 1}. ${userData.name || 'Unknown'} - ${userData.referralCode}`);
            }
        });
        
        // Step 4: Test with first available code
        const firstUser = usersSnapshot.docs[0].data();
        if (firstUser.referralCode) {
            console.log(`📋 Step 4: Testing with referral code: ${firstUser.referralCode}`);
            
            // Set the referral code in the input
            referralInput.value = firstUser.referralCode;
            
            // Trigger validation
            await dataHandlers.validateReferralCode(firstUser.referralCode);
            
            console.log('✅ Test completed! Check if referrer name is showing above the input field.');
        }
        
    } catch (error) {
        console.error('❌ Error during test:', error);
    }
};

// Comprehensive debugging function for all referral issues
window.debugAllReferralIssues = async () => {
    console.log('🔍 === COMPREHENSIVE REFERRAL SYSTEM DEBUG ===');
    
    const { auth, db } = firebaseServices.initialize();
    if (!auth || !db) {
        console.error('❌ Firebase not initialized');
        return;
    }
    
    // Check current page
    const currentPage = window.location.pathname;
    console.log('📄 Current page:', currentPage);
    
    // Check if user is logged in
    const currentUser = auth.currentUser;
    console.log('👤 Current user:', currentUser ? currentUser.uid : 'Not logged in');
    
    // Check database collections
    try {
        console.log('📊 === DATABASE CHECK ===');
        
        // Check users collection
        const usersSnapshot = await db.collection('users').limit(10).get();
        console.log(`👥 Users in database: ${usersSnapshot.docs.length}`);
        
        console.log('📋 Users with referral codes:');
        usersSnapshot.docs.forEach((doc, index) => {
            const userData = doc.data();
            if (userData.referralCode) {
                console.log(`  ${index + 1}. ${userData.name || 'Unknown'} - ${userData.referralCode} (${userData.userId || 'No ID'})`);
            }
        });
        
        // Check referrals collection
        const referralsSnapshot = await db.collection('referrals').limit(10).get();
        console.log(`🔗 Referrals in database: ${referralsSnapshot.docs.length}`);
        
        console.log('📋 Referral records:');
        referralsSnapshot.docs.forEach((doc, index) => {
            const referralData = doc.data();
            console.log(`  ${index + 1}. Referrer: ${referralData.referrerId} -> Referred: ${referralData.referredId || referralData.userId}`);
        });
        
        // If user is logged in, check their referrals
        if (currentUser) {
            console.log('🔍 === USER REFERRALS CHECK ===');
            const userReferralsSnapshot = await db.collection('referrals').where('referrerId', '==', currentUser.uid).get();
            console.log(`👤 User's referrals: ${userReferralsSnapshot.docs.length}`);
            
            if (userReferralsSnapshot.docs.length > 0) {
                console.log('📋 User referral details:');
                for (const doc of userReferralsSnapshot.docs) {
                    const referralData = doc.data();
                    console.log(`  - Referred ID: ${referralData.referredId || referralData.userId}`);
                    
                    // Try to get referred user details
                    try {
                        const referredUserDoc = await db.collection('users').doc(referralData.referredId || referralData.userId).get();
                        if (referredUserDoc.exists) {
                            const referredUserData = referredUserDoc.data();
                            console.log(`    Name: ${referredUserData.name || 'Unknown'}`);
                            console.log(`    Email: ${referredUserData.email || 'N/A'}`);
                            console.log(`    Status: ${referredUserData.status || 'Unknown'}`);
                        } else {
                            console.log(`    ❌ Referred user not found`);
                        }
                    } catch (error) {
                        console.log(`    ❌ Error fetching referred user: ${error.message}`);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Database check failed:', error);
    }
    
    // Check page elements
    console.log('🔍 === PAGE ELEMENTS CHECK ===');
    const referralInput = document.getElementById('referralCode');
    const referrerInfo = document.getElementById('referrerInfo');
    const referrerNameSpan = document.getElementById('referrerName');
    const referralsTableBody = document.getElementById('referralsTableBody');
    
    console.log('📋 Page elements:', {
        referralInput: !!referralInput,
        referrerInfo: !!referrerInfo,
        referrerNameSpan: !!referrerNameSpan,
        referralsTableBody: !!referralsTableBody
    });
    
    // Test referral code validation if on registration page
    if (referralInput) {
        console.log('🧪 === REFERRAL CODE VALIDATION TEST ===');
        const testCode = '12345678';
        console.log(`Testing with code: ${testCode}`);
        
        try {
            const result = await dataHandlers.validateReferralCode(testCode);
            console.log('Validation result:', result);
        } catch (error) {
            console.error('Validation error:', error);
        }
    }
    
    console.log('✅ === DEBUG COMPLETE ===');
};
// Quick fix function for referral issues
window.fixReferralIssues = async () => {
    console.log('🔧 === QUICK FIX FOR REFERRAL ISSUES ===');
    
    const { auth, db } = firebaseServices.initialize();
    if (!auth || !db) {
        console.error('❌ Firebase not available');
        return;
    }
    
    try {
        // Step 1: Check if there are any users
        const usersSnapshot = await db.collection('users').limit(5).get();
        console.log(`📊 Found ${usersSnapshot.docs.length} users`);
        
        if (usersSnapshot.docs.length === 0) {
            console.log('❌ No users found. Please create some users first.');
            return;
        }
        
        // Step 2: Show available referral codes
        console.log('📋 Available referral codes for testing:');
        usersSnapshot.docs.forEach((doc, index) => {
            const userData = doc.data();
            if (userData.referralCode) {
                console.log(`  ${index + 1}. ${userData.name || 'Unknown'} - ${userData.referralCode}`);
            }
        });
        
        // Step 3: If on registration page, test with first available code
        const referralInput = document.getElementById('referralCode');
        if (referralInput && usersSnapshot.docs.length > 0) {
            const firstUser = usersSnapshot.docs[0].data();
            if (firstUser.referralCode) {
                console.log(`🧪 Testing referral code: ${firstUser.referralCode}`);
                
                // Set the code in input
                referralInput.value = firstUser.referralCode;
                
                // Trigger validation
                await dataHandlers.validateReferralCode(firstUser.referralCode);
                
                console.log('✅ Test completed! Check if referrer name is showing.');
            }
        }
        
        // Step 4: If user is logged in, check their referrals
        const currentUser = auth.currentUser;
        if (currentUser) {
            console.log('🔍 Checking user referrals...');
            const userReferralsSnapshot = await db.collection('referrals').where('referrerId', '==', currentUser.uid).get();
            console.log(`👤 User has ${userReferralsSnapshot.docs.length} referrals`);
            
            if (userReferralsSnapshot.docs.length > 0) {
                console.log('📋 Referral details:');
                for (const doc of userReferralsSnapshot.docs) {
                    const referralData = doc.data();
                    console.log(`  - Referred ID: ${referralData.referredId || referralData.userId}`);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Fix failed:', error);
    }
};
// Initialize App
function initializeApp() {
    const { auth, db } = firebaseServices.initialize();
    if (!auth || !db) {
        console.error('Firebase auth or database not initialized', { auth: !!auth, db: !!db });
        utils.showToast('Authentication unavailable', 'error');
        return;
    }

        console.log('🚀 Initializing application...');
        
        // Initialize referral code validation
        initializeReferralCodeValidation();

    // Handle authentication state changes
    auth.onAuthStateChanged(async user => {
        console.log('Auth state changed, user:', user ? user.uid : 'null');
        const authSection = document.getElementById('authSection');
        const dashboardContainer = document.getElementById('dashboardContainer');
        const messageBox = document.getElementById('message');

        if (!authSection || !dashboardContainer || !messageBox) {
            console.error('Missing UI elements:', {
                authSection: !!authSection,
                dashboardContainer: !!dashboardContainer,
                messageBox: !!messageBox
            });
            utils.showToast('UI initialization error', 'error');
                        return;
        }

        if (user) {
            state.currentUser = user;
            authSection.style.display = 'none';
            dashboardContainer.style.display = 'block';
            messageBox.style.display = 'none';
            console.log('User authenticated, initializing data for:', user.uid);
            
            // Attach realtime settings listeners now that user is active
            dataHandlers.setupRealtimeSettingsListeners();
            
            // Test storage connection
            await utils.testStorageConnection();
            
            await dataHandlers.initializeUserData();

            // Load wallet transactions initially
            try { await dataHandlers.loadWalletTransactions(); } catch(_) {}

            // Start payout scheduler only if enabled (guard to avoid 403 on locked rules)
            if (state.enableClientPayout) {
                try {
                    await dataHandlers.postDailyIncomeIfDue();
                } catch(_) {}
                if (state.payoutCheckIntervalId) clearInterval(state.payoutCheckIntervalId);
                state.payoutCheckIntervalId = setInterval(() => {
                    dataHandlers.postDailyIncomeIfDue();
                }, 60 * 1000);
            }

            // Initialize navigation after user data is loaded and DOM is ready
            setTimeout(() => {
                initializeNavigation();
            }, 100);
        } else {
            // Tear down realtime listeners on logout
            dataHandlers.teardownRealtimeSettingsListeners();
            if (state.payoutCheckIntervalId) {
                clearInterval(state.payoutCheckIntervalId);
                state.payoutCheckIntervalId = null;
            }

            state.currentUser = null;
            state.userData = {};
            authSection.style.display = 'block';
            dashboardContainer.style.display = 'none';
            console.log('No user authenticated, showing auth section');
            authHandlers.toggleForms('login');
        }
    });

    // Form event listeners
    const authForm = document.getElementById('authForm');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    const profileForm = document.getElementById('profileForm');
    const kycForm = document.getElementById('kycForm');
    const depositForm = document.getElementById('depositForm');
    const withdrawalForm = document.getElementById('withdrawalForm');
    const supportTicketForm = document.getElementById('supportTicketForm');
    const settingsForm = document.getElementById('settingsForm');
    const profilePicInput = document.getElementById('profilePicInput');
    const copyReferralBtn = document.getElementById('copyReferralBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (authForm) authForm.addEventListener('submit', authHandlers.handleAuth);
    else console.warn('authForm not found');
    if (forgotPasswordForm) forgotPasswordForm.addEventListener('submit', authHandlers.handleAuth);
    else console.warn('forgotPasswordForm not found');
    if (profileForm) profileForm.addEventListener('submit', dataHandlers.handleProfileUpdate);
    else console.warn('profileForm not found');
    if (kycForm) kycForm.addEventListener('submit', dataHandlers.handleKYCSubmission);
    else console.warn('kycForm not found');
    if (depositForm) depositForm.addEventListener('submit', dataHandlers.handleDeposit);
    else console.warn('depositForm not found');
    if (withdrawalForm) withdrawalForm.addEventListener('submit', dataHandlers.handleWithdrawal);
    else console.warn('withdrawalForm not found');
    if (supportTicketForm) supportTicketForm.addEventListener('submit', dataHandlers.handleSupportTicket);
    else console.warn('supportTicketForm not found');
    if (settingsForm) settingsForm.addEventListener('submit', dataHandlers.handleSettingsUpdate);
    else console.warn('settingsForm not found');
    if (profilePicInput) profilePicInput.addEventListener('change', dataHandlers.handleProfilePicUpload);
    else console.warn('profilePicInput not found');
    if (copyReferralBtn) copyReferralBtn.addEventListener('click', dataHandlers.copyReferralLink);
    else console.warn('copyReferralBtn not found');
    if (logoutBtn) logoutBtn.addEventListener('click', dataHandlers.handleLogout);
    else console.warn('logoutBtn not found');

    // Refresh referrals button
    const refreshReferralsBtn = document.getElementById('refreshReferralsBtn');
    if (refreshReferralsBtn) {
        refreshReferralsBtn.addEventListener('click', async () => {
            try {
                const { db } = firebaseServices.initialize();
                const referralsSnapshot = await firebaseServices.safeQuery(
                    db.collection('referrals').where('referrerId', '==', state.currentUser.uid)
                );
                await dataHandlers.loadReferrals(referralsSnapshot);
                utils.showToast('Referrals refreshed!', 'success');
            } catch (error) {
                console.error('Error refreshing referrals:', error);
                utils.showToast('Error refreshing referrals', 'error');
            }
        });
    } else console.warn('refreshReferralsBtn not found');

    // Referral search functionality
    const referralSearch = document.getElementById('referralSearch');
    if (referralSearch) {
        referralSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#referralsTableBody tr');
            
            rows.forEach(row => {
                const name = row.cells[0]?.textContent?.toLowerCase() || '';
                const email = row.cells[1]?.textContent?.toLowerCase() || '';
                const userId = row.cells[2]?.textContent?.toLowerCase() || '';
                
                if (name.includes(searchTerm) || email.includes(searchTerm) || userId.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    } else console.warn('referralSearch not found');

    // Clear all notifications button
    const clearAllNotificationsBtn = document.getElementById('clearAllNotificationsBtn');
    if (clearAllNotificationsBtn) {
        clearAllNotificationsBtn.addEventListener('click', async () => {
            try {
                const { db } = firebaseServices.initialize();
                const notificationsSnapshot = await firebaseServices.safeQuery(
                    db.collection('notifications').where('userId', '==', state.currentUser.uid)
                );
                
                const batch = db.batch();
                notificationsSnapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                
                await batch.commit();
                utils.showToast('All notifications cleared!', 'success');
                
                // Refresh notifications
                dataHandlers.loadNotifications();
            } catch (error) {
                console.error('Error clearing notifications:', error);
                utils.showToast('Error clearing notifications', 'error');
            }
        });
    } else console.warn('clearAllNotificationsBtn not found');

    // Notification search functionality
    const notificationSearch = document.getElementById('notificationSearch');
    if (notificationSearch) {
        notificationSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const notifications = document.querySelectorAll('#notificationsList .notification-item');
            
            notifications.forEach(notification => {
                const text = notification.textContent?.toLowerCase() || '';
                if (text.includes(searchTerm)) {
                    notification.style.display = '';
                } else {
                    notification.style.display = 'none';
                }
            });
        });
    } else console.warn('notificationSearch not found');

    // Deposit step navigation
    const nextStep2 = document.getElementById('nextStep2');
    const nextStep3 = document.getElementById('nextStep3');
    const backStep1 = document.getElementById('backStep1');
    const backStep2 = document.getElementById('backStep2');

    if (nextStep2) {
        nextStep2.addEventListener('click', () => {
            const step1 = document.getElementById('depositStep1');
            const step2 = document.getElementById('depositStep2');
            const method = document.getElementById('depositMethod')?.value;
            const amount = parseFloat(document.getElementById('depositAmount')?.value);

            if (!method || !amount || amount <= 0) {
                utils.showToast('Select a method and valid amount', 'error');
                return;
            }

            step1.classList.remove('active');
            step2.classList.add('active');
        });
    }

    if (nextStep3) {
        nextStep3.addEventListener('click', () => {
            const step2 = document.getElementById('depositStep2');
            const step3 = document.getElementById('depositStep3');
            step2.classList.remove('active');
            step3.classList.add('active');
        });
    }

    if (backStep1) {
        backStep1.addEventListener('click', () => {
            const step1 = document.getElementById('depositStep1');
            const step2 = document.getElementById('depositStep2');
            step2.classList.remove('active');
            step1.classList.add('active');
        });
    }

    if (backStep2) {
        backStep2.addEventListener('click', () => {
            const step2 = document.getElementById('depositStep2');
            const step3 = document.getElementById('depositStep3');
            step3.classList.remove('active');
            step2.classList.add('active');
        });
    }

    // Global function to update income withdrawal status
    window.updateIncomeWithdrawalStatus = function() {
        const statusElement = document.getElementById('incomeWithdrawalStatus');
        const statusText = document.getElementById('incomeStatusText');
        const currentDateElement = document.getElementById('currentDate');
        
        if (!statusElement || !statusText) return;
        
        const today = new Date();
        const dayOfMonth = today.getDate();
        const isAvailable = dayOfMonth === 14 || dayOfMonth === 28;
        
        // Update current date
        if (currentDateElement) {
            currentDateElement.textContent = today.toLocaleDateString();
        }
        
        if (isAvailable) {
            statusElement.style.background = 'rgba(34, 197, 94, 0.2)';
            statusElement.style.border = '1px solid var(--accent)';
            statusElement.style.color = 'var(--accent)';
            statusText.innerHTML = '<i class="fas fa-check-circle"></i> Income withdrawal is available today!';
        } else {
            const nextDate = dayOfMonth < 14 ? 14 : (dayOfMonth < 28 ? 28 : 14);
            const nextMonth = dayOfMonth < 14 ? today.getMonth() : (dayOfMonth < 28 ? today.getMonth() : today.getMonth() + 1);
            const nextDateObj = new Date(today.getFullYear(), nextMonth, nextDate);
            
            statusElement.style.background = 'rgba(239, 68, 68, 0.2)';
            statusElement.style.border = '1px solid var(--danger)';
            statusElement.style.color = 'var(--danger)';
            statusText.innerHTML = `<i class="fas fa-times-circle"></i> Next available: ${nextDateObj.toLocaleDateString()}`;
        }
    };

    // Global function to force refresh dashboard stats
    window.refreshDashboardStats = async function() {
        console.log('🔄 Forcing dashboard stats refresh...');
        
        // Check if user is logged in
        if (!state.currentUser || !state.currentUser.uid) {
            // Silently return if user not logged in (avoid noisy console/toast)
            return;
        }
        
        // Check if dataHandlers is available
        if (!dataHandlers) {
            console.warn('System not ready, please try again');
            return;
        }
        
        try {
            const { db } = firebaseServices.initialize();
            if (!db) {
                console.warn('Database not available');
                return;
            }
            
            // Force reload user data from database
            console.log('📊 Reloading user data from database...');
            const userDoc = await firebaseServices.safeGet(db.collection('users').doc(state.currentUser.uid));
            if (userDoc.exists) {
                state.userData = userDoc.data();
                console.log('✅ User data reloaded:', state.userData);
            } else {
                console.warn('User document not found');
                return;
            }
            
            // Calculate level income
            if (typeof dataHandlers.calculateLevelIncome === 'function') {
                await dataHandlers.calculateLevelIncome();
                console.log('✅ Level income calculated');
            } else {
                console.warn('⚠️ calculateLevelIncome function not available');
            }
            
            // Calculate ROI
            if (typeof dataHandlers.calculateROI === 'function') {
                await dataHandlers.calculateROI();
                console.log('✅ ROI calculated');
            } else {
                console.warn('⚠️ calculateROI function not available');
            }
            
            // Load real-time data
            console.log('📊 Loading real-time data...');
            
            // Load pending tickets count
            if (typeof dataHandlers.loadPendingTicketsCount === 'function') {
                const pendingCount = await dataHandlers.loadPendingTicketsCount();
                const pendingElement = document.getElementById('pendingTickets');
                if (pendingElement) {
                    pendingElement.textContent = pendingCount;
                    console.log('✅ Pending tickets updated:', pendingCount);
                }
            } else {
                console.warn('⚠️ loadPendingTicketsCount function not available');
            }
            
            // Load referral count
            if (typeof dataHandlers.loadRealTimeReferralCount === 'function') {
                const referralCount = await dataHandlers.loadRealTimeReferralCount();
                const referralElement = document.getElementById('totalReferrals');
                if (referralElement) {
                    referralElement.textContent = referralCount;
                    console.log('✅ Referral count updated:', referralCount);
                }
            } else {
                console.warn('⚠️ loadRealTimeReferralCount function not available');
            }
            
            // Update UI with fresh data
            if (typeof dataHandlers.loadUserData === 'function') {
                dataHandlers.loadUserData();
                console.log('✅ User data loaded to UI');
            } else {
                console.warn('⚠️ loadUserData function not available');
            }
            
            // Update new dashboard elements directly
            const today = new Date().toDateString();
            const todayIncome = utils.calculateTodayIncome(state.userData, today);
            
            // Update ROI Income card (Daily Returns): show today's ROI
            const roiElement = document.getElementById('roiIncome');
            if (roiElement) {
                const todayRoi = state.userData.todayROI || 0;
                roiElement.textContent = utils.formatCurrency(todayRoi);
                console.log('✅ ROI daily updated:', utils.formatCurrency(todayRoi));
            }

            // Update Level Income card (From Referrals): show today's level income
            const levelElement = document.getElementById('levelIncome');
            if (levelElement) {
                const todayLevel = state.userData.todayLevel || state.userData.todayLevelIncome || 0;
                levelElement.textContent = utils.formatCurrency(todayLevel);
                console.log('✅ Level daily updated:', utils.formatCurrency(todayLevel));
            }

            // Update Today's Income (Daily Total): today's ROI + today's Level
            const todayElement = document.getElementById('todayIncome');
            if (todayElement) {
                const todayTotal = (state.userData.todayROI || 0) + (state.userData.todayLevel || state.userData.todayLevelIncome || 0);
                todayElement.textContent = utils.formatCurrency(todayTotal);
                console.log('✅ Today\'s income updated (ROI+Level):', utils.formatCurrency(todayTotal));
            }
            
            // Update principal amount
            const principalElement = document.getElementById('principalAmount');
            if (principalElement) {
                principalElement.textContent = utils.formatCurrency(state.userData.totalDeposits || 0);
                console.log('✅ Principal amount updated:', utils.formatCurrency(state.userData.totalDeposits || 0));
            }
            
            // Update available income
            const withdrawableElement = document.getElementById('totalWithdrawable');
            if (withdrawableElement) {
                const availableIncome = (state.userData.selfIncome || 0) + (state.userData.levelIncome || 0) + 
                                       (state.userData.rewardIncome || 0) + (state.userData.roiIncome || 0);
                withdrawableElement.textContent = utils.formatCurrency(availableIncome);
                console.log('✅ Available income updated:', utils.formatCurrency(availableIncome));
            }
            
            // Also directly update dashboard elements
            if (typeof window.updateDashboardElements === 'function') {
                window.updateDashboardElements();
                console.log('✅ Dashboard elements directly updated');
            }
            
            console.log('🔄 Dashboard stats refresh completed');
        } catch (error) {
            console.error('Refresh dashboard stats error:', error);
        }
    };

    // Global debug function for dashboard stats
    window.debugDashboardStats = function() {
        console.log('🔍 Debugging Dashboard Stats...');
        console.log('Current user data:', state.userData);
        console.log('Current user:', state.currentUser);
        
        const elements = {
            totalIncome: document.getElementById('totalIncome'),
            totalIncomeCard: document.getElementById('totalIncomeCard'),
            pendingTickets: document.getElementById('pendingTickets'),
            levelIncome: document.getElementById('levelIncome'),
            totalReferrals: document.getElementById('totalReferrals')
        };
        
        console.log('Dashboard elements:', elements);
        
        if (dataHandlers) {
            console.log('Data handlers available:', Object.keys(dataHandlers));
        } else {
            console.log('Data handlers not available');
        }
        
        return {
            userData: state.userData,
            elements: elements,
            dataHandlers: !!dataHandlers
        };
    };
    // Global function to check authentication status
    window.checkAuthStatus = function() {
        console.log('🔐 Checking Authentication Status...');
        
        const authStatus = {
            isLoggedIn: !!state.currentUser,
            hasUID: !!(state.currentUser && state.currentUser.uid),
            hasUserData: !!state.userData,
            hasDataHandlers: !!dataHandlers,
            currentUser: state.currentUser,
            userData: state.userData
        };
        
        console.log('Authentication Status:', authStatus);
        
        if (!authStatus.isLoggedIn) {
            console.error('❌ User not logged in');
            utils.showToast('Please log in first', 'error');
        } else if (!authStatus.hasUID) {
            console.error('❌ User UID missing');
            utils.showToast('Authentication incomplete, please refresh and try again', 'error');
        } else if (!authStatus.hasDataHandlers) {
            console.error('❌ Data handlers not available');
            utils.showToast('System not ready, please refresh and try again', 'error');
        } else {
            console.log('✅ Authentication status OK');
        }
        
        return authStatus;
    };

    // Global function to directly update dashboard elements
    window.updateDashboardElements = function() {
        console.log('🎯 Directly updating dashboard elements...');
        
        if (!state.userData) {
            console.warn('⚠️ No user data available, setting default values');
            // Set default values even if no user data
            const elements = {
                totalIncome: document.getElementById('totalIncome'),
                totalIncomeCard: document.getElementById('totalIncomeCard'),
                pendingTickets: document.getElementById('pendingTickets'),
                levelIncome: document.getElementById('levelIncome'),
                totalReferrals: document.getElementById('totalReferrals'),
                userBalance: document.getElementById('userBalance'),
                totalDeposits: document.getElementById('totalDeposits')
            };
            
            // Set default values
            if (elements.totalIncome) elements.totalIncome.textContent = '$0.00';
            if (elements.totalIncomeCard) elements.totalIncomeCard.textContent = '$0.00';
            if (elements.levelIncome) elements.levelIncome.textContent = '$0.00';
            if (elements.userBalance) elements.userBalance.textContent = '$0.00';
            if (elements.totalDeposits) elements.totalDeposits.textContent = '$0.00';
            if (elements.pendingTickets) elements.pendingTickets.textContent = '0';
            if (elements.totalReferrals) elements.totalReferrals.textContent = '0';
            
            console.log('✅ Default values set for dashboard elements');
            return;
        }
        
        // Get all dashboard elements
        const elements = {
            totalIncome: document.getElementById('totalIncome'),
            totalIncomeCard: document.getElementById('totalIncomeCard'),
            pendingTickets: document.getElementById('pendingTickets'),
            levelIncome: document.getElementById('levelIncome'),
            totalReferrals: document.getElementById('totalReferrals'),
            userBalance: document.getElementById('userBalance'),
            totalDeposits: document.getElementById('totalDeposits')
        };
        
        // Calculate total income (dashboard requirement): ROI cumulative + Level cumulative
        const totalIncome = (state.userData.levelIncome || 0) + (state.userData.roiIncome || 0);
        
        // Update elements directly
        if (elements.totalIncome) {
            elements.totalIncome.textContent = utils.formatCurrency(totalIncome);
            console.log('✅ Total Income (ROI+Level) updated:', utils.formatCurrency(totalIncome));
        }
        
        if (elements.totalIncomeCard) {
            elements.totalIncomeCard.textContent = utils.formatCurrency(totalIncome);
            console.log('✅ Total Income Card (ROI+Level) updated:', utils.formatCurrency(totalIncome));
        }
        
        // Level Income card shows today's level income
        if (elements.levelIncome) {
            const todayLevel = state.userData.todayLevel || state.userData.todayLevelIncome || 0;
            elements.levelIncome.textContent = utils.formatCurrency(todayLevel);
            console.log('✅ Level Income (today) updated:', utils.formatCurrency(todayLevel));
        }
        
        if (elements.userBalance) {
            elements.userBalance.textContent = utils.formatCurrency(state.userData.balance || 0);
            console.log('✅ User Balance updated:', utils.formatCurrency(state.userData.balance || 0));
        }
        
        if (elements.totalDeposits) {
            elements.totalDeposits.textContent = utils.formatCurrency(state.userData.totalDeposits || 0);
            console.log('✅ Total Deposits updated:', utils.formatCurrency(state.userData.totalDeposits || 0));
        }

        // ROI Income card shows today's ROI
        const roiElement = document.getElementById('roiIncome');
        if (roiElement) {
            const todayRoi = state.userData.todayROI || 0;
            roiElement.textContent = utils.formatCurrency(todayRoi);
            console.log('✅ ROI Income (today) updated:', utils.formatCurrency(todayRoi));
        }

        // Today's Income = today's ROI + today's Level
        const todayElement = document.getElementById('todayIncome');
        if (todayElement) {
            const todayTotal = (state.userData.todayROI || 0) + (state.userData.todayLevel || state.userData.todayLevelIncome || 0);
            todayElement.textContent = utils.formatCurrency(todayTotal);
            console.log('✅ Today Total updated:', utils.formatCurrency(todayTotal));
        }
        
        // Set default values for elements that might not have data
        if (elements.pendingTickets && elements.pendingTickets.textContent === '') {
            elements.pendingTickets.textContent = '0';
            console.log('✅ Pending Tickets set to default: 0');
        }
        
        if (elements.totalReferrals && elements.totalReferrals.textContent === '') {
            elements.totalReferrals.textContent = state.userData.referrals || '0';
            console.log('✅ Total Referrals set to default:', state.userData.referrals || '0');
        }
        
        console.log('🎯 Dashboard elements update completed');
        console.log('📊 Current user data summary:', {
            balance: state.userData.balance || 0,
            selfIncome: state.userData.selfIncome || 0,
            levelIncome: state.userData.levelIncome || 0,
            rewardIncome: state.userData.rewardIncome || 0,
            roiIncome: state.userData.roiIncome || 0,
            totalDeposits: state.userData.totalDeposits || 0,
            referrals: state.userData.referrals || 0
        });
    };
    // Global function to check ROI status for current user
    window.checkROIStatus = async function() {
        console.log('🔍 Checking ROI status for current user...');
        
        if (!state.currentUser || !state.currentUser.uid) {
            console.error('❌ User not logged in');
            utils.showToast('Please log in to check ROI status', 'error');
            return;
        }
        
        try {
            const { db } = firebaseServices.initialize();
            if (!db) {
                console.error('❌ Database not available');
                return;
            }
            
            // Get user's ROI data
            const userDoc = await firebaseServices.safeGet(db.collection('users').doc(state.currentUser.uid));
            if (!userDoc.exists) {
                console.error('❌ User document not found');
                return;
            }
            
            const userData = userDoc.data();
            
            // Get admin ROI settings
            const adminSettingsDoc = await firebaseServices.safeGet(db.collection('adminSettings').doc('roi'));
            if (!adminSettingsDoc.exists) {
                console.error('❌ Admin ROI settings not found');
                return;
            }
            
            const roiSettings = adminSettingsDoc.data();
            
            // Get user's deposits
            const depositsSnapshot = await firebaseServices.safeQuery(
                db.collection('deposits').where('userId', '==', state.currentUser.uid).where('status', '==', 'approved')
            );
            
            // Get user's ROI income history
            const roiIncomeSnapshot = await firebaseServices.safeQuery(
                db.collection('income').where('userId', '==', state.currentUser.uid).where('type', '==', 'roi').orderBy('createdAt', 'desc').limit(10)
            );
            
            const totalDeposits = depositsSnapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
            const totalROIEarned = userData.roiIncome || 0;
            const lastROIDate = userData.lastROIDate ? new Date(userData.lastROIDate.toDate()) : null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const roiStatus = {
                userActive: userData.isActive || false,
                totalDeposits: totalDeposits,
                totalROIEarned: totalROIEarned,
                dailyROI: roiSettings.dailyROI || 0.01,
                maxROI: roiSettings.maxROI || 0.30,
                lastROIDate: lastROIDate,
                roiCalculatedToday: lastROIDate && lastROIDate >= today,
                depositsCount: depositsSnapshot.size,
                roiIncomeHistoryCount: roiIncomeSnapshot.size,
                recentROIIncome: roiIncomeSnapshot.docs.map(doc => ({
                    amount: doc.data().amount,
                    date: doc.data().createdAt?.toDate(),
                    description: doc.data().description
                }))
            };
            
            console.log('📊 ROI Status for current user:', roiStatus);
            
            // Show status message
            let statusMessage = `📊 ROI Status:\n\n`;
            statusMessage += `✅ Account Active: ${roiStatus.userActive ? 'Yes' : 'No'}\n`;
            statusMessage += `💰 Total Deposits: $${roiStatus.totalDeposits.toFixed(2)}\n`;
            statusMessage += `📈 Total ROI Earned: $${roiStatus.totalROIEarned.toFixed(2)}\n`;
            statusMessage += `📊 Daily ROI Rate: ${(roiStatus.dailyROI * 100).toFixed(4)}%\n`;
            statusMessage += `🎯 Max ROI: ${(roiStatus.maxROI * 100).toFixed(2)}%\n`;
            statusMessage += `📅 Last ROI Date: ${roiStatus.lastROIDate ? roiStatus.lastROIDate.toLocaleDateString() : 'Never'}\n`;
            statusMessage += `🔄 ROI Today: ${roiStatus.roiCalculatedToday ? 'Yes' : 'No'}\n`;
            statusMessage += `📋 Deposits: ${roiStatus.depositsCount}\n`;
            statusMessage += `📈 ROI History: ${roiStatus.roiIncomeHistoryCount} entries`;
            
            if (roiStatus.recentROIIncome.length > 0) {
                statusMessage += `\n\n📈 Recent ROI Income:\n`;
                roiStatus.recentROIIncome.slice(0, 5).forEach((income, index) => {
                    statusMessage += `${index + 1}. $${income.amount.toFixed(2)} - ${income.date ? income.date.toLocaleDateString() : 'Unknown Date'}\n`;
                });
            }
            
            console.log(statusMessage);
            utils.showToast('ROI status logged to console', 'info');
            
            return roiStatus;
            
        } catch (error) {
            console.error('❌ Error checking ROI status:', error);
            utils.showToast('Error checking ROI status', 'error');
        }
    };
    // Comprehensive User Income Test System
    window.testUserIncome = async function() {
        console.log('🧪 Starting Comprehensive User Income Test...');
        
        if (!state.currentUser || !state.currentUser.uid) {
            console.error('❌ User not logged in');
            utils.showToast('Please log in to run income test', 'error');
            return;
        }
        
        try {
            const { db } = firebaseServices.initialize();
            if (!db) {
                console.error('❌ Database not available');
                return;
            }
            
            console.log('📊 Loading user data and income history...');
            
            // Get user data
            const userDoc = await firebaseServices.safeGet(db.collection('users').doc(state.currentUser.uid));
            if (!userDoc.exists) {
                console.error('❌ User document not found');
                return;
            }
            
            const userData = userDoc.data();
            
            // Get all income history for last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const incomeSnapshot = await firebaseServices.safeQuery(
                db.collection('income')
                .where('userId', '==', state.currentUser.uid)
                .where('createdAt', '>=', thirtyDaysAgo)
                .orderBy('createdAt', 'desc')
            );
            
            // Get deposits
            const depositsSnapshot = await firebaseServices.safeQuery(
                db.collection('deposits')
                .where('userId', '==', state.currentUser.uid)
                .where('status', '==', 'approved')
            );
            
            // Get referrals
            const referralsSnapshot = await firebaseServices.safeQuery(
                db.collection('referrals')
                .where('referrerId', '==', state.currentUser.uid)
            );
            
            // Get team data for level analysis
            const teamData = await dataHandlers.getUserTeamData(state.currentUser.uid);
            
            // Analyze income by type
            const incomeByType = {
                roi: [],
                level: [],
                reward: [],
                self: []
            };
            
            let totalIncome = {
                roi: 0,
                level: 0,
                reward: 0,
                self: 0
            };
            
            incomeSnapshot.docs.forEach(doc => {
                const income = doc.data();
                const type = income.type || 'unknown';
                const amount = income.amount || 0;
                const date = income.createdAt?.toDate() || new Date();
                
                if (incomeByType[type]) {
                    incomeByType[type].push({
                        amount: amount,
                        date: date,
                        description: income.description || '',
                        level: income.level || null
                    });
                    totalIncome[type] += amount;
                }
            });
            
            // Generate comprehensive report
            let report = `\n🧪 COMPREHENSIVE USER INCOME TEST REPORT\n`;
            report += `==========================================\n\n`;
            
            // User Info
            report += `👤 USER INFORMATION:\n`;
            report += `Name: ${userData.name || 'N/A'}\n`;
            report += `Email: ${userData.email || 'N/A'}\n`;
            report += `User ID: ${userData.userId || state.currentUser.uid}\n`;
            report += `Account Status: ${userData.isActive ? 'Active' : 'Inactive'}\n`;
            report += `Join Date: ${userData.createdAt ? userData.createdAt.toDate().toLocaleDateString() : 'Unknown'}\n\n`;
            
            // Deposits Info
            report += `💰 DEPOSITS INFORMATION:\n`;
            report += `Total Approved Deposits: $${depositsSnapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0).toFixed(2)}\n`;
            report += `Number of Deposits: ${depositsSnapshot.size}\n`;
            depositsSnapshot.docs.forEach((doc, index) => {
                const deposit = doc.data();
                report += `${index + 1}. $${deposit.amount} - ${deposit.approvedAt ? deposit.approvedAt.toDate().toLocaleDateString() : 'Unknown Date'}\n`;
            });
            report += `\n`;
            
            // Referrals Info
            report += `👥 REFERRALS INFORMATION:\n`;
            report += `Total Referrals: ${referralsSnapshot.size}\n`;
            report += `Referral Code: ${userData.referralCode || 'N/A'}\n\n`;
            
            // Team Level Analysis
            report += `🏗️ TEAM LEVEL ANALYSIS:\n`;
            if (teamData && teamData.length > 0) {
                teamData.forEach((level, index) => {
                    const levelNumber = index + 1;
                    const activeUsers = level.filter(user => user.status === 'active').length;
                    const totalUsers = level.length;
                    const totalBusiness = level.reduce((sum, user) => sum + (user.selfDeposit || 0), 0);
                    
                    report += `Level ${levelNumber}: ${totalUsers} users (${activeUsers} active) - Business: $${totalBusiness.toFixed(2)}\n`;
                });
            } else {
                report += `No team data available\n`;
            }
            report += `\n`;
            
            // Income Analysis
            report += `📈 INCOME ANALYSIS (Last 30 Days):\n`;
            report += `ROI Income: $${totalIncome.roi.toFixed(2)} (${incomeByType.roi.length} entries)\n`;
            report += `Level Income: $${totalIncome.level.toFixed(2)} (${incomeByType.level.length} entries)\n`;
            report += `Reward Income: $${totalIncome.reward.toFixed(2)} (${incomeByType.reward.length} entries)\n`;
            report += `Self Income: $${totalIncome.self.toFixed(2)} (${incomeByType.self.length} entries)\n`;
            report += `TOTAL: $${(totalIncome.roi + totalIncome.level + totalIncome.reward + totalIncome.self).toFixed(2)}\n\n`;
            
            // Detailed Income Breakdown
            report += `📋 DETAILED INCOME BREAKDOWN:\n`;
            
            // ROI Income Details
            if (incomeByType.roi.length > 0) {
                report += `\n🔄 ROI Income Details:\n`;
                incomeByType.roi.forEach((income, index) => {
                    report += `${index + 1}. $${income.amount.toFixed(2)} - ${income.date.toLocaleDateString()} - ${income.description}\n`;
                });
            }
            
            // Level Income Details
            if (incomeByType.level.length > 0) {
                report += `\n🏗️ Level Income Details:\n`;
                incomeByType.level.forEach((income, index) => {
                    report += `${index + 1}. $${income.amount.toFixed(2)} - ${income.date.toLocaleDateString()} - Level ${income.level || 'N/A'} - ${income.description}\n`;
                });
            }
            
            // Reward Income Details
            if (incomeByType.reward.length > 0) {
                report += `\n🏆 Reward Income Details:\n`;
                incomeByType.reward.forEach((income, index) => {
                    report += `${index + 1}. $${income.amount.toFixed(2)} - ${income.date.toLocaleDateString()} - ${income.description}\n`;
                });
            }
            
            // Self Income Details
            if (incomeByType.self.length > 0) {
                report += `\n💎 Self Income Details:\n`;
                incomeByType.self.forEach((income, index) => {
                    report += `${index + 1}. $${income.amount.toFixed(2)} - ${income.date.toLocaleDateString()} - ${income.description}\n`;
                });
            }
            
            // Daily Income Summary
            report += `\n📅 DAILY INCOME SUMMARY (Last 7 Days):\n`;
            const last7Days = [];
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                date.setHours(0, 0, 0, 0);
                last7Days.push(date);
            }
            
            last7Days.forEach(date => {
                const dayIncome = {
                    roi: 0,
                    level: 0,
                    reward: 0,
                    self: 0
                };
                
                Object.keys(incomeByType).forEach(type => {
                    incomeByType[type].forEach(income => {
                        const incomeDate = new Date(income.date);
                        incomeDate.setHours(0, 0, 0, 0);
                        if (incomeDate.getTime() === date.getTime()) {
                            dayIncome[type] += income.amount;
                        }
                    });
                });
                
                const totalDayIncome = dayIncome.roi + dayIncome.level + dayIncome.reward + dayIncome.self;
                report += `${date.toLocaleDateString()}: $${totalDayIncome.toFixed(2)} (ROI: $${dayIncome.roi.toFixed(2)}, Level: $${dayIncome.level.toFixed(2)}, Reward: $${dayIncome.reward.toFixed(2)}, Self: $${dayIncome.self.toFixed(2)})\n`;
            });
            
            // Issues and Recommendations
            report += `\n🔍 ISSUES & RECOMMENDATIONS:\n`;
            
            if (totalIncome.roi === 0) {
                report += `⚠️ No ROI income found - Check if user is active and has deposits\n`;
            }
            
            if (totalIncome.level === 0) {
                report += `⚠️ No level income found - Check team structure and level settings\n`;
            }
            
            if (totalIncome.reward === 0) {
                report += `⚠️ No reward income found - Check reward settings\n`;
            }
            
            if (depositsSnapshot.size === 0) {
                report += `⚠️ No approved deposits found - User needs deposits to earn income\n`;
            }
            
            if (!userData.isActive) {
                report += `⚠️ User account is inactive - Need minimum $20 balance to be active\n`;
            }
            
            report += `\n✅ Test completed successfully!\n`;
            
            console.log(report);
            utils.showToast('Comprehensive income test completed! Check console for detailed report.', 'success');
            
            return {
                userData: userData,
                incomeByType: incomeByType,
                totalIncome: totalIncome,
                teamData: teamData,
                deposits: depositsSnapshot.docs,
                referrals: referralsSnapshot.docs
            };
            
        } catch (error) {
            console.error('❌ Error in comprehensive income test:', error);
            utils.showToast('Error running income test: ' + error.message, 'error');
        }
    };
    // Quick Level Income Check
    window.checkLevelIncome = async function() {
        console.log('🏗️ Checking Level Income Details...');
        
        if (!state.currentUser || !state.currentUser.uid) {
            console.error('❌ User not logged in');
            return;
        }
        
        try {
            const { db } = firebaseServices.initialize();
            if (!db) {
                console.error('❌ Database not available');
                return;
            }
            
            // Get team data
            const teamData = await dataHandlers.getUserTeamData(state.currentUser.uid);
            
            // Get level income settings
            const levelSettingsDoc = await firebaseServices.safeGet(db.collection('settings').doc('levelIncomeList'));
            const levelSettings = levelSettingsDoc.exists ? levelSettingsDoc.data().levels || [] : [];
            
            // Get level income history
            const levelIncomeSnapshot = await firebaseServices.safeQuery(
                db.collection('income')
                .where('userId', '==', state.currentUser.uid)
                .where('type', '==', 'level')
                .orderBy('createdAt', 'desc')
                .limit(20)
            );
            
            let report = `\n🏗️ LEVEL INCOME ANALYSIS\n`;
            report += `========================\n\n`;
            
            // Level Settings
            report += `📊 LEVEL SETTINGS:\n`;
            levelSettings.forEach((setting, index) => {
                const levelNumber = index + 1;
                report += `Level ${levelNumber}: ${setting.incomePercent}% income (${setting.blocked ? 'BLOCKED' : 'ACTIVE'})\n`;
            });
            report += `\n`;
            
            // Team Structure
            report += `👥 TEAM STRUCTURE:\n`;
            if (teamData && teamData.length > 0) {
                teamData.forEach((level, index) => {
                    const levelNumber = index + 1;
                    const activeUsers = level.filter(user => user.status === 'active').length;
                    const totalUsers = level.length;
                    const totalBusiness = level.reduce((sum, user) => sum + (user.selfDeposit || 0), 0);
                    const potentialIncome = totalBusiness * (levelSettings[index]?.incomePercent || 0) / 100;
                    
                    report += `Level ${levelNumber}: ${totalUsers} users (${activeUsers} active) - Business: $${totalBusiness.toFixed(2)} - Potential Income: $${potentialIncome.toFixed(2)}\n`;
                    
                    // Show users in this level
                    if (level.length > 0) {
                        level.forEach((user, userIndex) => {
                            report += `  ${userIndex + 1}. ${user.name || user.email} - $${user.selfDeposit || 0} (${user.status})\n`;
                        });
                    }
                    report += `\n`;
                });
            } else {
                report += `No team data available\n\n`;
            }
            
            // Level Income History
            report += `📈 LEVEL INCOME HISTORY:\n`;
            if (levelIncomeSnapshot.size > 0) {
                levelIncomeSnapshot.docs.forEach((doc, index) => {
                    const income = doc.data();
                    report += `${index + 1}. $${income.amount.toFixed(2)} - Level ${income.level || 'N/A'} - ${income.createdAt ? income.createdAt.toDate().toLocaleDateString() : 'Unknown Date'} - ${income.description || ''}\n`;
                });
            } else {
                report += `No level income history found\n`;
            }
            
            console.log(report);
            utils.showToast('Level income analysis completed! Check console for details.', 'info');
            
        } catch (error) {
            console.error('❌ Error checking level income:', error);
            utils.showToast('Error checking level income', 'error');
        }
    };

    // Fix Missing ROI Income - Manual Calculation for Missing Days
    window.fixMissingROI = async function() {
        console.log('🔧 Fixing Missing ROI Income...');
        
        if (!state.currentUser || !state.currentUser.uid) {
            console.error('❌ User not logged in');
            utils.showToast('Please log in to fix ROI', 'error');
            return;
        }
        
        try {
            const { db } = firebaseServices.initialize();
            if (!db) {
                console.error('❌ Database not available');
                return;
            }
            
            // Get user data
            const userDoc = await firebaseServices.safeGet(db.collection('users').doc(state.currentUser.uid));
            if (!userDoc.exists) {
                console.error('❌ User document not found');
                return;
            }
            
            const userData = userDoc.data();
            
            // Get admin ROI settings
            const adminSettingsDoc = await firebaseServices.safeGet(db.collection('adminSettings').doc('roi'));
            if (!adminSettingsDoc.exists) {
                console.error('❌ Admin ROI settings not found');
                return;
            }
            
            const roiSettings = adminSettingsDoc.data();
            const dailyROI = roiSettings.dailyROI || 0.01;
            const maxROI = roiSettings.maxROI || 0.30;
            
            // Get user's deposits
            const depositsSnapshot = await firebaseServices.safeQuery(
                db.collection('deposits')
                .where('userId', '==', state.currentUser.uid)
                .where('status', '==', 'approved')
            );
            
            if (depositsSnapshot.size === 0) {
                console.log('❌ No approved deposits found for user');
                utils.showToast('No approved deposits found', 'error');
                return;
            }
            
            // Get existing ROI income history
            const roiIncomeSnapshot = await firebaseServices.safeQuery(
                db.collection('income')
                .where('userId', '==', state.currentUser.uid)
                .where('type', '==', 'roi')
                .orderBy('createdAt', 'desc')
            );
            
            // Calculate missing days
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const lastROIDate = userData.lastROIDate ? new Date(userData.lastROIDate.toDate()) : null;
            const startDate = lastROIDate ? new Date(lastROIDate) : new Date();
            
            if (lastROIDate) {
                startDate.setDate(startDate.getDate() + 1); // Start from next day
            }
            
            // If no last ROI date, start from first deposit date
            if (!lastROIDate) {
                const firstDeposit = depositsSnapshot.docs[0].data();
                const firstDepositDate = firstDeposit.approvedAt?.toDate() || new Date();
                startDate.setTime(firstDepositDate.getTime());
                startDate.setDate(startDate.getDate() + 1); // Start from next day after first deposit
            }
            
            let totalFixed = 0;
            let totalAmount = 0;
            
            // Calculate ROI for each missing day
            for (let currentDate = new Date(startDate); currentDate <= today; currentDate.setDate(currentDate.getDate() + 1)) {
                const currentDateStr = currentDate.toDateString();
                
                // Check if ROI already exists for this date
                const existingROI = roiIncomeSnapshot.docs.find(doc => {
                    const incomeDate = doc.data().createdAt?.toDate();
                    if (incomeDate) {
                        const incomeDateStr = incomeDate.toDateString();
                        return incomeDateStr === currentDateStr;
                    }
                    return false;
                });
                
                if (existingROI) {
                    console.log(`✅ ROI already exists for ${currentDate.toLocaleDateString()}`);
                    continue;
                }
                
                // Calculate daily ROI for this date
                let dailyROIEarned = 0;
                
                depositsSnapshot.docs.forEach(doc => {
                    const deposit = doc.data();
                    const depositAmount = deposit.amount || 0;
                    const depositDate = deposit.approvedAt?.toDate() || new Date();
                    
                    // Check if deposit was approved before or on this date
                    if (depositDate <= currentDate) {
                        const daysSinceDeposit = Math.floor((currentDate.getTime() - depositDate.getTime()) / (1000 * 60 * 60 * 24));
                        const maxROIDays = Math.floor(maxROI / dailyROI);
                        const roiDays = Math.min(daysSinceDeposit, maxROIDays);
                        
                        // Calculate ROI for this specific day
                        const dailyROIAmount = depositAmount * dailyROI;
                        dailyROIEarned += dailyROIAmount;
                    }
                });
                
                if (dailyROIEarned > 0) {
                    // Add ROI income for this date
                    await db.collection('income').add({
                        userId: state.currentUser.uid,
                        type: 'roi',
                        amount: dailyROIEarned,
                        status: 'credited',
                        createdAt: firebase.firestore.Timestamp.fromDate(currentDate),
                        description: `Daily ROI Income - ${currentDate.toLocaleDateString()}`
                    });
                    
                    totalFixed++;
                    totalAmount += dailyROIEarned;
                    
                    console.log(`✅ Added ROI for ${currentDate.toLocaleDateString()}: $${dailyROIEarned.toFixed(2)}`);
                }
            }
            
            // Update user's last ROI date
            await db.collection('users').doc(state.currentUser.uid).update({
                lastROIDate: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Update user's total ROI income
            const totalROIEarned = roiIncomeSnapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0) + totalAmount;
            await db.collection('users').doc(state.currentUser.uid).update({
                roiIncome: totalROIEarned
            });
            
            let report = `\n🔧 ROI FIX COMPLETED\n`;
            report += `==================\n\n`;
            report += `✅ Days Fixed: ${totalFixed}\n`;
            report += `💰 Total Amount Added: $${totalAmount.toFixed(2)}\n`;
            report += `📅 From: ${startDate.toLocaleDateString()}\n`;
            report += `📅 To: ${today.toLocaleDateString()}\n`;
            report += `📊 Daily ROI Rate: ${(dailyROI * 100).toFixed(4)}%\n`;
            report += `🎯 Max ROI: ${(maxROI * 100).toFixed(2)}%\n\n`;
            
            if (totalFixed > 0) {
                report += `🎉 Missing ROI income has been fixed!\n`;
                report += `Please refresh your dashboard to see updated balance.\n`;
            } else {
                report += `ℹ️ No missing ROI found. All days are up to date.\n`;
            }
            
            console.log(report);
            utils.showToast(`ROI fix completed! ${totalFixed} days fixed, $${totalAmount.toFixed(2)} added.`, 'success');
            
            // Refresh dashboard stats
            await window.refreshDashboardStats();
            
        } catch (error) {
            console.error('❌ Error fixing ROI:', error);
            utils.showToast('Error fixing ROI: ' + error.message, 'error');
        }
    };
    // Check ROI Calculation Status
    window.checkROICalculationStatus = async function() {
        console.log('🔍 Checking ROI Calculation Status...');
        
        if (!state.currentUser || !state.currentUser.uid) {
            console.error('❌ User not logged in');
            return;
        }
        
        try {
            const { db } = firebaseServices.initialize();
            if (!db) {
                console.error('❌ Database not available');
                return;
            }
            
            // Get user data
            const userDoc = await firebaseServices.safeGet(db.collection('users').doc(state.currentUser.uid));
            if (!userDoc.exists) {
                console.error('❌ User document not found');
                return;
            }
            
            const userData = userDoc.data();
            
            // Get ROI income history for last 10 days
            const tenDaysAgo = new Date();
            tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
            
            const roiIncomeSnapshot = await firebaseServices.safeQuery(
                db.collection('income')
                .where('userId', '==', state.currentUser.uid)
                .where('type', '==', 'roi')
                .where('createdAt', '>=', tenDaysAgo)
                .orderBy('createdAt', 'desc')
            );
            
            // Get deposits
            const depositsSnapshot = await firebaseServices.safeQuery(
                db.collection('deposits')
                .where('userId', '==', state.currentUser.uid)
                .where('status', '==', 'approved')
            );
            
            let report = `\n🔍 ROI CALCULATION STATUS\n`;
            report += `========================\n\n`;
            
            // User Status
            report += `👤 USER STATUS:\n`;
            report += `Account Active: ${userData.isActive ? 'Yes' : 'No'}\n`;
            report += `Total Deposits: $${depositsSnapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0).toFixed(2)}\n`;
            report += `Last ROI Date: ${userData.lastROIDate ? userData.lastROIDate.toDate().toLocaleDateString() : 'Never'}\n\n`;
            
            // Recent ROI History
            report += `📈 RECENT ROI HISTORY (Last 10 Days):\n`;
            if (roiIncomeSnapshot.size > 0) {
                roiIncomeSnapshot.docs.forEach((doc, index) => {
                    const income = doc.data();
                    const date = income.createdAt?.toDate();
                    report += `${index + 1}. $${income.amount.toFixed(2)} - ${date ? date.toLocaleDateString() : 'Unknown Date'}\n`;
                });
            } else {
                report += `No ROI income found in last 10 days\n`;
            }
            
            // Missing Days Analysis
            report += `\n📅 MISSING DAYS ANALYSIS:\n`;
            const today = new Date();
            const lastROIDate = userData.lastROIDate ? new Date(userData.lastROIDate.toDate()) : null;
            
            if (lastROIDate) {
                const daysSinceLastROI = Math.floor((today.getTime() - lastROIDate.getTime()) / (1000 * 60 * 60 * 24));
                report += `Days since last ROI: ${daysSinceLastROI}\n`;
                
                if (daysSinceLastROI > 1) {
                    report += `⚠️ Missing ROI for ${daysSinceLastROI - 1} days\n`;
                    report += `💡 Use 'Fix Missing ROI' button to calculate missing income\n`;
                } else {
                    report += `✅ ROI is up to date\n`;
                }
            } else {
                report += `⚠️ No ROI history found\n`;
                report += `💡 Use 'Fix Missing ROI' button to calculate all missing income\n`;
            }
            
            // Admin Panel Status
            report += `\n🔧 ADMIN PANEL STATUS:\n`;
            report += `⚠️ IMPORTANT: Daily ROI calculations require admin panel to be open\n`;
            report += `📋 Admin panel must be running at 10 AM daily for automatic calculations\n`;
            report += `💡 If admin panel is not running, use manual fix buttons\n`;
            
            console.log(report);
            utils.showToast('ROI calculation status checked! Check console for details.', 'info');
            
        } catch (error) {
            console.error('❌ Error checking ROI calculation status:', error);
            utils.showToast('Error checking ROI status', 'error');
        }
    };
    // Withdrawal type and calculation listeners
    const withdrawalType = document.getElementById('withdrawalType');
    const withdrawalAmount = document.getElementById('withdrawalAmount');

    if (withdrawalType) {
        withdrawalType.addEventListener('change', () => {
            const typeDetails = document.getElementById('withdrawalTypeDetails');
            const typeInfo = document.getElementById('withdrawalTypeInfo');
            
            if (withdrawalType.value === 'principal') {
                const principalAmount = state.userData?.totalDeposits || 0;
                typeInfo.innerHTML = `Principal withdrawal allows you to withdraw your deposited funds anytime.<br><br>
                <strong>Available Principal:</strong> ${utils.formatCurrency(principalAmount)}<br>
                <strong>Minimum amount:</strong> $1<br>
                <strong>Processing fee:</strong> 15% if less than 6 months, 0% if 6+ months<br>
                <small style="color: var(--text); opacity: 0.8;">Note: Principal is your total deposits, not income</small>`;
            } else if (withdrawalType.value === 'income') {
                const today = new Date();
                const dayOfMonth = today.getDate();
                const isAvailable = dayOfMonth === 14 || dayOfMonth === 28;
                
                const totalIncome = (state.userData?.selfIncome || 0) + (state.userData?.levelIncome || 0) + 
                                  (state.userData?.rewardIncome || 0) + (state.userData?.roiIncome || 0);
                
                if (isAvailable) {
                    typeInfo.innerHTML = `Income withdrawal is available today!<br><br>
                    <strong>Available Income:</strong> ${utils.formatCurrency(totalIncome)}<br>
                    <strong>Minimum amount:</strong> $10<br>
                    <strong>Processing fee:</strong> 10%<br>
                    <small style="color: var(--text); opacity: 0.8;">Income includes: Self + Level + ROI + Rewards</small>`;
                } else {
                    const nextDate = dayOfMonth < 14 ? 14 : (dayOfMonth < 28 ? 28 : 14);
                    const nextMonth = dayOfMonth < 14 ? today.getMonth() : (dayOfMonth < 28 ? today.getMonth() : today.getMonth() + 1);
                    const nextDateObj = new Date(today.getFullYear(), nextMonth, nextDate);
                    typeInfo.innerHTML = `Income withdrawal is not available today.<br><br>
                    <strong>Next available date:</strong> ${nextDateObj.toLocaleDateString()}<br>
                    <strong>Available Income:</strong> ${utils.formatCurrency(totalIncome)}<br>
                    <strong>Minimum amount:</strong> $10<br>
                    <strong>Processing fee:</strong> 10%<br>
                    <small style="color: var(--text); opacity: 0.8;">Income includes: Self + Level + ROI + Rewards</small>`;
                }
            }
            typeDetails.style.display = 'block';
            
            // Update withdrawal amount validation when type changes
            const currentAmount = parseFloat(withdrawalAmount?.value || 0);
            if (currentAmount > 0) {
                // Trigger input event to recalculate
                withdrawalAmount.dispatchEvent(new Event('input'));
            }
        });
    }
    if (withdrawalAmount) {
        withdrawalAmount.addEventListener('input', () => {
            const calculation = document.getElementById('withdrawalCalculation');
            const requestedAmount = document.getElementById('requestedAmount');
            const processingFee = document.getElementById('processingFee');
            const netAmount = document.getElementById('netAmount');
            
            // Check if all required elements exist
            if (!calculation || !requestedAmount || !processingFee || !netAmount) {
                return; // Silently return if elements not found
            }
            
            const amount = parseFloat(withdrawalAmount.value) || 0;
            const withdrawalType = document.getElementById('withdrawalType')?.value;
            
            let fee = 0;
            let feeText = 'Processing Fee';
            let availableBalance = 0;
            
            if (withdrawalType === 'income') {
                fee = amount * 0.10;
                feeText = 'Processing Fee (10%)';
                availableBalance = (state.userData?.selfIncome || 0) + (state.userData?.levelIncome || 0) + 
                                 (state.userData?.rewardIncome || 0) + (state.userData?.roiIncome || 0);
            } else if (withdrawalType === 'principal') {
                // For principal, we'll show 15% as default (less than 6 months)
                fee = amount * 0.15;
                feeText = 'Processing Fee (15% - if less than 6 months)';
                availableBalance = state.userData?.totalDeposits || 0;
            }
            
            const net = amount - fee;
            
            // Validate amount against available balance
            if (amount > availableBalance) {
                withdrawalAmount.style.borderColor = 'var(--danger)';
                withdrawalAmount.style.boxShadow = '0 0 10px var(--danger)';
                
                // Show error message below the input
                let errorElement = document.getElementById('withdrawalAmountError');
                if (!errorElement) {
                    errorElement = document.createElement('div');
                    errorElement.id = 'withdrawalAmountError';
                    errorElement.style.color = 'var(--danger)';
                    errorElement.style.fontSize = '12px';
                    errorElement.style.marginTop = '5px';
                    withdrawalAmount.parentNode.appendChild(errorElement);
                }
                
                if (withdrawalType === 'income') {
                    errorElement.innerHTML = `Amount exceeds available income balance (${utils.formatCurrency(availableBalance)})<br>
                    <small style="color: var(--text); opacity: 0.8;">Available: Self: ${utils.formatCurrency(state.userData?.selfIncome || 0)} | Level: ${utils.formatCurrency(state.userData?.levelIncome || 0)} | ROI: ${utils.formatCurrency(state.userData?.roiIncome || 0)} | Rewards: ${utils.formatCurrency(state.userData?.rewardIncome || 0)}</small>`;
                } else {
                    errorElement.innerHTML = `Amount exceeds available principal balance (${utils.formatCurrency(availableBalance)})<br>
                    <small style="color: var(--text); opacity: 0.8;">Principal is your total deposits, not income</small>`;
                }
                errorElement.style.display = 'block';
            } else {
                withdrawalAmount.style.borderColor = '';
                withdrawalAmount.style.boxShadow = '';
                
                // Hide error message
                const errorElement = document.getElementById('withdrawalAmountError');
                if (errorElement) {
                    errorElement.style.display = 'none';
                }
            }
            
            requestedAmount.textContent = utils.formatCurrency(amount);
            processingFee.textContent = utils.formatCurrency(fee);
            netAmount.textContent = utils.formatCurrency(net);
            
            // Update fee text
            const feeElement = document.querySelector('#withdrawalCalculation p:nth-child(2)');
            if (feeElement) {
                feeElement.innerHTML = `${feeText}: <span id="processingFee">${utils.formatCurrency(fee)}</span>`;
            }
            
            if (amount > 0) {
                calculation.style.display = 'block';
                
                // Show available balance information
                let balanceInfo = document.getElementById('withdrawalBalanceInfo');
                if (!balanceInfo) {
                    balanceInfo = document.createElement('div');
                    balanceInfo.id = 'withdrawalBalanceInfo';
                    balanceInfo.style.marginTop = '10px';
                    balanceInfo.style.padding = '10px';
                    balanceInfo.style.background = 'rgba(0, 210, 255, 0.1)';
                    balanceInfo.style.borderRadius = '8px';
                    balanceInfo.style.borderLeft = '4px solid var(--accent)';
                    calculation.parentNode.insertBefore(balanceInfo, calculation.nextSibling);
                }
                
                if (withdrawalType === 'income') {
                    balanceInfo.innerHTML = `
                        <p style="margin: 0; color: var(--accent); font-size: 14px;">
                            <strong>Available Income:</strong> ${utils.formatCurrency(availableBalance)}<br>
                            <small style="color: var(--text); opacity: 0.8;">Self: ${utils.formatCurrency(state.userData?.selfIncome || 0)} | Level: ${utils.formatCurrency(state.userData?.levelIncome || 0)} | ROI: ${utils.formatCurrency(state.userData?.roiIncome || 0)} | Rewards: ${utils.formatCurrency(state.userData?.rewardIncome || 0)}</small>
                        </p>
                    `;
                } else if (withdrawalType === 'principal') {
                    balanceInfo.innerHTML = `
                        <p style="margin: 0; color: var(--accent); font-size: 14px;">
                            <strong>Available Principal:</strong> ${utils.formatCurrency(availableBalance)}<br>
                            <small style="color: var(--text); opacity: 0.8;">Total deposits made to your account (not income)</small>
                        </p>
                    `;
                }
                balanceInfo.style.display = 'block';
            } else {
                calculation.style.display = 'none';
                
                // Hide balance info
                const balanceInfo = document.getElementById('withdrawalBalanceInfo');
                if (balanceInfo) {
                    balanceInfo.style.display = 'none';
                }
            }
        });
    }

    // Auth toggle buttons
    const authToggle = document.getElementById('authToggle');
    const forgotPasswordToggle = document.getElementById('forgotPasswordToggle');
    if (authToggle) {
        authToggle.addEventListener('click', () => {
            const currentMode = document.getElementById('authTitle')?.textContent.toLowerCase();
            authHandlers.toggleForms(currentMode === 'login' ? 'register' : 'login');
        });
    } else {
        // Silently handle missing auth toggle
    }
    if (forgotPasswordToggle) {
        forgotPasswordToggle.addEventListener('click', () => authHandlers.toggleForms('forgot'));
    } else {
        // Silently handle missing forgot password toggle
    }
    // Theme toggle and theme selector
    const themeToggle = document.getElementById('themeToggle');
    const themeSelector = document.getElementById('themeSelector');
    const themeButtons = document.querySelectorAll('.theme-btn');

    if (themeToggle && themeSelector) {
        // Theme toggle button click handler
        themeToggle.addEventListener('click', () => {
            themeSelector.style.display = themeSelector.style.display === 'flex' ? 'none' : 'flex';
            console.log('Theme selector toggled:', themeSelector.style.display);
        });

        // Theme button click handlers
        themeButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const theme = button.getAttribute('data-theme');
                if (!theme) {
                    console.warn('No theme attribute found on button');
                    return;
                }

                console.log('Theme button clicked:', theme);
                
                // Update UI immediately
                document.body.className = ''; // Reset classes
                document.body.classList.add(theme);
                localStorage.setItem('theme', theme);
                themeSelector.style.display = 'none';

                // Update database if user is logged in
                if (state.currentUser) {
                    const { db } = firebaseServices.initialize();
                    if (db) {
                        try {
                            await db.collection('userSettings').doc(state.currentUser.uid).update({
                                theme: theme,
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            });
                            console.log('Theme updated in database:', theme);
                        } catch (error) {
                            console.error('Error updating theme in database:', error.message);
                            utils.showToast('Theme updated locally but failed to save to database', 'warning');
                        }
                    }
                }

                utils.showToast(`Theme changed to ${theme.replace('theme-', '')}`, 'success');
            });
        });

        // Load saved theme on page load
        const savedTheme = localStorage.getItem('theme') || 'theme-blue';
        document.body.className = '';
        document.body.classList.add(savedTheme);
        console.log('Loaded saved theme:', savedTheme);
    } else {
        // Silently handle missing theme elements
    }
}
function initializeNavigation() {
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const sections = document.querySelectorAll('.section');
    const sidebar = document.getElementById('sidebar');
    const hamburger = document.getElementById('hamburger');
    const closeBtn = document.getElementById('closeSidebar');

    // Log found elements for debugging (only in debug mode)
    if (localStorage.getItem('debug') === 'true') {
    console.log('Navigation elements found:', {
        sidebarLinks: sidebarLinks.length,
        sections: sections.length,
        sidebar: !!sidebar,
        hamburger: !!hamburger,
        closeBtn: !!closeBtn
    });
    }

    // Check for critical elements
    if (!sidebarLinks.length || !sections.length || !sidebar) {
        const missingElements = [];
        if (!sidebarLinks.length) missingElements.push('sidebar links (.sidebar-link)');
        if (!sections.length) missingElements.push('sections (.section)');
        if (!sidebar) missingElements.push('sidebar (#sidebar)');
        console.error(`Critical navigation elements missing: ${missingElements.join(', ')}`);
        utils.showToast(`Navigation error: Missing ${missingElements.join(', ')}`, 'error');
        return;
    }

    // Warn about non-critical missing elements (only in debug mode)
    if (localStorage.getItem('debug') === 'true') {
        if (!hamburger) {
            // Silently handle missing hamburger menu
        }
        if (!closeBtn) {
            // Silently handle missing close button
        }
    }

    // Function to show a specific section
    function showSection(sectionId) {
        // Destroy charts before switching sections to prevent conflicts
        if (window.dataHandlers && typeof window.dataHandlers.destroyAllCharts === 'function') {
            try {
                dataHandlers.destroyAllCharts();
            } catch (error) {
                console.warn('Error destroying charts:', error);
            }
        }
        
        if (localStorage.getItem('debug') === 'true') {
        console.log('Attempting to show section:', sectionId);
        }
        const targetSection = document.getElementById(sectionId);
        if (!targetSection) {
            console.error(`Section not found: ${sectionId}`);
            utils.showToast(`Section ${sectionId} not found`, 'error');
            return;
        }

        if (localStorage.getItem('debug') === 'true') {
        console.log('Found target section:', targetSection);
        console.log('Total sections found:', sections.length);
        }
        sections.forEach((section, index) => {
            const isTarget = section.id === sectionId;
            section.style.display = isTarget ? 'block' : 'none';
            section.classList.toggle('active', isTarget);
            if (localStorage.getItem('debug') === 'true') {
            console.log(`Section ${index}: ${section.id} - display: ${section.style.display}, active: ${section.classList.contains('active')}`);
            }
        });

        sidebarLinks.forEach(link => {
            const shouldBeActive = link.id === sectionId.replace('Section', 'Link');
            link.classList.toggle('active', shouldBeActive);
            if (localStorage.getItem('debug') === 'true') {
            console.log(`Link ${link.id}: active = ${shouldBeActive}`);
            }
        });

        // Close sidebar on mobile
        if (window.innerWidth <= 768 && sidebar) {
            sidebar.classList.remove('active');
            if (closeBtn) {
                closeBtn.style.display = 'none';
            }
            if (localStorage.getItem('debug') === 'true') {
            console.log('Sidebar closed on mobile');
            }
        }
        
        // Update income withdrawal status when withdrawal section is shown
        if (sectionId === 'withdrawalSection') {
            setTimeout(() => {
                updateIncomeWithdrawalStatus();
            }, 100);
        }
        
        // Also update status when dashboard is shown (in case withdrawal section is visible)
        if (sectionId === 'dashboardSection') {
            setTimeout(() => {
                updateIncomeWithdrawalStatus();
                // Also refresh dashboard stats
                if (window.refreshDashboardStats) {
                    window.refreshDashboardStats();
                }
                // Also directly update dashboard elements
                if (window.updateDashboardElements) {
                    window.updateDashboardElements();
                }
            }, 100);
        }
        
        // Update income withdrawal status on app initialization
        if (sectionId === 'dashboardSection' && !window.incomeStatusInitialized) {
            window.incomeStatusInitialized = true;
            setTimeout(() => {
                updateIncomeWithdrawalStatus();
                // Also refresh dashboard stats on first load
                if (window.refreshDashboardStats) {
                    window.refreshDashboardStats();
                }
            }, 500);
        }
        
        // Load wallet transactions when wallet section is shown
        if (sectionId === 'walletSection') {
            setTimeout(async () => {
                await dataHandlers.loadWalletTransactions();
            }, 100);
        }
        
        if (localStorage.getItem('debug') === 'true') {
        console.log(`Successfully switched to section: ${sectionId}`);
        }
    }

    // Add click event listeners to sidebar links
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Skip logout button - it has its own handler
            if (link.id === 'logoutBtn') {
                return;
            }
            
            // Map link IDs to section IDs
            const linkToSectionMap = {
                'dashboardLink': 'dashboardSection',
                'profileLink': 'profileSection',
                'kycLink': 'kycSection',
                'depositLink': 'depositSection',
                'withdrawalLink': 'withdrawalSection',
                'referralsLink': 'referralsSection',
                'incomeLink': 'incomeSection',
                'walletLink': 'walletSection',
                'supportLink': 'supportSection',
                'notificationsLink': 'notificationsSection',
                'analyticsLink': 'analyticsSection',
                'settingsLink': 'settingsSection'
            };
            
            const sectionId = linkToSectionMap[link.id];
            if (!sectionId) {
                console.warn('No section mapping for link:', link.id);
                utils.showToast('Invalid navigation link', 'error');
                return;
            }
            if (localStorage.getItem('debug') === 'true') {
            console.log('Navigation link clicked:', sectionId);
            }
            showSection(sectionId);
            
            // Refresh referrals when referrals section is accessed
            if (sectionId === 'referralsSection') {
                console.log('Refreshing referrals data...');
                setTimeout(async () => {
                    try {
                        const { db } = firebaseServices.initialize();
                        const referralsSnapshot = await firebaseServices.safeQuery(
                            db.collection('referrals').where('referrerId', '==', state.currentUser.uid)
                        );
                        await dataHandlers.loadReferrals(referralsSnapshot);
                    } catch (error) {
                        console.error('Error refreshing referrals:', error);
                    }
                }, 100);
            }

            // Load analytics when analytics section is accessed
            if (sectionId === 'analyticsSection') {
                console.log('Loading analytics data...');
                setTimeout(async () => {
                    try {
                        await dataHandlers.loadAnalytics();
                    } catch (error) {
                        console.error('Error loading analytics:', error);
                    }
                }, 100);
            }
        });
    });

    // Mobile menu functionality
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileMenuClose = document.getElementById('mobileMenuClose');

    if (mobileMenuToggle && mobileMenu && mobileMenuClose) {
        mobileMenuToggle.addEventListener('click', () => {
            mobileMenu.classList.add('active');
            mobileMenuToggle.style.display = 'none';
        });

        mobileMenuClose.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
            mobileMenuToggle.style.display = 'block';
        });

        // Mobile menu navigation
        const mobileMenuLinks = mobileMenu.querySelectorAll('a[data-section]');
        mobileMenuLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const sectionId = link.getAttribute('data-section');
                showSection(sectionId);
                mobileMenu.classList.remove('active');
                mobileMenuToggle.style.display = 'block';
            });
        });

        // Close mobile menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!mobileMenu.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
                mobileMenu.classList.remove('active');
                mobileMenuToggle.style.display = 'block';
            }
        });
    }

    // Hamburger menu toggle (desktop)
    if (hamburger) {
        hamburger.addEventListener('click', () => {
            if (sidebar) {
                sidebar.classList.toggle('active');
                if (localStorage.getItem('debug') === 'true') {
                console.log('Hamburger clicked, sidebar active:', sidebar.classList.contains('active'));
            }
                
                // Show/hide close button on mobile
                if (closeBtn) {
                    closeBtn.style.display = sidebar.classList.contains('active') ? 'flex' : 'none';
                }
            } else {
                console.error('Cannot toggle sidebar; #sidebar not found');
                utils.showToast('Sidebar not found', 'error');
            }
        });
    }

    // Close sidebar button
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (sidebar) {
                sidebar.classList.remove('active');
                closeBtn.style.display = 'none';
                if (localStorage.getItem('debug') === 'true') {
                console.log('Close sidebar clicked');
                }
            }
        });
    }

    // Show/hide mobile menu toggle based on screen size
    const handleResize = () => {
        if (window.innerWidth <= 768) {
            if (mobileMenuToggle) mobileMenuToggle.style.display = 'block';
            if (hamburger) hamburger.style.display = 'none';
            if (closeBtn) closeBtn.style.display = 'none';
        } else {
            if (mobileMenuToggle) mobileMenuToggle.style.display = 'none';
            if (hamburger) hamburger.style.display = 'block';
            if (closeBtn) closeBtn.style.display = 'none';
        }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Show default section
    const defaultSectionId = 'dashboardSection';
    const defaultSection = document.getElementById(defaultSectionId);
    if (defaultSection) {
        showSection(defaultSectionId);
        if (localStorage.getItem('debug') === 'true') {
        console.log(`Default section shown: ${defaultSectionId}`);
        }
    } else {
        // Silently handle missing default section and fallback to first available section
        if (sections.length > 0) {
            const firstSectionId = sections[0].id;
            showSection(firstSectionId);
            if (localStorage.getItem('debug') === 'true') {
            console.log(`Falling back to first section: ${firstSectionId}`);
            }
        }
    }
    // Handle window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && sidebar) {
            sidebar.classList.remove('active');
            if (closeBtn) {
                closeBtn.style.display = 'none';
            }
            if (localStorage.getItem('debug') === 'true') {
            console.log('Sidebar hidden on resize (desktop view)');
            }
        }
    });

    // Wallet refresh & search, date filters, load more, export
    const refreshWalletBtn = document.getElementById('refreshWalletBtn');
    if (refreshWalletBtn) {
        refreshWalletBtn.addEventListener('click', async () => {
            await dataHandlers.loadWalletTransactions({ reset: true });
            utils.showToast('Wallet refreshed', 'success');
        });
    }
    const walletSearch = document.getElementById('walletSearch');
    if (walletSearch) {
        walletSearch.addEventListener('input', async () => {
            await dataHandlers.loadWalletTransactions({ reset: true });
        });
    }
    const fromEl = document.getElementById('walletFromDate');
    const toEl = document.getElementById('walletToDate');
    if (fromEl) fromEl.addEventListener('change', async () => { await dataHandlers.loadWalletTransactions({ reset: true }); });
    if (toEl) toEl.addEventListener('change', async () => { await dataHandlers.loadWalletTransactions({ reset: true }); });

    const loadMoreBtn = document.getElementById('loadMoreWalletBtn');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', async () => { await dataHandlers.loadWalletTransactions({ reset: false }); });

    const exportBtn = document.getElementById('exportWalletBtn');
    if (exportBtn) exportBtn.addEventListener('click', () => dataHandlers.exportWalletCSV());

    if (localStorage.getItem('debug') === 'true') {
    console.log('Navigation initialized successfully');
    console.log('Available sections:', Array.from(sections).map(s => s.id));
    console.log('Available links:', Array.from(sidebarLinks).map(l => l.id));
    }
}

// Run initialization when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('debug') === 'true') {
    console.log('DOM loaded, initializing app');
    }
    initializeApp();
    
    // Fallback navigation initialization for already authenticated users
    setTimeout(() => {
        const dashboardContainer = document.getElementById('dashboardContainer');
        if (dashboardContainer && dashboardContainer.style.display !== 'none') {
            if (localStorage.getItem('debug') === 'true') {
            console.log('User appears to be authenticated, initializing navigation');
            }
            initializeNavigation();
        }
    }, 500);
});

// Export for testing or module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        state,
        utils,
        firebaseServices,
        authHandlers,
        dataHandlers,
        initializeApp
    };
}

// Debug function for testing navigation
window.testNavigation = function(sectionId) {
    console.log('Testing navigation to:', sectionId);
    const sections = document.querySelectorAll('.section');
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    
    console.log('Available sections:', Array.from(sections).map(s => s.id));
    console.log('Available links:', Array.from(sidebarLinks).map(l => l.id));
    
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        sections.forEach(section => {
            section.style.display = section.id === sectionId ? 'block' : 'none';
            section.classList.toggle('active', section.id === sectionId);
        });
        console.log('Navigation test successful');
    } else {
        console.error('Section not found:', sectionId);
    }
};

// Debug function for testing theme selector
window.testThemeSelector = function() {
    console.log('Testing theme selector...');
    const themeToggle = document.getElementById('themeToggle');
    const themeSelector = document.getElementById('themeSelector');
    const themeButtons = document.querySelectorAll('.theme-btn');
    
    console.log('Theme elements found:', {
        themeToggle: !!themeToggle,
        themeSelector: !!themeSelector,
        themeButtons: themeButtons.length
    });
    
    if (themeToggle && themeSelector) {
        console.log('Theme selector is working');
        themeSelector.style.display = 'flex';
        setTimeout(() => {
            themeSelector.style.display = 'none';
            console.log('Theme selector test completed');
        }, 2000);
    } else {
        console.error('Theme selector elements not found');
    }
};
// Debug function for testing referral link
window.testReferralLink = function(referralCode = 'TEST123') {
    console.log('Testing referral link with code:', referralCode);
    
    // Simulate referral link
    const testUrl = `${window.location.origin}/index.html?ref=${referralCode}`;
    console.log('Test URL:', testUrl);
    
    // Store referral code in localStorage
    localStorage.setItem('referralCode', referralCode);
    
    // Show test message
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #22c55e, #16a34a);
        color: white;
        padding: 15px;
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 250px;
    `;
    
    messageDiv.innerHTML = `
        <h4 style="margin: 0 0 10px 0; font-size: 16px;">
            <i class="fas fa-link"></i> Referral Test
        </h4>
        <p style="margin: 0; font-size: 12px;">
            Referral code: <strong>${referralCode}</strong><br>
            Stored in localStorage
        </p>
    `;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
        }
    }, 3000);
    
    console.log('Referral link test completed');
};

// Debug function for checking referral data
window.checkReferralData = async function() {
    console.log('=== CHECKING REFERRAL DATA ===');
    return await utils.checkReferralData();
};

// Debug function for fixing referral data
window.fixReferralData = async function() {
    console.log('=== FIXING REFERRAL DATA ===');
    return await utils.fixReferralData();
};

// Debug function for registration process
window.debugRegistrationProcess = async function() {
    console.log('=== DEBUGGING REGISTRATION PROCESS ===');
    return await utils.debugRegistrationProcess();
};

// Test registration function
window.testRegistration = async function() {
    console.log('=== TESTING REGISTRATION ===');
    return await utils.testRegistration();
};

// Show team levels
window.showTeamLevels = async function() {
    console.log('🚀 === SHOWING TEAM LEVELS ===');
    try {
        if (dataHandlers && typeof dataHandlers.showTeamLevels === 'function') {
            return await dataHandlers.showTeamLevels();
        } else {
            console.error('❌ showTeamLevels function not available');
            utils.showToast('Team levels feature not available', 'error');
            return false;
        }
    } catch (error) {
        console.error('❌ Error in global showTeamLevels:', error);
        utils.showToast('Error loading team levels', 'error');
        return false;
    }
};

// Load real-time referral count
window.loadRealTimeReferralCount = async function() {
    console.log('=== LOADING REAL-TIME REFERRAL COUNT ===');
    if (dataHandlers && typeof dataHandlers.loadRealTimeReferralCount === 'function') {
        return await dataHandlers.loadRealTimeReferralCount();
        } else {
        console.error('❌ loadRealTimeReferralCount function not available');
        return 0;
    }
};

// Destroy all charts to fix conflicts
window.destroyAllCharts = function() {
    console.log('=== DESTROYING ALL CHARTS ===');
    if (dataHandlers && typeof dataHandlers.destroyAllCharts === 'function') {
        return dataHandlers.destroyAllCharts();
    } else {
        console.warn('dataHandlers.destroyAllCharts function not available');
        return false;
    }
};

// Global error handler for missing functions
window.handleMissingFunction = function(functionName, fallback) {
    console.warn(`Function ${functionName} not available, using fallback`);
    return fallback;
};

// Comprehensive registration debugging
window.debugRegistrationIssues = async function() {
    console.log('=== DEBUGGING REGISTRATION ISSUES ===');
    return await utils.debugRegistrationIssues();
};

// Fix missing referral data
window.fixMissingReferralData = async function() {
    console.log('=== FIXING MISSING REFERRAL DATA ===');
    return await utils.fixMissingReferralData();
};

// Debug function for testing registration
window.testRegistration = async function() {
    console.log('Testing registration process...');
    
    const { auth, db } = firebaseServices.initialize();
    if (!auth || !db) {
        console.error('Firebase not initialized');
        return;
    }
    
    try {
        // Test Firebase connection
        console.log('Testing Firebase connection...');
        const testDoc = await db.collection('test').doc('connection').get();
        console.log('Firebase connection test:', testDoc.exists ? 'SUCCESS' : 'SUCCESS (doc not exists)');
        
        // Test authentication
        console.log('Testing authentication...');
        const currentUser = auth.currentUser;
        console.log('Current user:', currentUser ? currentUser.uid : 'None');
        
        // Test user creation (if not authenticated)
        if (!currentUser) {
            console.log('No user authenticated, testing user creation...');
            const testEmail = `test${Date.now()}@example.com`;
            const testPassword = 'TestPassword123!';
            
            try {
                const userCredential = await auth.createUserWithEmailAndPassword(testEmail, testPassword);
                console.log('Test user created:', userCredential.user.uid);
                
                // Test document creation
                await db.collection('users').doc(userCredential.user.uid).set({
                    name: 'Test User',
                    email: testEmail,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log('Test user document created');
                
                // Clean up - delete test user
                await userCredential.user.delete();
                console.log('Test user cleaned up');
                
            } catch (createError) {
                console.error('Test user creation failed:', createError.message);
            }
        }
        
    } catch (error) {
        console.error('Registration test failed:', error.message);
    }
};
// Simple registration test
window.simpleRegistrationTest = async function() {
    console.log('=== SIMPLE REGISTRATION TEST ===');
    
    try {
        // Step 1: Check Firebase
        if (typeof firebase === 'undefined') {
            console.error('❌ Firebase not loaded');
            return;
        }
        console.log('✅ Firebase loaded');
        
        // Step 2: Check Firebase Auth
        if (!firebase.auth) {
            console.error('❌ Firebase Auth not available');
            return;
        }
        console.log('✅ Firebase Auth available');
        
        // Step 3: Check Firestore
        if (!firebase.firestore) {
            console.error('❌ Firestore not available');
            return;
        }
        console.log('✅ Firestore available');
        
        // Step 4: Test simple write
        const db = firebase.firestore();
        const testRef = db.collection('test').doc('simple');
        
        try {
            await testRef.set({ test: true, timestamp: new Date() });
            console.log('✅ Write test successful');
            
            const doc = await testRef.get();
            console.log('✅ Read test successful:', doc.data());
            
            await testRef.delete();
            console.log('✅ Delete test successful');
            
        } catch (writeError) {
            console.error('❌ Write test failed:', writeError.message);
        }
        
    } catch (error) {
        console.error('❌ Simple test failed:', error.message);
    }
};

// Test referral system
window.testReferralSystem = async function() {
    console.log('=== TESTING REFERRAL SYSTEM ===');
    
    const { auth, db } = firebaseServices.initialize();
    if (!auth || !db) {
        console.error('❌ Firebase not initialized');
        return;
    }
    
    try {
        // Check if user is logged in
        const currentUser = auth.currentUser;
        if (!currentUser) {
            console.log('❌ No user logged in');
            return;
        }
        
        console.log('✅ User logged in:', currentUser.uid);
        
        // Get current user's referral code
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            console.log('✅ User referral code:', userData.referralCode);
            
            // Check direct referrals
            const referralsSnapshot = await db.collection('referrals')
                .where('referrerId', '==', currentUser.uid)
                .get();
            
            console.log(`✅ Direct referrals: ${referralsSnapshot.docs.length}`);
            
            if (referralsSnapshot.docs.length > 0) {
                referralsSnapshot.docs.forEach((doc, index) => {
                    const referral = doc.data();
                    console.log(`📋 Referral ${index + 1}:`, {
                        id: doc.id,
                        referredId: referral.referredId,
                        createdAt: referral.createdAt
                    });
                });
            }
        }
        
    } catch (error) {
        console.error('❌ Referral system test failed:', error.message);
    }
};