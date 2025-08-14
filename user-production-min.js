// The One Wealth Wave - Production User Portal
// Production Version - Debug code removed

// Global state management
const state = {
    currentUser: null,
    userData: null,
    isAuthenticated: false
};

// Utility functions
const utils = {
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type} show`;
        toast.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(message) : message;
        const toastContainer = document.getElementById('toastContainer');
        if (toastContainer) {
            toastContainer.appendChild(toast);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }
    },

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(amount || 0);
    },

    formatDate(timestamp) {
        if (!timestamp) return 'Never';
        if (timestamp.toDate) {
            return timestamp.toDate().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        return new Date(timestamp).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    createElement(tag, attributes = {}) {
        const element = document.createElement(tag);
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'class' || key === 'className') element.className = value;
            else if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), value);
            else element.setAttribute(key, value);
        });
        return element;
    },

    generateCSRFToken() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    },

    isToday(timestamp) {
        if (!timestamp) return false;
        const today = new Date().toDateString();
        if (timestamp.toDate) {
            return timestamp.toDate().toDateString() === today;
        }
        return new Date(timestamp).toDateString() === today;
    }
};

// Firebase services
const firebaseServices = {
    initialize() {
        if (typeof firebase === 'undefined') {
            utils.showToast('Firebase not loaded', 'error');
            return null;
        }
        return {
            auth: firebase.auth(),
            db: firebase.firestore(),
            storage: firebase.storage()
        };
    },

    async safeGet(ref) {
        try {
            return await ref.get();
        } catch (error) {
            utils.showToast('Database error: ' + error.message, 'error');
            throw error;
        }
    },

    async safeQuery(query) {
        try {
            return await query.get();
        } catch (error) {
            utils.showToast('Database error: ' + error.message, 'error');
            throw error;
        }
    },

    async safeAdd(collection, data) {
        try {
            return await collection.add(data);
        } catch (error) {
            utils.showToast('Database error: ' + error.message, 'error');
            throw error;
        }
    },

    async safeUpdate(ref, data) {
        try {
            return await ref.update(data);
        } catch (error) {
            utils.showToast('Database error: ' + error.message, 'error');
            throw error;
        }
    }
};

// Data handlers
const dataHandlers = {
    async loadUserData() {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) return;

        try {
            const userDoc = await firebaseServices.safeGet(db.collection('users').doc(state.currentUser.uid));
            if (userDoc.exists) {
                state.userData = userDoc.data();
                this.updateDashboard();
            }
        } catch (error) {
            utils.showToast('Failed to load user data', 'error');
        }
    },

    updateDashboard() {
        if (!state.userData) return;

        // Update balance displays
        const balanceElements = {
            userBalance: document.getElementById('userBalance'),
            totalDeposits: document.getElementById('totalDeposits'),
            totalIncome: document.getElementById('totalIncome'),
            totalIncomeCard: document.getElementById('totalIncomeCard'),
            levelIncome: document.getElementById('levelIncome'),
            roiIncome: document.getElementById('roiIncome'),
            todayIncome: document.getElementById('todayIncome')
        };

        const totalIncome = (state.userData.selfIncome || 0) + (state.userData.levelIncome || 0) + 
                           (state.userData.rewardIncome || 0) + (state.userData.roiIncome || 0);

        if (balanceElements.userBalance) {
            balanceElements.userBalance.textContent = utils.formatCurrency(totalIncome);
        }
        if (balanceElements.totalDeposits) {
            balanceElements.totalDeposits.textContent = utils.formatCurrency(state.userData.totalDeposits || 0);
        }
        if (balanceElements.totalIncome) {
            balanceElements.totalIncome.textContent = utils.formatCurrency(totalIncome);
        }
        if (balanceElements.totalIncomeCard) {
            balanceElements.totalIncomeCard.textContent = utils.formatCurrency(totalIncome);
        }
        if (balanceElements.levelIncome) {
            balanceElements.levelIncome.textContent = utils.formatCurrency(state.userData.levelIncome || 0);
        }
        if (balanceElements.roiIncome) {
            balanceElements.roiIncome.textContent = utils.formatCurrency(state.userData.roiIncome || 0);
        }
        if (balanceElements.todayIncome) {
            balanceElements.todayIncome.textContent = utils.formatCurrency(state.userData.todayIncome || 0);
        }

        // Update user info
        const userNameDisplay = document.getElementById('userNameDisplay');
        const userId = document.getElementById('userId');
        if (userNameDisplay) userNameDisplay.textContent = state.userData.name || 'User';
        if (userId) userId.textContent = state.currentUser.uid;

        // Update referral link
        const referralLink = document.getElementById('referralLink');
        if (referralLink) {
            referralLink.value = `${window.location.origin}/index.html?ref=${state.userData.referralCode || ''}`;
        }
    },

    async loadDeposits() {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) return;

        try {
            const depositsSnapshot = await firebaseServices.safeQuery(
                db.collection('deposits').where('userId', '==', state.currentUser.uid).orderBy('createdAt', 'desc')
            );

            const tbody = document.getElementById('depositHistory');
            if (!tbody) return;

            tbody.innerHTML = '';
            depositsSnapshot.docs.forEach(doc => {
                const data = doc.data();
                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>${utils.formatDate(data.createdAt)}</td>
                    <td>${utils.formatCurrency(data.amount)}</td>
                    <td>${data.method || 'N/A'}</td>
                    <td><span class="status ${data.status}">${data.status}</span></td>
                `;
            });
        } catch (error) {
            utils.showToast('Failed to load deposits', 'error');
        }
    },

    async loadWithdrawals() {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) return;

        try {
            const withdrawalsSnapshot = await firebaseServices.safeQuery(
                db.collection('withdrawals').where('userId', '==', state.currentUser.uid).orderBy('createdAt', 'desc')
            );

            const tbody = document.getElementById('withdrawalHistory');
            if (!tbody) return;

            tbody.innerHTML = '';
            withdrawalsSnapshot.docs.forEach(doc => {
                const data = doc.data();
                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>${utils.formatDate(data.createdAt)}</td>
                    <td>${data.type || 'N/A'}</td>
                    <td>${utils.formatCurrency(data.amount)}</td>
                    <td>${data.method || 'N/A'}</td>
                    <td><span class="status ${data.status}">${data.status}</span></td>
                `;
            });
        } catch (error) {
            utils.showToast('Failed to load withdrawals', 'error');
        }
    },

    async loadReferrals() {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) return;

        try {
            const referralsSnapshot = await firebaseServices.safeQuery(
                db.collection('referrals').where('referrerId', '==', state.currentUser.uid).orderBy('createdAt', 'desc')
            );

            const tbody = document.getElementById('referralsTableBody');
            if (!tbody) return;

            tbody.innerHTML = '';
            referralsSnapshot.docs.forEach(doc => {
                const data = doc.data();
                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>${data.referredName || 'N/A'}</td>
                    <td>${data.referredEmail || 'N/A'}</td>
                    <td>${data.referredMobile || 'N/A'}</td>
                    <td>${data.referredId || 'N/A'}</td>
                    <td>${utils.formatDate(data.createdAt)}</td>
                    <td><span class="status ${data.status || 'pending'}">${data.status || 'pending'}</span></td>
                    <td>${utils.formatCurrency(data.investment || 0)}</td>
                    <td>
                        <button onclick="dataHandlers.viewReferralDetails('${doc.id}')" class="btn-small">View</button>
                    </td>
                `;
            });
        } catch (error) {
            utils.showToast('Failed to load referrals', 'error');
        }
    },

    async loadAnalytics() {
        const { db } = firebaseServices.initialize();
        if (!db || !state.currentUser) return;

        try {
            const userDoc = await firebaseServices.safeGet(db.collection('users').doc(state.currentUser.uid));
            if (!userDoc.exists) return;

            const userData = userDoc.data();
            const accountCreatedAt = userData.createdAt?.toDate() || new Date();
            const accountAge = Math.floor((Date.now() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24));

            const depositsSnapshot = await firebaseServices.safeQuery(
                db.collection('deposits').where('userId', '==', state.currentUser.uid).where('status', '==', 'approved')
            );
            let totalDeposits = 0;
            depositsSnapshot.docs.forEach(doc => {
                totalDeposits += doc.data().amount || 0;
            });

            const referralsSnapshot = await firebaseServices.safeQuery(
                db.collection('referrals').where('referrerId', '==', state.currentUser.uid)
            );

            const analyticsElements = {
                totalDeposits: document.getElementById('analyticsTotalDeposits'),
                accountAge: document.getElementById('analyticsAccountAge'),
                totalReferrals: document.getElementById('analyticsTotalReferrals'),
                activeReferrals: document.getElementById('analyticsActiveReferrals'),
                referralIncome: document.getElementById('analyticsReferralIncome'),
                teamSize: document.getElementById('analyticsTeamSize'),
                referredBy: document.getElementById('analyticsReferredBy'),
                referrerCode: document.getElementById('analyticsReferrerCode'),
                referrerName: document.getElementById('analyticsReferrerName'),
                referralDate: document.getElementById('analyticsReferralDate')
            };

            if (analyticsElements.totalDeposits) {
                analyticsElements.totalDeposits.textContent = utils.formatCurrency(totalDeposits);
            }
            if (analyticsElements.accountAge) {
                analyticsElements.accountAge.textContent = `${accountAge} days`;
            }
            if (analyticsElements.totalReferrals) {
                analyticsElements.totalReferrals.textContent = referralsSnapshot.size;
            }
            if (analyticsElements.activeReferrals) {
                analyticsElements.activeReferrals.textContent = referralsSnapshot.size;
            }
            if (analyticsElements.referralIncome) {
                analyticsElements.referralIncome.textContent = utils.formatCurrency(userData.levelIncome || 0);
            }
            if (analyticsElements.teamSize) {
                analyticsElements.teamSize.textContent = referralsSnapshot.size;
            }

            const uplineInfo = {
                referredBy: userData.referredBy || 'None',
                referrerCode: userData.referrerCode || 'None',
                referrerName: userData.referrerName || 'None',
                referralDate: userData.referralDate ? utils.formatDate(userData.referralDate) : 'None'
            };

            if (analyticsElements.referredBy) {
                analyticsElements.referredBy.textContent = uplineInfo.referredBy;
            }
            if (analyticsElements.referrerCode) {
                analyticsElements.referrerCode.textContent = uplineInfo.referrerCode;
            }
            if (analyticsElements.referrerName) {
                analyticsElements.referrerName.textContent = uplineInfo.referrerName;
            }
            if (analyticsElements.referralDate) {
                analyticsElements.referralDate.textContent = uplineInfo.referralDate;
            }

            if (typeof Chart !== 'undefined' && dataHandlers.initAnalyticsChart) {
                await dataHandlers.initAnalyticsChart();
            }
        } catch (error) {
            utils.showToast('Failed to load analytics', 'error');
        }
    },

    async initAnalyticsChart() {
        const chartCanvas = document.getElementById('analyticsChart');
        if (!chartCanvas || typeof Chart === 'undefined') return;

        try {
            if (window.analyticsChart && typeof window.analyticsChart.destroy === 'function') {
                window.analyticsChart.destroy();
                window.analyticsChart = null;
            }

            const ctx = chartCanvas.getContext('2d');
            if (!ctx) return;
            
            const chartData = {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [{
                    label: 'Income',
                    data: [
                        state.userData?.selfIncome || 0, 
                        state.userData?.levelIncome || 0, 
                        state.userData?.roiIncome || 0, 
                        state.userData?.rewardIncome || 0, 
                        0, 
                        0
                    ],
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 2,
                    fill: false
                }]
            };

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
        } catch (error) {
            utils.showToast('Failed to initialize chart', 'error');
        }
    },

    destroyAllCharts() {
        if (window.analyticsChart && typeof window.analyticsChart.destroy === 'function') {
            window.analyticsChart.destroy();
            window.analyticsChart = null;
        }
    }
};

// Authentication handlers
const authHandlers = {
    async handleAuth(event) {
        event.preventDefault();
        
        const elements = {
            authForm: document.getElementById('authForm'),
            forgotPasswordForm: document.getElementById('forgotPasswordForm'),
            messageBox: document.getElementById('message'),
            email: document.getElementById('email')?.value,
            password: document.getElementById('password')?.value,
            name: document.getElementById('name')?.value,
            confirmPassword: document.getElementById('confirmPassword')?.value,
            country: document.getElementById('country')?.value,
            referralCode: document.getElementById('referralCode')?.value,
            forgotEmail: document.getElementById('forgotEmail')?.value
        };

        if (!elements.authForm || !elements.forgotPasswordForm || !elements.messageBox) {
            utils.showToast('Form elements not found', 'error');
            return;
        }

        const auth = firebaseServices.initialize()?.auth;
        if (!auth) {
            utils.showToast('Authentication service not available', 'error');
            return;
        }

        const isForgotPasswordForm = elements.forgotPasswordForm.style.display === 'block';

        try {
            if (isForgotPasswordForm) {
                if (!elements.forgotEmail) {
                    utils.showToast('Please enter your email', 'error');
                    return;
                }
                await auth.sendPasswordResetEmail(elements.forgotEmail);
                utils.showToast('Password reset email sent!', 'success');
                this.toggleForms('login');
            } else if (elements.authForm.dataset.mode === 'login') {
                if (!elements.email || !elements.password) {
                    utils.showToast('Please fill in email and password', 'error');
                    return;
                }
                await auth.signInWithEmailAndPassword(elements.email, elements.password);
                utils.showToast('Login successful!', 'success');
            } else {
                if (!elements.email || !elements.password || !elements.name || !elements.confirmPassword || !elements.country || !elements.referralCode) {
                    utils.showToast('Please fill in all required fields', 'error');
                    return;
                }
                if (elements.password !== elements.confirmPassword) {
                    utils.showToast('Passwords do not match', 'error');
                    return;
                }
                const userCredential = await auth.createUserWithEmailAndPassword(elements.email, elements.password);
                await this.createUserProfile(userCredential.user, elements);
                utils.showToast('Registration successful!', 'success');
            }
        } catch (error) {
            utils.showToast(error.message, 'error');
        }
    },

    async createUserProfile(user, formData) {
        const { db } = firebaseServices.initialize();
        if (!db) return;

        try {
            const userData = {
                uid: user.uid,
                name: formData.name,
                email: formData.email,
                country: formData.country,
                referralCode: this.generateReferralCode(),
                referredBy: formData.referralCode,
                createdAt: new Date(),
                isActive: true,
                selfIncome: 0,
                levelIncome: 0,
                rewardIncome: 0,
                roiIncome: 0,
                totalDeposits: 0,
                todayIncome: 0
            };

            await firebaseServices.safeAdd(db.collection('users'), userData);
            
            if (formData.referralCode) {
                await this.createReferralRecord(formData.referralCode, user.uid, formData.name, formData.email);
            }
        } catch (error) {
            utils.showToast('Failed to create user profile', 'error');
        }
    },

    generateReferralCode() {
        return 'REF' + Math.random().toString(36).substring(2, 8).toUpperCase();
    },

    async createReferralRecord(referralCode, userId, userName, userEmail) {
        const { db } = firebaseServices.initialize();
        if (!db) return;

        try {
            const referrerQuery = await firebaseServices.safeQuery(
                db.collection('users').where('referralCode', '==', referralCode)
            );

            if (!referrerQuery.empty) {
                const referrerDoc = referrerQuery.docs[0];
                const referrerData = referrerDoc.data();

                const referralData = {
                    referrerId: referrerDoc.id,
                    referrerCode: referralCode,
                    referrerName: referrerData.name,
                    referredId: userId,
                    referredName: userName,
                    referredEmail: userEmail,
                    createdAt: new Date(),
                    status: 'active'
                };

                await firebaseServices.safeAdd(db.collection('referrals'), referralData);
            }
        } catch (error) {
            utils.showToast('Failed to create referral record', 'error');
        }
    },

    toggleForms(mode) {
        const elements = {
            authForm: document.getElementById('authForm'),
            forgotPasswordForm: document.getElementById('forgotPasswordForm'),
            authTitle: document.getElementById('authTitle'),
            nameInput: document.getElementById('name'),
            confirmPasswordInput: document.getElementById('confirmPassword'),
            confirmPasswordHint: document.getElementById('confirmPasswordHint'),
            referralCodeInput: document.getElementById('referralCode'),
            referralCodeHint: document.getElementById('referralCodeHint'),
            countryInput: document.getElementById('country'),
            countryHint: document.getElementById('countryHint'),
            forgotPasswordToggle: document.getElementById('forgotPasswordToggle'),
            backToLogin: document.getElementById('backToLogin')
        };

        if (!elements.authForm || !elements.forgotPasswordForm || !elements.authTitle) {
            utils.showToast('Form elements not found', 'error');
            return;
        }

        elements.authForm.style.display = mode === 'forgot' ? 'none' : 'block';
        elements.forgotPasswordForm.style.display = mode === 'forgot' ? 'block' : 'none';
        elements.authTitle.textContent = mode === 'login' ? 'Login' : mode === 'register' ? 'Register' : 'Reset Password';

        if (mode === 'register') {
            elements.authForm.dataset.mode = 'register';
            if (elements.nameInput) elements.nameInput.style.display = 'block';
            if (elements.confirmPasswordInput) elements.confirmPasswordInput.style.display = 'block';
            if (elements.confirmPasswordHint) elements.confirmPasswordHint.style.display = 'block';
            if (elements.referralCodeInput) elements.referralCodeInput.style.display = 'block';
            if (elements.referralCodeHint) elements.referralCodeHint.style.display = 'block';
            if (elements.countryInput) elements.countryInput.style.display = 'block';
            if (elements.countryHint) elements.countryHint.style.display = 'block';
            if (elements.forgotPasswordToggle) elements.forgotPasswordToggle.style.display = 'none';
        } else {
            elements.authForm.dataset.mode = 'login';
            if (elements.nameInput) elements.nameInput.style.display = 'none';
            if (elements.confirmPasswordInput) elements.confirmPasswordInput.style.display = 'none';
            if (elements.confirmPasswordHint) elements.confirmPasswordHint.style.display = 'none';
            if (elements.referralCodeInput) elements.referralCodeInput.style.display = 'none';
            if (elements.referralCodeHint) elements.referralCodeHint.style.display = 'none';
            if (elements.countryInput) elements.countryInput.style.display = 'none';
            if (elements.countryHint) elements.countryHint.style.display = 'none';
            if (elements.forgotPasswordToggle) elements.forgotPasswordToggle.style.display = 'block';
        }
    }
};

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    const { auth } = firebaseServices.initialize();
    if (!auth) {
        utils.showToast('Authentication service not available', 'error');
        return;
    }

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            state.currentUser = user;
            state.isAuthenticated = true;
            await dataHandlers.loadUserData();
            showSection('dashboardSection');
        } else {
            state.currentUser = null;
            state.isAuthenticated = false;
            state.userData = null;
            showSection('authSection');
        }
    });

    // Initialize UI elements
    initializeUI();
});

function showSection(sectionId) {
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => section.classList.remove('active'));
    
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    if (sectionId === 'dashboardSection') {
        dataHandlers.loadUserData();
    } else if (sectionId === 'depositSection') {
        dataHandlers.loadDeposits();
    } else if (sectionId === 'withdrawalSection') {
        dataHandlers.loadWithdrawals();
    } else if (sectionId === 'referralsSection') {
        dataHandlers.loadReferrals();
    } else if (sectionId === 'analyticsSection') {
        dataHandlers.loadAnalytics();
    }
}

function initializeUI() {
    // Navigation
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = link.getAttribute('data-section');
            if (sectionId) {
                showSection(sectionId);
            }
        });
    });

    // Auth forms
    const authForm = document.getElementById('authForm');
    const authToggle = document.getElementById('authToggle');
    const forgotPasswordToggle = document.getElementById('forgotPasswordToggle');
    const backToLogin = document.getElementById('backToLogin');

    if (authForm) {
        authForm.addEventListener('submit', authHandlers.handleAuth);
    }
    if (authToggle) {
        authToggle.addEventListener('click', () => authHandlers.toggleForms('register'));
    }
    if (forgotPasswordToggle) {
        forgotPasswordToggle.addEventListener('click', () => authHandlers.toggleForms('forgot'));
    }
    if (backToLogin) {
        backToLogin.addEventListener('click', () => authHandlers.toggleForms('login'));
    }

    // Copy referral link
    const copyReferralBtn = document.getElementById('copyReferralBtn');
    if (copyReferralBtn) {
        copyReferralBtn.addEventListener('click', () => {
            const referralLink = document.getElementById('referralLink');
            if (referralLink) {
                navigator.clipboard.writeText(referralLink.value);
                utils.showToast('Referral link copied!', 'success');
            }
        });
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const { auth } = firebaseServices.initialize();
            if (auth) {
                await auth.signOut();
                utils.showToast('Logged out successfully', 'success');
            }
        });
    }
}
